import React, { useRef, useState, type DragEvent } from 'react'
import { audioDuration, dataUrl, encodeImageFile, makeContactSheet } from '../lib/images'
import { uid } from '../lib/ids'
import { labelsFor } from '../lib/systemPrompt'
import type { Action } from '../lib/store'
import type { Reference, StoryContext } from '../lib/types'
import { ContextPanel } from './ContextPanel'
import { Down, Film, Music, Plus, Trash, Up } from './Icons'

interface Props {
  references: Reference[]
  sentRefIds: string[]
  dispatch: (a: Action) => void
  onInsert: (ref: Reference) => void
  context: StoryContext
  contextSent: string | undefined
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
}

export function ReferenceRail({ references, sentRefIds, dispatch, onInsert, context, contextSent }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'references' | 'context'>('references')
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const labels = labelsFor(references)

  async function addFiles(files: FileList | File[]) {
    setError(null)
    for (const file of Array.from(files)) {
      setBusy((n) => n + 1)
      try {
        const common = { id: uid(), name: baseName(file.name), note: '', fileName: file.name, createdAt: Date.now() }
        if (file.type.startsWith('image/')) {
          const img = await encodeImageFile(file)
          dispatch({ type: 'addReference', ref: { ...common, kind: 'image', imageData: img.data, imageMediaType: img.mediaType } })
        } else if (file.type.startsWith('video/')) {
          const sheet = await makeContactSheet(file)
          dispatch({
            type: 'addReference',
            ref: { ...common, kind: 'video', imageData: sheet.data, imageMediaType: sheet.mediaType, durationSec: sheet.durationSec },
          })
        } else if (file.type.startsWith('audio/')) {
          const durationSec = await audioDuration(file)
          dispatch({ type: 'addReference', ref: { ...common, kind: 'audio', durationSec } })
        } else {
          setError(`Unsupported file: ${file.name}`)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy((n) => n - 1)
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
  }

  return (
    <aside
      className={`flex h-full w-[250px] shrink-0 xl:w-[300px] flex-col border-r border-line bg-panel ${dragOver ? 'ring-1 ring-inset ring-acid-dim' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex gap-1">
          <TabButton active={tab === 'references'} onClick={() => setTab('references')}>
            References{references.length > 0 && <span className="ml-1 text-fg-3">{references.length}</span>}
          </TabButton>
          <TabButton active={tab === 'context'} onClick={() => setTab('context')}>
            Context{context.text.trim() && <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${contextSent === context.text ? 'bg-fg-3' : 'bg-acid'}`} />}
          </TabButton>
        </div>
        {tab === 'references' && (
          <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy > 0}>
            <Plus /> Add
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {tab === 'context' && <ContextPanel context={context} sentText={contextSent} setContext={(c) => dispatch({ type: 'setContext', context: c })} />}

      {tab === 'references' && error && <div className="mx-3 mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">{error}</div>}

      {tab === 'references' && <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <div className="text-[11px] text-fg-3">Upload to Seedance in this order</div>
        {references.length === 0 && (
          <div className="rounded-md border border-dashed border-line-2 p-4 text-center text-xs text-fg-3">
            Drop images, videos, or audio here.
            <br />
            Name each one. The name becomes the subject in your prompt.
            <br />
            Click a label, or type @ in the message, to insert it.
          </div>
        )}
        {references.map((r, i) => (
          <ReferenceCard
            key={r.id}
            r={r}
            label={labels.get(r.id) ?? ''}
            sent={sentRefIds.includes(r.id)}
            isFirst={i === 0}
            isLast={i === references.length - 1}
            dispatch={dispatch}
            onInsert={() => onInsert(r)}
          />
        ))}
        {busy > 0 && <div className="text-center text-xs text-fg-3">Processing {busy} file{busy > 1 ? 's' : ''}…</div>}
      </div>}
    </aside>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${active ? 'bg-panel-2 text-fg' : 'text-fg-3 hover:text-fg-2'}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ReferenceCard({
  r,
  label,
  sent,
  isFirst,
  isLast,
  dispatch,
  onInsert,
}: {
  r: Reference
  label: string
  sent: boolean
  isFirst: boolean
  isLast: boolean
  dispatch: (a: Action) => void
  onInsert: () => void
}) {
  return (
    <div className="group rounded-md border border-line bg-panel-2">
      <div className="relative">
        {r.imageData ? (
          <img
            src={dataUrl(r.imageData, r.imageMediaType!)}
            alt={r.name}
            className="aspect-[4/3] w-full rounded-t-md object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-t-md bg-ink text-fg-3">
            <Music width={28} height={28} />
          </div>
        )}
        <button
          type="button"
          className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded border border-transparent bg-ink/85 px-1.5 py-0.5 font-mono text-[10px] text-acid hover:border-acid-dim"
          onClick={onInsert}
          title="Insert into message"
        >
          {r.kind === 'video' && <Film width={10} height={10} />}
          {r.kind === 'audio' && <Music width={10} height={10} />}
          {label}
          <span className="font-sans text-fg-2">· insert</span>
        </button>
        {r.durationSec !== undefined && (
          <div className="absolute right-1.5 top-1.5 rounded bg-ink/85 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{r.durationSec.toFixed(1)}s</div>
        )}
        {sent && <div className="absolute bottom-1.5 right-1.5 rounded bg-ink/85 px-1.5 py-0.5 text-[10px] text-fg-2">in chat</div>}
        <div className="absolute bottom-1.5 left-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" className="btn px-1.5 py-1" disabled={isFirst} onClick={() => dispatch({ type: 'moveReference', id: r.id, dir: -1 })} title="Move up">
            <Up />
          </button>
          <button type="button" className="btn px-1.5 py-1" disabled={isLast} onClick={() => dispatch({ type: 'moveReference', id: r.id, dir: 1 })} title="Move down">
            <Down />
          </button>
          <button type="button" className="btn px-1.5 py-1 hover:text-danger" onClick={() => dispatch({ type: 'removeReference', id: r.id })} title="Remove">
            <Trash />
          </button>
        </div>
      </div>
      <div className="space-y-1.5 p-2">
        <input
          className="field py-1 font-medium"
          value={r.name}
          placeholder="Name (e.g. Hero, Warehouse)"
          onChange={(e) => dispatch({ type: 'updateReference', id: r.id, patch: { name: e.target.value } })}
        />
        <input
          className="field py-1 text-xs"
          value={r.note}
          placeholder={r.kind === 'audio' ? 'Describe it (voice, dialogue, mood)' : 'Note (e.g. use only the jacket)'}
          onChange={(e) => dispatch({ type: 'updateReference', id: r.id, patch: { note: e.target.value } })}
        />
        <div className="truncate text-[10px] text-fg-3" title={r.fileName}>
          {r.fileName}
        </div>
      </div>
    </div>
  )
}
