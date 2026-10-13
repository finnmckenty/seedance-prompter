import { useState } from 'react'
import { Check, Copy } from './Icons'

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`btn ${done ? 'border-acid-dim text-acid' : ''} ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? 'Copied' : label}
    </button>
  )
}
