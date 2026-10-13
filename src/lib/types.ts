import type Anthropic from '@anthropic-ai/sdk'

export type RefKind = 'image' | 'video' | 'audio'
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Reference {
  id: string
  kind: RefKind
  name: string
  note: string
  fileName: string
  /** base64 image bytes: the image itself, or a contact sheet for a video. Absent for audio. */
  imageData?: string
  imageMediaType?: ImageMediaType
  durationSec?: number
  createdAt: number
}

export interface Attachment {
  id: string
  data: string
  mediaType: ImageMediaType
}

export interface Usage {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
}

export interface UserTurn {
  id: string
  role: 'user'
  text: string
  attachments: Attachment[]
  /** Materials ledger included with this turn, if the reference set changed. */
  ledger?: string
  /** True when this turn carried the story context (first send or an update). */
  contextSent?: boolean
  /** Labels and names of materials whose media was attached to this turn. */
  materials?: { label: string; name: string; refId: string }[]
  /** Exact blocks sent to the API. Replayed byte-for-byte on later turns. */
  apiContent: Anthropic.Beta.BetaContentBlockParam[]
  createdAt: number
}

export interface AssistantTurn {
  id: string
  role: 'assistant'
  /** Full response content (including thinking blocks), replayed unchanged. */
  content: Anthropic.Beta.BetaContentBlock[]
  text: string
  prompts: string[]
  notes: string
  thinking: string
  model: string
  servedBy?: string
  usage?: Usage
  cost?: number
  stopReason?: string | null
  createdAt: number
}

export type Turn = UserTurn | AssistantTurn

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: Turn[]
  /** Reference ids whose media has already been sent in this conversation. */
  sentRefIds: string[]
  /** The last materials ledger text sent, to detect changes. */
  ledgerSignature: string
  /** The last story context text sent, to detect changes. */
  contextSignature?: string
}

export interface Settings {
  apiKey: string
  workspaceId: string
  model: string
  effort: Effort
  fallback: boolean
  showThinking: boolean
}

export interface StoryContext {
  text: string
  fileName?: string
}

export interface PersistedData {
  references: Reference[]
  context: StoryContext
  conversations: Conversation[]
  activeConversationId: string | null
}
