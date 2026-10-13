import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { modelInfo } from './models'
import type { Effort, Usage } from './types'

export interface SendArgs {
  apiKey: string
  workspaceId?: string
  model: string
  effort: Effort
  fallback: boolean
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  signal?: AbortSignal
  onText?: (delta: string, snapshot: string) => void
  onThinking?: (delta: string, snapshot: string) => void
}

function withTrailingCacheBreakpoint(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || typeof last.content === 'string') return messages
  const blocks = last.content.map((b, i, arr) =>
    i === arr.length - 1 && (b.type === 'text' || b.type === 'image')
      ? { ...b, cache_control: { type: 'ephemeral' as const } }
      : b,
  )
  return [...messages.slice(0, -1), { ...last, content: blocks }]
}

/** One streamed turn. Resolves with the full final message (thinking blocks included). */
export async function sendTurn(args: SendArgs): Promise<Anthropic.Beta.BetaMessage> {
  const client = new Anthropic({
    apiKey: args.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    defaultHeaders: args.workspaceId ? { 'anthropic-workspace-id': args.workspaceId } : undefined,
  })
  const info = modelInfo(args.model)
  const useFallback = args.fallback && info.modern

  const params: BetaMessageStreamParams = {
    model: args.model,
    max_tokens: 32000,
    system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
    messages: withTrailingCacheBreakpoint(args.messages),
    ...(info.modern
      ? { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: args.effort } }
      : {}),
    ...(useFallback ? { fallbacks: 'default' as const, betas: ['server-side-fallback-2026-07-01'] } : {}),
  }

  const stream = client.beta.messages.stream(params, { signal: args.signal })
  if (args.onText) stream.on('text', args.onText)
  if (args.onThinking) stream.on('thinking', args.onThinking)
  return stream.finalMessage()
}

export interface ParsedResponse {
  text: string
  prompts: string[]
  notes: string
  thinking: string
  usage: Usage
  servedBy?: string
}

export function parseResponse(msg: Anthropic.Beta.BetaMessage): ParsedResponse {
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const thinking = msg.content
    .filter((b): b is Anthropic.Beta.BetaThinkingBlock => b.type === 'thinking')
    .map((b) => b.thinking)
    .join('\n\n')
  const { prompts, notes } = splitPrompts(text)
  const u = msg.usage
  const usage: Usage = {
    input: u.input_tokens,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens,
  }
  const fallbackRan = (u.iterations ?? []).some((it) => it.type === 'fallback_message')
  return { text, prompts, notes, thinking, usage, servedBy: fallbackRan ? msg.model : undefined }
}

export function splitPrompts(text: string): { prompts: string[]; notes: string } {
  const prompts: string[] = []
  const re = /<prompt>([\s\S]*?)<\/prompt>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) prompts.push(m[1].trim())
  const notes = text
    .replace(re, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { prompts, notes }
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid API key. Check Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a moment and try again.'
  if (err instanceof Anthropic.BadRequestError) {
    if (err.message.includes('anthropic-workspace-id')) {
      return 'This API key is not scoped to a workspace. Open Settings and enter your Workspace ID (find it in the Anthropic Console under Settings > Workspaces, it starts with wrkspc_).'
    }
    return `Bad request: ${err.message}`
  }
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the API. Check your connection.'
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ''}: ${err.message}`
  if (err instanceof DOMException && err.name === 'AbortError') return 'Stopped.'
  if (err instanceof Error) return err.message
  return String(err)
}
