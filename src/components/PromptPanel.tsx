import { useEffect, useState } from 'react'
import { dataUrl } from '../lib/images'
import { labelsFor } from '../lib/systemPrompt'
import type { Reference } from '../lib/types'
import { CopyButton } from './CopyButton'

export interface PromptVersion {
  turnId: string
  version: number
  prompts: string[]
  createdAt: number
}

interface Props {
  versions: PromptVersion[]
  references: Reference[]
  onInsert: (ref: Reference) => void
}

export function PromptPanel({ versions, references, onInsert }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const latest = versions[versions.length - 1] ?? null
  const current = versions.find((v) => v.turnId === selected) ?? latest

  useEffect(() => {
    setSelected(null)
  }, [latest?.turnId])

  const labels = labelsFor(references)

  return (
    <aside className="flex h-full w-[320px] shrink-0 xl:w-[400px] flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <div className="label">Prompt</div>
          <div className="text-[11px] text-fg-3">{current ? `v${current.version} · ${current.prompts.join('\n\n').length} chars` : 'Nothing generated yet'}</div>
        </div>
        {current && <CopyButton text={current.prompts.join('\n\n')} label={current.prompts.length > 1 ? 'Copy all' : 'Copy'} className="btn-primary" />}
      </div>

      {versions.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
          {versions.map((v) => (
            <button
              key={v.turnId}
              type="button"
              className={`rounded px-2 py-0.5 font-mono text-[11px] ${v.turnId === current?.turnId ? 'bg-acid text-ink' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}
              onClick={() => setSelected(v.turnId)}
            >
              v{v.version}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {current ? (
          <div className="space-y-3 p-3">
            {current.prompts.map((p, i) => (
              <div key={i}>
                {current.prompts.length > 1 && (
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-acid">Step {i + 1}</span>
                    <CopyButton text={p} />
                  </div>
                )}
                <pre className="whitespace-pre-wrap rounded-md border border-line bg-ink px-3 py-2.5 font-sans text-[13px] leading-relaxed">{p}</pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-fg-3">The latest prompt appears here with a copy button. Earlier versions stay available.</div>
        )}
      </div>

      {references.length > 0 && (
        <div className="border-t border-line p-3">
          <div className="label mb-1.5">Upload order in Seedance</div>
          <ol className="space-y-1">
            {references.map((r) => (
              <li key={r.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-panel-2" onClick={() => onInsert(r)} title="Insert into message">
                {r.imageData ? (
                  <img src={dataUrl(r.imageData, r.imageMediaType!)} alt="" className="h-6 w-6 rounded-sm border border-line-2 object-cover" />
                ) : (
                  <span className="h-6 w-6 rounded-sm border border-line-2 bg-ink" />
                )}
                <span className="whitespace-nowrap font-mono text-acid">{labels.get(r.id)}</span>
                <span className="truncate text-fg-2">{r.name || 'Untitled'}</span>
                <span className="ml-auto truncate text-[10px] text-fg-3">{r.fileName}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  )
}
