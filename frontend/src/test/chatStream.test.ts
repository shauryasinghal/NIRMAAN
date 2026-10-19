import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ getSession: vi.fn(), refreshOnce: vi.fn(), expireSession: vi.fn(), fetch: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: h.getSession } } }))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), refreshOnce: h.refreshOnce, expireSession: h.expireSession }))
import { ApiError } from '../lib/api'
import { createSseParser, streamChat, toChatEvent, type ChatStreamEvent } from '../lib/chatStream'

const enc = new TextEncoder()
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const GOOD = frame('meta', { requestId: 'req-1' }) + frame('delta', { text: 'Hel' }) + frame('delta', { text: 'lo' }) + frame('done', { stopReason: 'end_turn' })

/** A streamed Response from byte chunks. `hang` keeps the stream open, and errors it if the request's signal aborts (as a real fetch does). */
function streamed(chunks: (string | Uint8Array)[], opts: { status?: number; hang?: AbortSignal } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch)
      if (opts.hang) opts.hang.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
      else c.close()
    },
  })
  return new Response(body, { status: opts.status ?? 200, headers: { 'Content-Type': 'text/event-stream' } })
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const bytes = (s: string, size: number) => { const b = enc.encode(s); return Array.from({ length: Math.ceil(b.length / size) }, (_, i) => b.slice(i * size, (i + 1) * size)) }

async function run(turns = [{ role: 'user' as const, content: 'hi' }], signal = new AbortController().signal) {
  const events: ChatStreamEvent[] = []
  await streamChat(turns, (e) => events.push(e), signal)
  return events
}

beforeEach(() => {
  h.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok-1' } } })
  h.refreshOnce.mockReset(); h.expireSession.mockReset(); h.fetch.mockReset()
  vi.stubGlobal('fetch', h.fetch)
})
afterEach(() => vi.unstubAllGlobals())

describe('streamChat', () => {
  it('POSTs only the conversation, with the current bearer token, and reports meta → delta → done as they are parsed', async () => {
    h.fetch.mockResolvedValue(streamed([GOOD]))
    const events = await run()
    expect(events).toEqual([{ type: 'meta', requestId: 'req-1' }, { type: 'delta', text: 'Hel' }, { type: 'delta', text: 'lo' }, { type: 'done', stopReason: 'end_turn' }])
    const [url, init] = h.fetch.mock.calls[0]
    expect(url).toBe('/api/chat')
    expect(init.method).toBe('POST'); expect(init.credentials).toBe('omit')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'Content-Type': 'application/json', Accept: 'text/event-stream' })
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'hi' }] })           // nothing else: no user id, no system text
  })

  it('delivers each delta as soon as its chunk arrives, not at the end', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const body = new ReadableStream<Uint8Array>({ async start(c) { c.enqueue(enc.encode(frame('delta', { text: 'first' }))); await gate; c.enqueue(enc.encode(frame('done', {}))); c.close() } })
    h.fetch.mockResolvedValue(new Response(body, { status: 200 }))
    const seen: string[] = []
    const p = streamChat([{ role: 'user', content: 'hi' }], (e) => seen.push(e.type), new AbortController().signal)
    await vi.waitFor(() => expect(seen).toEqual(['delta']))                                            // arrived while the stream is still open
    release(); await p
    expect(seen).toEqual(['delta', 'done'])
  })

  it('copes with events split across chunks, CRLF line endings and multi-byte characters cut in half', async () => {
    const text = 'héllo 🙂 wörld'
    const payload = (frame('delta', { text }) + frame('done', {})).replace(/\n/g, '\r\n')
    h.fetch.mockResolvedValue(streamed(bytes(payload, 3)))
    const events = await run()
    expect(events).toEqual([{ type: 'delta', text }, { type: 'done', stopReason: 'end_turn' }])
  })

  it('passes a server error event through (with its reference) and ignores anything after it', async () => {
    h.fetch.mockResolvedValue(streamed([frame('delta', { text: 'par' }), frame('error', { code: 'provider_busy', message: 'The assistant is busy right now.', requestId: 'req-9' }), frame('delta', { text: 'late' })]))
    expect(await run()).toEqual([{ type: 'delta', text: 'par' }, { type: 'error', code: 'provider_busy', message: 'The assistant is busy right now.', requestId: 'req-9' }])
  })

  it('turns malformed event data into a safe error instead of throwing', async () => {
    h.fetch.mockResolvedValue(streamed(['event: delta\ndata: {not json\n\n']))
    expect(await run()).toEqual([{ type: 'error', code: 'bad_stream', message: 'Something went wrong. Please try again.' }])
  })

  it('reports a stream that stops without done or error', async () => {
    h.fetch.mockResolvedValue(streamed([frame('delta', { text: 'half' })]))
    const events = await run()
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'stream_ended' })
  })

  it('reports a connection that breaks mid-stream', async () => {
    let sent = false    // data first, then the drop (error() in the same tick would discard the queued chunk, which a real connection does not)
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (!sent) { sent = true; c.enqueue(enc.encode(frame('delta', { text: 'x' }))) } else c.error(new TypeError('network error')) } })
    h.fetch.mockResolvedValue(new Response(body, { status: 200 }))
    const events = await run()
    expect(events.map((e) => e.type)).toEqual(['delta', 'error']); expect(events[1]).toMatchObject({ code: 'network_error' })
  })

  it('ignores unknown events and comment lines', async () => {
    h.fetch.mockResolvedValue(streamed([': keep-alive\n\n', frame('mystery', { a: 1 }), GOOD]))
    expect((await run()).map((e) => e.type)).toEqual(['meta', 'delta', 'delta', 'done'])
  })

  it('stops quietly when aborted mid-stream: no further events, no error, no throw', async () => {
    const ctl = new AbortController()
    h.fetch.mockImplementation((_u: string, init: RequestInit) => Promise.resolve(streamed([frame('delta', { text: 'a' })], { hang: init.signal as AbortSignal })))
    const events: ChatStreamEvent[] = []
    const p = streamChat([{ role: 'user', content: 'hi' }], (e) => events.push(e), ctl.signal)
    await vi.waitFor(() => expect(events).toHaveLength(1))
    ctl.abort()
    await expect(p).resolves.toBeUndefined()
    expect(events).toEqual([{ type: 'delta', text: 'a' }])
  })

  it('stops quietly when aborted before the response arrives', async () => {
    const ctl = new AbortController()
    h.fetch.mockImplementation((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const p = streamChat([{ role: 'user', content: 'hi' }], () => { throw new Error('no events expected') }, ctl.signal)
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalled()); ctl.abort()
    await expect(p).resolves.toBeUndefined()
  })

  it('still works when the browser cannot stream a body (reads it whole)', async () => {
    h.fetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null, text: async () => GOOD })
    expect((await run()).map((e) => e.type)).toEqual(['meta', 'delta', 'delta', 'done'])
  })
})

describe('authentication', () => {
  it('on a 401 refreshes the session once and retries with the new token', async () => {
    h.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'old' } } }).mockResolvedValueOnce({ data: { session: { access_token: 'new' } } })
    h.refreshOnce.mockResolvedValue(true)
    h.fetch.mockResolvedValueOnce(json(401, { error: { code: 'unauthorized', message: 'Invalid or expired token' } })).mockResolvedValueOnce(streamed([GOOD]))
    expect((await run()).at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' })
    expect(h.fetch.mock.calls.map((c) => c[1].headers.Authorization)).toEqual(['Bearer old', 'Bearer new'])
    expect(h.expireSession).not.toHaveBeenCalled()
  })

  it('ends the session when the refresh fails', async () => {
    h.refreshOnce.mockResolvedValue(false)
    h.fetch.mockResolvedValue(json(401, { error: { code: 'unauthorized', message: 'Authentication required' } }))
    await expect(run()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    expect(h.expireSession).toHaveBeenCalledTimes(1); expect(h.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not loop: a second 401 after the refresh also ends the session', async () => {
    h.refreshOnce.mockResolvedValue(true)
    h.fetch.mockResolvedValue(json(401, { error: { code: 'unauthorized', message: 'nope' } }))
    await expect(run()).rejects.toBeInstanceOf(ApiError)
    expect(h.fetch).toHaveBeenCalledTimes(2); expect(h.expireSession).toHaveBeenCalledTimes(1)
  })
})

describe('failures before the stream starts', () => {
  it('maps 429 to the API error with its message and the Retry-After delay', async () => {
    h.fetch.mockResolvedValue(json(429, { error: { code: 'rate_limited', message: 'You have used the assistant a lot.', requestId: 'r1' } }, { 'Retry-After': '42' }))
    await expect(run()).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: 'You have used the assistant a lot.', requestId: 'r1', details: { retryAfterSeconds: 42 } })
  })

  it('maps 503 (assistant off or provider down) and 422 to their own safe messages', async () => {
    h.fetch.mockResolvedValueOnce(json(503, { error: { code: 'service_unavailable', message: 'The assistant is not available right now.' } }))
    await expect(run()).rejects.toMatchObject({ status: 503, message: 'The assistant is not available right now.' })
    h.fetch.mockResolvedValueOnce(json(422, { error: { code: 'validation_error', message: 'The request was invalid' } }))
    await expect(run()).rejects.toMatchObject({ status: 422, code: 'validation_error' })
  })

  it('uses a generic message when the error body is not the API contract (a proxy page, say)', async () => {
    h.fetch.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(run()).rejects.toMatchObject({ status: 502, message: 'Something went wrong. Please try again.' })
  })

  it('hides the raw reason when the network fails', async () => {
    h.fetch.mockRejectedValue(new TypeError('Failed to fetch https://internal.example/secret'))
    const err = await run().catch((e) => e as ApiError)
    expect(err).toBeInstanceOf(ApiError); expect(err.code).toBe('network_error'); expect(err.message).not.toMatch(/internal|secret|fetch/i)
  })
})

describe('SSE parsing helpers', () => {
  it('a CRLF split between two chunks is one line break, not two (no premature event)', () => {
    const got: string[] = []
    const p = createSseParser((n, d) => got.push(`${n}:${d}`))
    p.push('event: delta\r'); p.push('\ndata: {"text":"a"}\r'); p.push('\n\r'); p.push('\n'); p.flush()
    expect(got).toEqual(['delta:{"text":"a"}'])
  })
  it('flush emits a final event that lacked its blank line', () => {
    const got: string[] = []
    const p = createSseParser((n, d) => got.push(`${n}:${d}`)); p.push('event: done\ndata: {}'); expect(got).toEqual([]); p.flush(); expect(got).toEqual(['done:{}'])
  })
  it('joins multi-line data and strips one leading space', () => {
    const got: string[] = []
    createSseParser((_n, d) => got.push(d)).push('data: a\ndata:  b\n\n'); expect(got).toEqual(['a\n b'])
  })
  it('toChatEvent trims and bounds server text and drops control characters', () => {
    const e = toChatEvent('error', JSON.stringify({ code: 'x', message: `a\u0007b${'z'.repeat(1000)}` }))
    expect(e).toMatchObject({ type: 'error' }); expect((e as { message: string }).message.startsWith('a b')).toBe(true); expect((e as { message: string }).message.length).toBe(300)
    expect(toChatEvent('delta', JSON.stringify({ text: 5 }))).toBeNull()
  })
})
