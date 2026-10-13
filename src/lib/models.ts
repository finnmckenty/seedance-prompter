import type { Usage } from './types'

export interface ModelInfo {
  id: string
  label: string
  blurb: string
  /** USD per million tokens */
  input: number
  output: number
  cacheRead: number
  /** adaptive thinking + effort + server-side fallbacks are supported */
  modern: boolean
}

export const MODELS: ModelInfo[] = [
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', blurb: 'Most capable. Best vision on dense frames.', input: 10, output: 50, cacheRead: 0.25, modern: true },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', blurb: 'Strong and cheaper.', input: 4, output: 20, cacheRead: 0.2, modern: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', blurb: 'Fast everyday model.', input: 2, output: 10, cacheRead: 0.2, modern: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', blurb: 'Cheapest. Fine for quick drafts.', input: 1, output: 5, cacheRead: 0.1, modern: false },
]

export const DEFAULT_MODEL = 'claude-fable-5-1'

export function modelInfo(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}

export function costOf(modelId: string, u: Usage): number {
  const m = modelInfo(modelId)
  const perTok = (usd: number) => usd / 1_000_000
  return (
    u.input * perTok(m.input) +
    u.cacheWrite * perTok(m.input * 1.25) +
    u.cacheRead * perTok(m.cacheRead) +
    u.output * perTok(m.output)
  )
}

export function fmtUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}
