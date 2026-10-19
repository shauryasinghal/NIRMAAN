import { ApiError, expireSession, refreshOnce } from './api'
import { env } from './env'
import { supabase } from './supabase'

/**
 * The assistant's reply arrives as Server-Sent Events over a POST, so neither EventSource (GET only, no Authorization header) nor Axios
 * (the browser adapter cannot read a response while it is still arriving) can be used. This is `fetch` + `ReadableStream`, with the same
 * bearer-token conventions as the Axios client. Events: meta · delta* · done | error.
 */
export type ChatRole = 'user' | 'assistant'
export interface ChatTurn { role: ChatRole; content: string }
export type ChatStreamEvent =
  | { type: 'meta'; requestId?: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; code: string; message: string; requestId?: string }

/** Mirrors the API's request limits (routers/chat.py) so the UI never sends a request that is certain to be rejected. */
export const CHAT_LIMITS = { messages: 20, messageChars: 2000, totalChars: 12_000 } as const

export const GENERIC_ERROR = 'Something went wrong. Please try again.'
const NETWORK_ERROR = "We couldn't reach the assistant. Check your connection and try again."
const INTERRUPTED = 'The connection was interrupted before the answer was finished.'

/** Incremental Server-Sent Events parser: feed it text as it arrives; it calls `onEvent` once per complete event. */
export function createSseParser(onEvent: (name: string, data: string) => void) {
  let buffer = ''
  let carry = ''          // a trailing "\r" may be the first half of "\r\n" split across two chunks
  const emit = (block: string) => {
    let name = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue            // blank line / comment (keep-alive)
      const i = line.indexOf(':')
      const field = i === -1 ? line : line.slice(0, i)
      let value = i === -1 ? '' : line.slice(i + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') name = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) onEvent(name, data.join('\n'))
  }
  const drain = () => {
    let at: number
    while ((at = buffer.indexOf('\n\n')) !== -1) { emit(buffer.slice(0, at)); buffer = buffer.slice(at + 2) }
  }
  return {
    push(text: string) {
      let t = carry + text
      carry = ''
      if (t.endsWith('\r')) { carry = '\r'; t = t.slice(0, -1) }
      buffer += t.replace(/\r\n?/g, '\n')
      drain()
    },
    flush() {
      buffer += carry.replace(/\r/g, '\n'); carry = ''
      drain()
      if (buffer.trim()) emit(buffer)
      buffer = ''
    },
  }
}

/** Control characters (except tab and newline) → spaces. Written as a loop, not a regex, so the intent is explicit and the linter stays quiet. */
const stripControls = (s: string) => Array.from(s, (c) => { const n = c.charCodeAt(0); return n < 9 || (n > 10 && n < 32) || n === 127 ? ' ' : c }).join('')
const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' ? stripControls(v).trim().slice(0, max) || undefined : undefined)

/** One SSE event → a typed event. Unknown event names are ignored (forward compatible); malformed data becomes a safe error. */
export function toChatEvent(name: string, raw: string): ChatStreamEvent | null {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { type: 'error', code: 'bad_stream', message: GENERIC_ERROR } }
  if (typeof parsed !== 'object' || parsed === null) return { type: 'error', code: 'bad_stream', message: GENERIC_ERROR }
  const o = parsed as Record<string, unknown>
  switch (name) {
    case 'meta': return { type: 'meta', requestId: str(o.requestId, 80) }
    case 'delta': return typeof o.text === 'string' ? { type: 'delta', text: o.text } : null
    case 'done': return { type: 'done', stopReason: str(o.stopReason, 40) ?? 'end_turn' }
    case 'error': return { type: 'error', code: str(o.code, 40) ?? 'server_error', message: str(o.message) ?? GENERIC_ERROR, requestId: str(o.requestId, 80) }
    default: return null
  }
}

/** A non-2xx response (sent before any streaming starts) → the API's error contract { error: { code, message, details?, requestId } }. */
async function apiErrorFrom(res: Response): Promise<ApiError> {
  let body: { error?: { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown } } | null = null
  try { body = await res.json() } catch { /* not JSON */ }
  const e = body?.error
  const details = (typeof e?.details === 'object' && e.details !== null ? { ...(e.details as Record<string, unknown>) } : {}) as Record<string, unknown>
  const retryAfter = Number(res.headers.get('Retry-After'))
  if (res.status === 429 && details.retryAfterSeconds === undefined && Number.isFinite(retryAfter) && retryAfter > 0) details.retryAfterSeconds = retryAfter
  return new ApiError(res.status, str(e?.code, 40) ?? 'server_error', str(e?.message) ?? GENERIC_ERROR, details, str(e?.requestId, 80))
}

async function post(turns: ChatTurn[], token: string | undefined, signal: AbortSignal): Promise<Response> {
  return fetch(`${env.apiUrl}/api/chat`, {
    method: 'POST', signal, credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages: turns }),         // the conversation and nothing else: no user id, no system text
  })
}

const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token

/**
 * POST the conversation and report events as they arrive. Resolves when the stream ends; resolves quietly if `signal` aborts.
 * Throws ApiError for failures before streaming starts (401 after one refresh, 429, 503, 422, network). Failures after it starts
 * are reported through `onEvent` as an `error` event, and a stream that stops without `done` or `error` is reported as one too.
 */
export async function streamChat(turns: ChatTurn[], onEvent: (e: ChatStreamEvent) => void, signal: AbortSignal): Promise<void> {
  try {
    let res: Response
    try {
      res = await post(turns, await accessToken(), signal)
      if (res.status === 401) {
        // Same convention as the Axios client: refresh the session once and retry; if that fails, the session is over.
        if (await refreshOnce()) res = await post(turns, await accessToken(), signal)
        if (res.status === 401) { await expireSession(); throw await apiErrorFrom(res) }
      }
    } catch (e) {
      if (signal.aborted || e instanceof ApiError) throw e
      throw new ApiError(0, 'network_error', NETWORK_ERROR)
    }
    if (!res.ok) throw await apiErrorFrom(res)

    let finished = false
    const parser = createSseParser((name, data) => {
      if (finished) return
      const ev = toChatEvent(name, data)
      if (!ev) return
      if (ev.type === 'done' || ev.type === 'error') finished = true
      onEvent(ev)
    })
    const reader = res.body?.getReader()
    if (!reader) { parser.push(await res.text()); parser.flush() }          // no streaming support: still works, just not incrementally
    else {
      const decoder = new TextDecoder()
      try {
        while (!finished) {
          const { done, value } = await reader.read()
          if (done) break
          parser.push(decoder.decode(value, { stream: true }))
        }
        if (!finished) { parser.push(decoder.decode()); parser.flush() }
      } catch {
        if (signal.aborted) return
        if (!finished) { finished = true; onEvent({ type: 'error', code: 'network_error', message: INTERRUPTED }) }
      } finally {
        reader.cancel().catch(() => undefined)
      }
    }
    if (!finished && !signal.aborted) onEvent({ type: 'error', code: 'stream_ended', message: INTERRUPTED })
  } catch (e) {
    if (signal.aborted) return
    throw e
  }
}
