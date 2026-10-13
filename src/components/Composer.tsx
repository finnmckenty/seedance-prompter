import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from 'react'
import { dataUrl, encodeImageFile, imageFilesFrom } from '../lib/images'
import { uid } from '../lib/ids'
import { labelsFor } from '../lib/systemPrompt'
import type { Attachment, Reference } from '../lib/types'
import { Film, Music, Send, Stop, X } from './Icons'

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  setDraft: (s: string) => void
  attachments: Attachment[]
  setAttachments: (a: Attachment[]) => void
  references: Reference[]
  busy: boolean
  disabled: boolean
  disabledReason?: string
  placeholder: string
  onSend: () => void
  onStop: () => void
}

/** The text inserted for a reference: readable to you, unambiguous to the model. */
export function mentionText(ref: Reference, label: string): string {
  return `${ref.name.trim() || 'Untitled'} (${label})`
}

interface Pick {
  start: number
  query: string
}

export function Composer({ textareaRef, draft, setDraft, attachments, setAttachments, references, busy, disabled, disabledReason, placeholder, onSend, onStop }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [encoding, setEncoding] = useState(false)
  const [pick, setPick] = useState<Pick | null>(null)
  const [pickIndex, setPickIndex] = useState(0)
  const labels = labelsFor(references)

  const candidates = useMemo(() => {
    if (!pick) return []
    const q = pick.query.toLowerCase()
    return references.filter((r) => {
      const label = (labels.get(r.id) ?? '').toLowerCase().replace('@', '')
      return !q || r.name.toLowerCase().includes(q) || label.includes(q) || label.replace(' ', '').includes(q)
    })
  }, [pick, references, labels])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!draft) {
      el.style.height = ''
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [draft, textareaRef])

  useEffect(() => {
    setPickIndex(0)
  }, [pick?.query, pick?.start])

  function updatePick(value: string, caret: number) {
    const before = value.slice(0, caret)
    const m = /(^|\s)@([^\s@]*)$/.exec(before)
    setPick(m ? { start: caret - m[2].length - 1, query: m[2] } : null)
  }

  function choose(ref: Reference) {
    const el = textareaRef.current
    if (!pick || !el) return
    const caret = el.selectionStart ?? draft.length
    const text = mentionText(ref, labels.get(ref.id) ?? '')
    const next = `${draft.slice(0, pick.start)}${text} ${draft.slice(caret)}`
    setDraft(next)
    setPick(null)
    const pos = pick.start + text.length + 1
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  async function addImages(files: File[]) {
    if (!files.length) return
    setEncoding(true)
    try {
      const next: Attachment[] = []
      for (const f of files) {
        const img = await encodeImageFile(f)
        next.push({ id: uid(), data: img.data, mediaType: img.mediaType })
      }
      setAttachments([...attachments, ...next])
    } finally {
      setEncoding(false)
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = imageFilesFrom(e.clipboardData)
    if (files.length) {
      e.preventDefault()
      void addImages(files)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    void addImages(imageFilesFrom(e.dataTransfer))
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (pick && candidates.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPickIndex((i) => (i + 1) % candidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPickIndex((i) => (i - 1 + candidates.length) % candidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(candidates[pickIndex])
        return
      }
    }
    if (e.key === 'Escape' && pick) {
      e.preventDefault()
      setPick(null)
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!busy && canSend) onSend()
    }
  }

  const canSend = !disabled && !encoding && (draft.trim().length > 0 || attachments.length > 0)

  return (
    <div
      className={`border-t border-line bg-panel p-3 ${dragOver ? 'ring-1 ring-inset ring-acid-dim' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="group relative">
              <img src={dataUrl(a.data, a.mediaType)} alt="" className="h-16 w-16 rounded border border-line-2 object-cover" />
              <button
                type="button"
                className="absolute -right-1.5 -top-1.5 rounded-full border border-line-2 bg-ink p-0.5 text-fg-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                title="Remove"
              >
                <X width={10} height={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {pick && candidates.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1.5 w-[340px] overflow-hidden rounded-md border border-line-2 bg-panel-2 shadow-xl">
            <div className="border-b border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-3">Insert reference</div>
            {candidates.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${i === pickIndex ? 'bg-line text-fg' : 'text-fg-2 hover:bg-line/60'}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setPickIndex(i)}
              >
                {r.imageData ? (
                  <img src={dataUrl(r.imageData, r.imageMediaType!)} alt="" className="h-7 w-7 rounded-sm border border-line-2 object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-line-2 bg-ink text-fg-3">
                    <Music width={12} height={12} />
                  </span>
                )}
                <span className="flex-1 truncate">{r.name || 'Untitled'}</span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-acid">
                  {r.kind === 'video' && <Film width={10} height={10} />}
                  {labels.get(r.id)}
                </span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="field min-h-[44px] flex-1 resize-none py-2.5 leading-relaxed"
          rows={1}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            updatePick(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onClick={(e) => updatePick(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onBlur={() => setTimeout(() => setPick(null), 120)}
          onPaste={onPaste}
          onKeyDown={onKey}
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn h-[44px] px-3 hover:text-danger" onClick={onStop} title="Stop">
            <Stop /> Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary h-[44px] px-3" onClick={onSend} disabled={!canSend} title={disabledReason}>
            <Send /> Send
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-3">
        <span>
          <span className="kbd">⌘↵</span> send · <span className="kbd">@</span> insert a reference · paste or drop images for feedback
        </span>
        {encoding && <span>Encoding image…</span>}
        {disabled && disabledReason && <span className="text-danger">{disabledReason}</span>}
      </div>
    </div>
  )
}
