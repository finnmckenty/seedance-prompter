import { get, set } from 'idb-keyval'
import { useEffect, useReducer, useRef, useState } from 'react'
import { DEFAULT_MODEL } from './models'
import type { Conversation, PersistedData, Reference, Settings, StoryContext, Turn } from './types'
import { uid } from './ids'

const DATA_KEY = 'seedance-prompter:data'
const SETTINGS_KEY = 'seedance-prompter:settings'

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  workspaceId: '',
  model: DEFAULT_MODEL,
  effort: 'high',
  fallback: true,
  showThinking: false,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
    const envWorkspace = import.meta.env.VITE_ANTHROPIC_WORKSPACE_ID ?? ''
    return { ...DEFAULT_SETTINGS, ...saved, apiKey: saved.apiKey || envKey, workspaceId: saved.workspaceId || envWorkspace }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function newConversation(from?: Conversation): Conversation {
  const now = Date.now()
  return {
    id: uid(),
    title: 'New shot',
    createdAt: now,
    updatedAt: now,
    references: from ? from.references.map((r) => ({ ...r, id: uid() })) : [],
    context: from ? { ...from.context } : { text: '' },
    turns: [],
    sentRefIds: [],
    ledgerSignature: '',
  }
}

export type Action =
  | { type: 'hydrate'; data: PersistedData }
  | { type: 'addReference'; ref: Reference }
  | { type: 'updateReference'; id: string; patch: Partial<Reference> }
  | { type: 'removeReference'; id: string }
  | { type: 'moveReference'; id: string; dir: -1 | 1 }
  | { type: 'setContext'; context: StoryContext }
  | { type: 'newConversation' }
  | { type: 'selectConversation'; id: string }
  | { type: 'renameConversation'; id: string; title: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'appendTurn'; conversationId: string; turn: Turn; sentRefIds?: string[]; ledgerSignature?: string; contextSignature?: string }
  | { type: 'removeTurn'; conversationId: string; turnId: string }

const EMPTY: PersistedData = { conversations: [], activeConversationId: null }

function updateActive(state: PersistedData, fn: (c: Conversation) => Conversation): PersistedData {
  return { ...state, conversations: state.conversations.map((c) => (c.id === state.activeConversationId ? fn(c) : c)) }
}

function reducer(state: PersistedData, action: Action): PersistedData {
  switch (action.type) {
    case 'hydrate':
      return action.data
    case 'addReference':
      return updateActive(state, (c) => ({ ...c, references: [...c.references, action.ref] }))
    case 'updateReference':
      return updateActive(state, (c) => ({ ...c, references: c.references.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) }))
    case 'removeReference':
      return updateActive(state, (c) => ({ ...c, references: c.references.filter((r) => r.id !== action.id) }))
    case 'moveReference':
      return updateActive(state, (c) => {
        const i = c.references.findIndex((r) => r.id === action.id)
        const j = i + action.dir
        if (i < 0 || j < 0 || j >= c.references.length) return c
        const refs = [...c.references]
        ;[refs[i], refs[j]] = [refs[j], refs[i]]
        return { ...c, references: refs }
      })
    case 'setContext':
      return updateActive(state, (c) => ({ ...c, context: action.context }))
    case 'newConversation': {
      const current = state.conversations.find((c) => c.id === state.activeConversationId)
      const c = newConversation(current)
      return { ...state, conversations: [c, ...state.conversations], activeConversationId: c.id }
    }
    case 'selectConversation':
      return { ...state, activeConversationId: action.id }
    case 'renameConversation':
      return {
        ...state,
        conversations: state.conversations.map((c) => (c.id === action.id ? { ...c, title: action.title } : c)),
      }
    case 'deleteConversation': {
      const conversations = state.conversations.filter((c) => c.id !== action.id)
      const activeConversationId =
        state.activeConversationId === action.id ? (conversations[0]?.id ?? null) : state.activeConversationId
      return { ...state, conversations, activeConversationId }
    }
    case 'appendTurn':
      return {
        ...state,
        conversations: state.conversations.map((c) => {
          if (c.id !== action.conversationId) return c
          const firstReply = action.turn.role === 'assistant' && c.title === 'New shot'
          const firstUser = c.turns.find((t): t is Extract<Turn, { role: 'user' }> => t.role === 'user')
          return {
            ...c,
            title: firstReply && firstUser ? titleFrom(firstUser.text) : c.title,
            updatedAt: Date.now(),
            turns: [...c.turns, action.turn],
            sentRefIds: action.sentRefIds ? [...c.sentRefIds, ...action.sentRefIds] : c.sentRefIds,
            ledgerSignature: action.ledgerSignature ?? c.ledgerSignature,
            contextSignature: action.contextSignature ?? c.contextSignature,
          }
        }),
      }
    case 'removeTurn':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId ? { ...c, turns: c.turns.filter((t) => t.id !== action.turnId) } : c,
        ),
      }
  }
}

/** Bring older saved data up to the current shape: references and context live on each conversation. */
function migrate(data: PersistedData | undefined): PersistedData {
  const d: PersistedData = { ...EMPTY, ...(data ?? {}) }
  const legacyRefs = d.references ?? []
  const legacyContext = d.context ?? { text: '' }
  const conversations = d.conversations.map((c) => ({
    ...c,
    references: c.references ?? legacyRefs.map((r) => ({ ...r, id: r.id })),
    context: c.context ?? { ...legacyContext },
  }))
  if (conversations.length === 0) {
    const c = newConversation()
    c.references = legacyRefs
    c.context = legacyContext
    conversations.push(c)
  }
  const activeConversationId = conversations.some((c) => c.id === d.activeConversationId) ? d.activeConversationId : conversations[0].id
  return { conversations, activeConversationId }
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return 'New shot'
  return t.length > 48 ? `${t.slice(0, 47)}…` : t
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const [ready, setReady] = useState(false)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    get<PersistedData>(DATA_KEY).then((data) => {
      if (cancelled) return
      const hydrated = migrate(data)
      dispatch({ type: 'hydrate', data: hydrated })
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      set(DATA_KEY, state).catch((e) => console.error('persist failed', e))
    }, 400)
  }, [state, ready])

  const setSettings = (patch: Partial<Settings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }

  return { state, dispatch, ready, settings, setSettings }
}
