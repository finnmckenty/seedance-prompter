import { useEffect, useRef } from 'react'
import { dataUrl } from '../lib/images'
import { fmtUsd, modelInfo } from '../lib/models'
import type { AssistantTurn, Conversation, Reference, Turn, UserTurn } from '../lib/types'
import { CopyButton } from './CopyButton'

export interface Streaming {
  conversationId: string
  text: string
  thinking: string
}

interface Props {
  conversation: Conversation
  references: Reference[]
  streaming: Streaming | null
  error: string | null
  showThinking: boolean
  versionOf: (turnId: string) => number | null
}

export function Chat({ conversation, references, streaming, error, showThinking, versionOf }: Props) {
  const bottom = useRef<HTMLDivElement>(null)
  const live = streaming?.conversationId === conversation.id ? streaming : null

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [conversation.turns.length, live?.text.length, live?.thinking.length])

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-[760px] space-y-5">
        {conversation.turns.length === 0 && !live && <EmptyState hasRefs={references.length > 0} />}
        {conversation.turns.map((t) => (
          <TurnView key={t.id} turn={t} references={references} showThinking={showThinking} version={t.role === 'assistant' ? versionOf(t.id) : null} />
        ))}
        {live && (
          <div className="space-y-2">
            {showThinking && live.thinking && <ThinkingBlock text={live.thinking} open />}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
              {live.text || <span className="text-fg-3">{live.thinking ? 'Writing…' : 'Thinking…'}</span>}
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-acid align-middle" />
            </div>
          </div>
        )}
        {error && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div ref={bottom} />
      </div>
    </div>
  )
}

function EmptyState({ hasRefs }: { hasRefs: boolean }) {
  return (
    <div className="mt-16 text-center">
      <div className="text-lg font-semibold">Describe the shot</div>
      <div className="mx-auto mt-2 max-w-[440px] text-sm leading-relaxed text-fg-2">
        {hasRefs ? (
          <>Your references are named and numbered. Say what happens, who does it, and what the ending state is. The prompt will map each reference by name.</>
        ) : (
          <>Add references on the left, or start with a text-only idea. After a generation, paste the result here and say what went wrong to get a revised prompt.</>
        )}
      </div>
    </div>
  )
}

function TurnView({ turn, references, showThinking, version }: { turn: Turn; references: Reference[]; showThinking: boolean; version: number | null }) {
  return turn.role === 'user' ? <UserView t={turn} references={references} /> : <AssistantView t={turn} showThinking={showThinking} version={version} />
}

function UserView({ t, references }: { t: UserTurn; references: Reference[] }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-lg border border-line bg-panel px-3.5 py-3">
      {t.materials && t.materials.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {t.materials.map((m) => {
            const r = references.find((x) => x.id === m.refId)
            return (
              <div key={m.refId} className="flex items-center gap-1.5 rounded border border-line-2 bg-ink py-0.5 pl-0.5 pr-2 text-[11px]">
                {r?.imageData ? <img src={dataUrl(r.imageData, r.imageMediaType!)} alt="" className="h-5 w-5 rounded-sm object-cover" /> : <span className="w-1" />}
                <span className="font-mono text-acid">{m.label}</span>
                <span className="text-fg-2">{m.name}</span>
              </div>
            )
          })}
        </div>
      )}
      {(t.contextSent || (t.ledger && (!t.materials || t.materials.length === 0))) && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-fg-3">
          {t.contextSent && <span className="rounded border border-line-2 bg-ink px-1.5 py-0.5">Story context included</span>}
          {t.ledger && (!t.materials || t.materials.length === 0) && <span className="rounded border border-line-2 bg-ink px-1.5 py-0.5">Materials updated</span>}
        </div>
      )}
      {t.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {t.attachments.map((a) => (
            <img key={a.id} src={dataUrl(a.data, a.mediaType)} alt="" className="max-h-40 rounded border border-line-2 object-cover" />
          ))}
        </div>
      )}
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{t.text}</div>
    </div>
  )
}

function AssistantView({ t, showThinking, version }: { t: AssistantTurn; showThinking: boolean; version: number | null }) {
  const info = modelInfo(t.model)
  return (
    <div className="space-y-2.5">
      {showThinking && t.thinking && <ThinkingBlock text={t.thinking} />}
      {t.prompts.map((p, i) => (
        <PromptCard key={i} text={p} title={t.prompts.length > 1 ? `Step ${i + 1}` : version ? `Prompt v${version}` : 'Prompt'} />
      ))}
      {t.notes && <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{t.notes}</div>}
      {t.stopReason === 'max_tokens' && <div className="text-xs text-danger">Response was cut off at the output limit.</div>}
      <div className="flex items-center gap-2 text-[11px] text-fg-3">
        <span>{t.servedBy ? `${modelInfo(t.servedBy).label} (fallback)` : info.label}</span>
        {t.usage && (
          <>
            <span>·</span>
            <span title={`in ${t.usage.input} · cache write ${t.usage.cacheWrite} · cache read ${t.usage.cacheRead} · out ${t.usage.output}`}>
              {t.cost !== undefined ? fmtUsd(t.cost) : ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function PromptCard({ text, title }: { text: string; title: string }) {
  return (
    <div className="rounded-lg border border-acid/30 bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-acid">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="whitespace-pre-wrap px-3 py-2.5 font-sans text-sm leading-relaxed">{text}</pre>
    </div>
  )
}

function ThinkingBlock({ text, open = false }: { text: string; open?: boolean }) {
  return (
    <details open={open} className="rounded-md border border-line bg-panel/60 text-xs text-fg-3">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-fg-2">Thinking</summary>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap px-3 pb-2.5 leading-relaxed">{text}</div>
    </details>
  )
}
