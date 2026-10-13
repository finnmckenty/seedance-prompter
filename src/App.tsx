import type Anthropic from '@anthropic-ai/sdk'
import { useMemo, useRef, useState } from 'react'
import { Chat, type Streaming } from './components/Chat'
import { Composer, mentionText } from './components/Composer'
import { Gear, Plus, Trash } from './components/Icons'
import { PromptPanel, type PromptVersion } from './components/PromptPanel'
import { ReferenceRail } from './components/ReferenceRail'
import { SettingsDialog } from './components/SettingsDialog'
import { describeError, parseResponse, sendTurn } from './lib/claude'
import { uid } from './lib/ids'
import { MODELS, costOf, fmtUsd, modelInfo } from './lib/models'
import { useStore } from './lib/store'
import { buildContextBlock, buildLedger, buildSystemPrompt, labelsFor } from './lib/systemPrompt'
import type { AssistantTurn, Attachment, Conversation, Effort, Reference, UserTurn } from './lib/types'
import skillRaw from './skill/sd25-pe.md?raw'

const SKILL_VERSION = /skill_version:\s*([\d.]+)/.exec(skillRaw)?.[1] ?? '?'
const SYSTEM_PROMPT = buildSystemPrompt()
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export default function App() {
  const { state, dispatch, ready, settings, setSettings } = useStore()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [streaming, setStreaming] = useState<Streaming | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const conversation: Conversation | undefined = state.conversations.find((c) => c.id === state.activeConversationId) ?? state.conversations[0]

  const versions: PromptVersion[] = useMemo(() => {
    if (!conversation) return []
    let n = 0
    return conversation.turns
      .filter((t): t is AssistantTurn => t.role === 'assistant' && t.prompts.length > 0)
      .map((t) => ({ turnId: t.id, version: ++n, prompts: t.prompts, createdAt: t.createdAt }))
  }, [conversation])

  const conversationCost = useMemo(
    () => conversation?.turns.reduce((sum, t) => sum + (t.role === 'assistant' ? (t.cost ?? 0) : 0), 0) ?? 0,
    [conversation],
  )

  if (!ready || !conversation) return <div className="flex h-full items-center justify-center text-fg-3">Loading…</div>

  const busy = streaming !== null
  const noKey = !settings.apiKey

  function insertReference(ref: Reference) {
    const label = labelsFor(state.references).get(ref.id) ?? ''
    const el = textareaRef.current
    const text = mentionText(ref, label)
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const before = draft.slice(0, start)
    const after = draft.slice(end)
    const lead = before && !/\s$/.test(before) ? ' ' : ''
    const trail = after && !/^\s/.test(after) ? ' ' : ''
    const next = `${before}${lead}${text}${trail}${after}`
    setDraft(next)
    const pos = before.length + lead.length + text.length + trail.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  async function send() {
    if (!conversation || busy) return
    const text = draft.trim() || (attachments.length ? 'See the attached image(s).' : '')
    if (!text) return
    setError(null)

    const refs = state.references
    const labels = labelsFor(refs)
    const ledger = buildLedger(refs)
    const ledgerChanged = conversation.turns.length === 0 || ledger !== conversation.ledgerSignature
    const newRefs = refs.filter((r) => r.imageData && !conversation.sentRefIds.includes(r.id))

    const contextText = state.context.text.trim() ? state.context.text : ''
    const contextChanged = contextText !== '' && contextText !== (conversation.contextSignature ?? '')

    const blocks: Anthropic.Beta.BetaContentBlockParam[] = []
    if (contextChanged) blocks.push({ type: 'text', text: buildContextBlock(contextText) })
    if (ledgerChanged) blocks.push({ type: 'text', text: ledger })
    for (const r of newRefs) {
      blocks.push({ type: 'text', text: `${labels.get(r.id)} — "${r.name || 'Untitled'}"${r.kind === 'video' ? ' (contact sheet)' : ''}:` })
      blocks.push({ type: 'image', source: { type: 'base64', media_type: r.imageMediaType!, data: r.imageData! } })
    }
    if (attachments.length) {
      blocks.push({ type: 'text', text: `Attached ${attachments.length} feedback image${attachments.length > 1 ? 's' : ''} (not materials):` })
      for (const a of attachments) blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })
    }
    blocks.push({ type: 'text', text })

    const userTurn: UserTurn = {
      id: uid(),
      role: 'user',
      text,
      attachments,
      ledger: ledgerChanged ? ledger : undefined,
      contextSent: contextChanged || undefined,
      materials: newRefs.map((r) => ({ label: labels.get(r.id)!, name: r.name || 'Untitled', refId: r.id })),
      apiContent: blocks,
      createdAt: Date.now(),
    }
    dispatch({ type: 'appendTurn', conversationId: conversation.id, turn: userTurn })

    const info = modelInfo(settings.model)
    const messages: Anthropic.Beta.BetaMessageParam[] = [...conversation.turns, userTurn].map((t) =>
      t.role === 'user'
        ? { role: 'user', content: t.apiContent }
        : { role: 'assistant', content: info.modern ? t.content : t.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') },
    )

    const savedDraft = draft
    const savedAttachments = attachments
    setDraft('')
    setAttachments([])
    setStreaming({ conversationId: conversation.id, text: '', thinking: '' })
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const msg = await sendTurn({
        apiKey: settings.apiKey,
        workspaceId: settings.workspaceId,
        model: settings.model,
        effort: settings.effort,
        fallback: settings.fallback,
        system: SYSTEM_PROMPT,
        messages,
        signal: controller.signal,
        onText: (_d, snapshot) => setStreaming((s) => (s ? { ...s, text: snapshot } : s)),
        onThinking: (_d, snapshot) => setStreaming((s) => (s ? { ...s, thinking: snapshot } : s)),
      })
      if (msg.stop_reason === 'refusal') {
        const why = msg.stop_details?.type === 'refusal' ? msg.stop_details.explanation : undefined
        throw new Error(why ? `The model declined this request: ${why}` : 'The model declined this request.')
      }
      const parsed = parseResponse(msg)
      const turn: AssistantTurn = {
        id: uid(),
        role: 'assistant',
        content: msg.content,
        text: parsed.text,
        prompts: parsed.prompts,
        notes: parsed.notes,
        thinking: parsed.thinking,
        model: settings.model,
        servedBy: parsed.servedBy,
        usage: parsed.usage,
        cost: costOf(parsed.servedBy ?? settings.model, parsed.usage),
        stopReason: msg.stop_reason,
        createdAt: Date.now(),
      }
      dispatch({
        type: 'appendTurn',
        conversationId: conversation.id,
        turn,
        sentRefIds: newRefs.map((r) => r.id),
        ledgerSignature: ledgerChanged ? ledger : undefined,
        contextSignature: contextChanged ? contextText : undefined,
      })
    } catch (e) {
      dispatch({ type: 'removeTurn', conversationId: conversation.id, turnId: userTurn.id })
      setDraft(savedDraft)
      setAttachments(savedAttachments)
      setError(describeError(e))
    } finally {
      abortRef.current = null
      setStreaming(null)
    }
  }

  const ledgerStale = conversation.turns.length > 0 && buildLedger(state.references) !== conversation.ledgerSignature
  const contextStale = conversation.turns.length > 0 && state.context.text.trim() !== '' && state.context.text !== (conversation.contextSignature ?? '')

  return (
    <div className="flex h-full min-w-[1080px] flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <div className="flex items-center gap-2 pr-2">
          <span className="rounded bg-acid px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">SD</span>
          <span className="whitespace-nowrap text-sm font-semibold">Seedance Prompter</span>
        </div>

        <div className="flex items-center gap-1 border-l border-line pl-3">
          <select
            className="field w-[160px] py-1 xl:w-[220px]"
            value={conversation.id}
            onChange={(e) => {
              dispatch({ type: 'selectConversation', id: e.target.value })
              setError(null)
            }}
          >
            {state.conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'newConversation' })} title="New shot">
            <Plus /> New
          </button>
          <button
            type="button"
            className="btn btn-ghost hover:text-danger"
            title="Delete this chat"
            onClick={() => {
              if (conversation.turns.length === 0 || window.confirm('Delete this chat and its prompt versions?')) {
                dispatch({ type: 'deleteConversation', id: conversation.id })
                if (state.conversations.length === 1) dispatch({ type: 'newConversation' })
              }
            }}
          >
            <Trash />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {conversationCost > 0 && <span className="font-mono text-[11px] text-fg-3" title="Estimated API cost for this chat">{fmtUsd(conversationCost)}</span>}
          <select className="field w-auto py-1" value={settings.model} onChange={(e) => setSettings({ model: e.target.value })} title="Model">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            className="field w-auto py-1"
            value={settings.effort}
            disabled={!modelInfo(settings.model).modern}
            onChange={(e) => setSettings({ effort: e.target.value as Effort })}
            title="Effort (thinking depth)"
          >
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                effort: {e}
              </option>
            ))}
          </select>
          <button type="button" className={`btn ${noKey ? 'border-acid text-acid' : ''}`} onClick={() => setShowSettings(true)}>
            <Gear /> {noKey ? 'Add API key' : 'Settings'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ReferenceRail
          references={state.references}
          sentRefIds={conversation.sentRefIds}
          dispatch={dispatch}
          onInsert={insertReference}
          context={state.context}
          contextSent={conversation.contextSignature}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-ink">
          {(ledgerStale || contextStale) && (
            <div className="border-b border-line bg-panel px-4 py-1.5 text-[11px] text-fg-2">
              {ledgerStale && contextStale
                ? 'References and story context changed since the last prompt. Both updates go out with your next message.'
                : ledgerStale
                  ? 'References changed since the last prompt. The updated list goes out with your next message, and the prompt will be renumbered to match.'
                  : 'Story context changed since the last prompt. The update goes out with your next message.'}
            </div>
          )}
          <Chat
            conversation={conversation}
            references={state.references}
            streaming={streaming}
            error={error}
            showThinking={settings.showThinking}
            versionOf={(id) => versions.find((v) => v.turnId === id)?.version ?? null}
          />
          <Composer
            textareaRef={textareaRef}
            references={state.references}
            draft={draft}
            setDraft={setDraft}
            attachments={attachments}
            setAttachments={setAttachments}
            busy={busy}
            disabled={noKey}
            disabledReason={noKey ? 'Add your API key in Settings to start.' : undefined}
            placeholder={
              conversation.turns.length === 0
                ? 'Describe the shot: who, what happens, where, how it ends.'
                : 'Paste a frame from the result and say what went wrong.'
            }
            onSend={() => void send()}
            onStop={() => abortRef.current?.abort()}
          />
        </main>

        <PromptPanel versions={versions} references={state.references} onInsert={insertReference} />
      </div>

      {showSettings && <SettingsDialog settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} skillVersion={SKILL_VERSION} />}
    </div>
  )
}
