import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { CHAT_LIMITS, GENERIC_ERROR, streamChat, type ChatStreamEvent, type ChatTurn } from '../../lib/chatStream'
import { useAuth } from '../../context/AuthContext'

export interface ChatFailure { message: string; code: string; requestId?: string; retryAfterSeconds?: number }
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'stopped' | 'error'
  failure?: ChatFailure
}

/** What is actually sent: oldest turns are dropped until the conversation fits the API's limits and starts with the student. */
export function windowForSend(turns: ChatTurn[]): ChatTurn[] {
  const size = (t: ChatTurn[]) => t.reduce((n, m) => n + m.content.length, 0)
  let t = turns.slice(-CHAT_LIMITS.messages)
  while (t.length > 1 && (size(t) > CHAT_LIMITS.totalChars || t[0].role !== 'user')) t = t.slice(1)
  return t
}

const toTurns = (ms: ChatMessage[]): ChatTurn[] => ms.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content }))

function failureOf(e: unknown): ChatFailure {
  if (e instanceof ApiError) {
    const retry = Number(e.details?.retryAfterSeconds)
    return { message: e.message, code: e.code, requestId: e.requestId, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined }
  }
  return { message: GENERIC_ERROR, code: 'client_error' }       // never show a raw exception message
}

/**
 * The conversation lives in React memory ONLY — nothing is written to localStorage, sessionStorage, cookies or the server.
 * It is cleared (and any request in flight is aborted) on sign-out, on a change of user, on "New chat" and when the app shell unmounts.
 */
export function useChat() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const messagesRef = useRef<ChatMessage[]>([])         // source of truth, so quick consecutive calls never see stale state
  const abortRef = useRef<AbortController | null>(null)
  const seq = useRef(0)

  const update = useCallback((fn: (ms: ChatMessage[]) => ChatMessage[]) => { messagesRef.current = fn(messagesRef.current); setMessages(messagesRef.current) }, [])
  const abort = useCallback(() => { abortRef.current?.abort(); abortRef.current = null }, [])
  const nextId = () => `m${++seq.current}`

  const run = useCallback(async (turns: ChatTurn[], assistantId: string) => {
    const ctl = new AbortController()
    abortRef.current = ctl
    setStreaming(true)
    const live = () => abortRef.current === ctl                      // false once stopped, reset or unmounted: late events are ignored
    const patch = (fn: (m: ChatMessage) => ChatMessage) => { if (live()) update((ms) => ms.map((m) => (m.id === assistantId ? fn(m) : m))) }
    const finish = () => { if (live()) { abortRef.current = null; setStreaming(false) } }
    const onEvent = (e: ChatStreamEvent) => {
      if (e.type === 'delta') patch((m) => ({ ...m, content: m.content + e.text }))
      else if (e.type === 'done') { patch((m) => ({ ...m, status: 'done' })); finish() }
      else if (e.type === 'error') { patch((m) => ({ ...m, status: 'error', failure: { message: e.message, code: e.code, requestId: e.requestId } })); finish() }
    }
    try { await streamChat(turns, onEvent, ctl.signal) }
    catch (e) { patch((m) => ({ ...m, status: 'error', failure: failureOf(e) })) }
    finally { finish() }
  }, [update])

  const start = useCallback((base: ChatMessage[]) => {
    const assistant: ChatMessage = { id: nextId(), role: 'assistant', content: '', status: 'streaming' }
    update(() => [...base, assistant])
    void run(windowForSend(toTurns(base)), assistant.id)
  }, [run, update])

  const send = useCallback((raw: string): boolean => {
    const text = raw.trim().slice(0, CHAT_LIMITS.messageChars)
    if (!text || abortRef.current) return false                        // one answer at a time
    start([...messagesRef.current, { id: nextId(), role: 'user', content: text, status: 'done' }])
    return true
  }, [start])

  /** Re-ask after a failure: the failed reply is dropped and the same conversation is sent again. */
  const retry = useCallback(() => {
    const ms = messagesRef.current
    const last = ms[ms.length - 1]
    if (abortRef.current || !last || last.role !== 'assistant' || last.status !== 'error') return
    start(ms.slice(0, -1))
  }, [start])

  const stop = useCallback(() => {
    if (!abortRef.current) return
    abort()
    update((ms) => ms.map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m)))
    setStreaming(false)
  }, [abort, update])

  const reset = useCallback(() => { abort(); update(() => []); setStreaming(false) }, [abort, update])

  useEffect(() => () => abort(), [abort])                               // unmount (the shell is gone on sign-out): nothing may keep streaming
  const lastUser = useRef(userId)
  useEffect(() => {
    if (lastUser.current !== userId) { lastUser.current = userId; reset() }      // signed out, or a different person signed in
  }, [userId, reset])

  const last = messages[messages.length - 1]
  return { messages, streaming, send, stop, retry, reset, canRetry: !streaming && last?.role === 'assistant' && last.status === 'error' }
}
