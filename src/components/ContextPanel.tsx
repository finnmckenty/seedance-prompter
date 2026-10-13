import { useRef } from 'react'
import type { StoryContext } from '../lib/types'
import { Trash } from './Icons'

interface Props {
  context: StoryContext
  sentText: string | undefined
  setContext: (c: StoryContext) => void
}

const PLACEHOLDER = `The bigger picture for this project. Every new chat starts with it.

Logline and where scenes sit in the story.
Characters: bios, relationships, secrets. Use the same names as your references.
Visual language: era, palette, lighting, lens and camera habits, pacing.
Audio and dialogue: language, accents, narration.
Things to avoid.`

export function ContextPanel({ context, sentText, setContext }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const words = context.text.trim() ? context.text.trim().split(/\s+/).length : 0
  const status = !context.text.trim()
    ? 'Empty. Nothing is sent.'
    : sentText === undefined
      ? 'Goes out with your next message.'
      : sentText === context.text
        ? 'In this chat.'
        : 'Changed. The update goes out with your next message.'

  async function loadFile(file: File) {
    const text = await file.text()
    setContext({ text, fileName: file.name })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="text-[11px] text-fg-3">
          {words.toLocaleString()} words · ~{Math.round(words * 1.4).toLocaleString()} tokens
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Load file
          </button>
          <button
            type="button"
            className="btn btn-ghost hover:text-danger"
            disabled={!context.text}
            title="Clear"
            onClick={() => {
              if (window.confirm('Clear the story context?')) setContext({ text: '' })
            }}
          >
            <Trash />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void loadFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <textarea
        className="field min-h-0 flex-1 resize-none rounded-none border-0 px-3 py-2.5 text-[13px] leading-relaxed focus:shadow-none"
        value={context.text}
        placeholder={PLACEHOLDER}
        spellCheck
        onChange={(e) => setContext({ ...context, text: e.target.value })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0]
          if (f && (f.type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(f.name))) {
            e.preventDefault()
            void loadFile(f)
          }
        }}
      />
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-fg-3">
        <span className={sentText !== undefined && sentText !== context.text && context.text.trim() ? 'text-acid' : ''}>{status}</span>
        {context.fileName && (
          <span className="truncate pl-2" title={context.fileName}>
            {context.fileName}
          </span>
        )}
      </div>
    </div>
  )
}
