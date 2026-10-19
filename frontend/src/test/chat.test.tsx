import { useState } from 'react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from './utils'

const h = vi.hoisted(() => ({ status: vi.fn(), stream: vi.fn(), auth: { session: { user: { id: 'u1' } } as { user: { id: string } } | null } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => h.auth }))
vi.mock('../lib/services', () => ({ chatService: { status: h.status } }))
vi.mock('../lib/chatStream', async (orig) => ({ ...(await orig<typeof import('../lib/chatStream')>()), streamChat: h.stream }))
import { ApiError } from '../lib/api'
import type { ChatStreamEvent, ChatTurn } from '../lib/chatStream'
import { ChatGate } from '../components/chat/ChatGate'
import { windowForSend } from '../components/chat/useChat'

interface Call { turns: ChatTurn[]; onEvent: (e: ChatStreamEvent) => void; signal: AbortSignal; resolve: () => void }
let calls: Call[]
const emit = (i: number, e: ChatStreamEvent) => act(() => { calls[i].onEvent(e) })
const delta = (i: number, text: string) => emit(i, { type: 'delta', text })
const done = async (i: number) => { await emit(i, { type: 'done', stopReason: 'end_turn' }); await act(async () => calls[i].resolve()) }

beforeEach(() => {
  calls = []
  h.auth.session = { user: { id: 'u1' } }
  h.status.mockReset().mockResolvedValue({ enabled: true, provider: 'anthropic', providerName: 'Anthropic' })
  h.stream.mockReset().mockImplementation((turns: ChatTurn[], onEvent: Call['onEvent'], signal: AbortSignal) =>
    new Promise<void>((resolve) => { calls.push({ turns, onEvent, signal, resolve }); signal.addEventListener('abort', () => resolve()) }))
})
afterEach(() => vi.restoreAllMocks())

const LAUNCHER = { name: 'Open the NIRMAAN assistant' }
async function openPanel() {
  const user = userEvent.setup()
  const view = renderApp(<ChatGate />)
  await user.click(await screen.findByRole('button', LAUNCHER))
  return { user, view, dialog: screen.getByRole('dialog', { name: 'NIRMAAN assistant' }) }
}
const box = () => screen.getByLabelText('Your message')
const log = () => screen.getByRole('log', { name: 'Conversation' })
async function ask(user: ReturnType<typeof userEvent.setup>, text: string) { await user.type(box(), text); await user.click(screen.getByRole('button', { name: 'Send' })) }

describe('launcher is gated by the API', () => {
  it('shows nothing when the assistant is switched off', async () => {
    h.status.mockResolvedValue({ enabled: false }); renderApp(<ChatGate />)
    await waitFor(() => expect(h.status).toHaveBeenCalled()); await act(async () => {})
    expect(screen.queryByRole('button', LAUNCHER)).toBeNull()
  })
  it('shows nothing when the status check fails', async () => {
    h.status.mockRejectedValue(new Error('down')); renderApp(<ChatGate />)
    await waitFor(() => expect(h.status).toHaveBeenCalled()); await act(async () => {})
    expect(screen.queryByRole('button', LAUNCHER)).toBeNull()
  })
  it('shows a labelled launcher that announces it opens a dialog', async () => {
    renderApp(<ChatGate />)
    expect(await screen.findByRole('button', LAUNCHER)).toHaveAttribute('aria-haspopup', 'dialog')
  })
})

describe('panel', () => {
  it('is a labelled modal dialog with the AI disclosure visible, and focuses the message box', async () => {
    const { dialog } = await openPanel()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/AI assistant.*answers can be wrong.*sent to Anthropic.*aren't saved/)
    expect(screen.getByText(/sent to Anthropic/)).toBeVisible()
    expect(box()).toHaveFocus()
  })

  it('names the provider that receives the text, with no free-tier claim for Anthropic', async () => {
    const { dialog } = await openPanel()
    expect(dialog).toHaveAccessibleDescription(/sent to Anthropic to write replies\. Chats aren't saved by NIRMAAN\./)
    expect(dialog).not.toHaveAccessibleDescription(/free tier|Google/i)
  })

  it('for Google Gemini, says so and explains the free-tier data use and that the app cannot tell which tier is in use', async () => {
    h.status.mockResolvedValue({ enabled: true, provider: 'gemini', providerName: 'Google Gemini' })
    const { dialog } = await openPanel()
    expect(dialog).toHaveAccessibleDescription(/sent to Google Gemini to write replies/)
    expect(dialog).not.toHaveAccessibleDescription(/Anthropic/)
    const text = screen.getByText(/sent to Google Gemini/)
    expect(text).toBeVisible()
    expect(text).toHaveTextContent(/free tier.*may be used to improve Google's products/)
    expect(text).toHaveTextContent(/paid tier it is not/)
    expect(text).toHaveTextContent(/NIRMAAN can't tell which tier this project uses/)
    expect(text).toHaveTextContent(/don't share sensitive information/)
  })

  it('falls back to a neutral wording when the API does not say who the provider is', async () => {
    h.status.mockResolvedValue({ enabled: true })
    const { dialog } = await openPanel()
    expect(dialog).toHaveAccessibleDescription(/sent to an external AI provider to write replies/)
    expect(dialog).not.toHaveAccessibleDescription(/free tier|Anthropic|Google/i)
  })

  it('has an operable conversation region and a polite status while it writes', async () => {
    const { user } = await openPanel()
    expect(log()).toHaveAttribute('tabindex', '0'); expect(log()).toHaveAttribute('aria-live', 'polite'); expect(log()).toHaveAttribute('aria-busy', 'false')
    await ask(user, 'hi')
    expect(log()).toHaveAttribute('aria-busy', 'true'); expect(screen.getByRole('status')).toHaveTextContent('The assistant is writing a reply.')
    await done(0)
    expect(log()).toHaveAttribute('aria-busy', 'false'); expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('streams the answer as it arrives, then goes back to Send', async () => {
    const { user } = await openPanel()
    await ask(user, 'hello there')
    expect(calls[0].turns).toEqual([{ role: 'user', content: 'hello there' }]); expect(box()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(within(log()).getByText('Thinking…')).toBeInTheDocument()
    await emit(0, { type: 'meta', requestId: 'r1' }); await delta(0, 'Hel')
    expect(within(log()).getByText('Hel')).toBeInTheDocument()
    await delta(0, 'lo!')
    expect(within(log()).getByText('Hello!')).toBeInTheDocument()
    await done(0)
    expect(within(log()).getByText('Hello!')).toBeInTheDocument(); expect(within(log()).getByText('hello there')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('renders model output as plain text only: no HTML, no markdown, no links, no script', async () => {
    const { user } = await openPanel()
    await ask(user, 'x')
    const evil = '<img src=x onerror="alert(1)"> **bold** [click](https://evil.example) <script>window.__pwned = 1</script>'
    await delta(0, evil); await done(0)
    expect(within(log()).getByText(evil)).toBeInTheDocument()                               // shown literally
    expect(log().querySelector('img, script, a, strong, em, iframe')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('Enter sends, Shift+Enter adds a line, and the message keeps its line break', async () => {
    const { user } = await openPanel()
    await user.type(box(), 'line1{Shift>}{Enter}{/Shift}line2')
    expect(box()).toHaveValue('line1\nline2'); expect(h.stream).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(calls[0].turns).toEqual([{ role: 'user', content: 'line1\nline2' }])
  })

  it('cannot send an empty message, limits the length, and shows a counter near the limit', async () => {
    const { user } = await openPanel()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.type(box(), '   '); expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(box()).toHaveAttribute('maxlength', '2000')
    fireEvent.change(box(), { target: { value: 'a'.repeat(1850) } })
    expect(screen.getByText('1850/2000')).toBeInTheDocument()
  })

  it('answers one question at a time: Enter while streaming does nothing and keeps the draft', async () => {
    const { user } = await openPanel()
    await ask(user, 'first')
    await user.type(box(), 'second{Enter}')
    expect(h.stream).toHaveBeenCalledTimes(1); expect(box()).toHaveValue('second')
  })

  it('offers starter prompts that send straight away', async () => {
    const { user } = await openPanel()
    await user.click(screen.getByRole('button', { name: "What's due soon?" }))
    expect(calls[0].turns).toEqual([{ role: 'user', content: "What's due soon?" }])
  })

  it('sends the earlier turns with each new question', async () => {
    const { user } = await openPanel()
    await ask(user, 'one'); await delta(0, 'A1'); await done(0)
    await ask(user, 'two')
    expect(calls[1].turns).toEqual([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'two' }])
  })
})

describe('stopping, closing, starting over', () => {
  it('Stop aborts the request, keeps the partial text, and ignores anything that arrives late', async () => {
    const { user } = await openPanel()
    await ask(user, 'q'); await delta(0, 'partial')
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(calls[0].signal.aborted).toBe(true)
    expect(within(log()).getByText('partial')).toBeInTheDocument(); expect(within(log()).getByText('Stopped')).toBeInTheDocument()
    await delta(0, ' late text')
    expect(within(log()).queryByText(/late text/)).toBeNull(); expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('closing the panel aborts the reply but keeps the conversation for next time; focus returns to the launcher', async () => {
    const { user } = await openPanel()
    await ask(user, 'remember me'); await delta(0, 'half')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull(); expect(calls[0].signal.aborted).toBe(true)
    expect(screen.getByRole('button', LAUNCHER)).toHaveFocus()
    await user.click(screen.getByRole('button', LAUNCHER))
    expect(within(log()).getByText('remember me')).toBeInTheDocument(); expect(within(log()).getByText('half')).toBeInTheDocument()
  })

  it('New chat clears the conversation and aborts a reply in progress', async () => {
    const { user } = await openPanel()
    await ask(user, 'old topic'); await delta(0, 'x')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(calls[0].signal.aborted).toBe(true); expect(screen.queryByText('old topic')).toBeNull()
    expect(screen.getByText('How can I help?')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
  })
})

describe('failures', () => {
  it('shows a stream error with its reference, and Retry re-asks the same conversation', async () => {
    const { user } = await openPanel()
    await ask(user, 'q1'); await delta(0, 'part')
    await emit(0, { type: 'error', code: 'provider_busy', message: 'The assistant is busy right now. Please try again in a moment.', requestId: 'req-7' })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The assistant is busy right now.'); expect(alert).toHaveTextContent('Reference: req-7')
    expect(within(log()).getByText('part')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(h.stream).toHaveBeenCalledTimes(2); expect(calls[1].turns).toEqual(calls[0].turns); expect(screen.queryByRole('alert')).toBeNull()
    await delta(1, 'fresh answer'); await done(1)
    expect(within(log()).getByText('fresh answer')).toBeInTheDocument(); expect(within(log()).queryByText('part')).toBeNull()
  })

  it('shows the API\'s own message and wait time for a failure before streaming (rate limit)', async () => {
    h.stream.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'You have used the assistant a lot. Please wait a bit and try again.', { retryAfterSeconds: 30 }))
    const { user } = await openPanel()
    await ask(user, 'q')
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in about 30 seconds.')
    expect(screen.getByRole('alert')).toHaveTextContent('You have used the assistant a lot.')
  })

  it('never shows the text of an unexpected exception', async () => {
    h.stream.mockRejectedValueOnce(new Error('secret internals at /srv/app.js:12'))
    const { user } = await openPanel()
    await ask(user, 'q')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.'); expect(alert).not.toHaveTextContent(/secret|srv/)
  })
})

describe('memory only, tied to the signed-in user', () => {
  function Host() {
    const [, bump] = useState(0)
    return (<div><button onClick={() => { h.auth.session = null; bump((n) => n + 1) }}>sign out</button><button onClick={() => { h.auth.session = { user: { id: 'u2' } }; bump((n) => n + 1) }}>switch user</button><ChatGate /></div>)
  }
  async function convo() {
    const user = userEvent.setup(); const view = renderApp(<Host />)
    await user.click(await screen.findByRole('button', LAUNCHER)); await ask(user, 'private question'); await delta(0, 'private answer')
    return { user, view }
  }

  it('sign-out aborts the reply in flight and clears the conversation', async () => {
    const { user } = await convo()
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    expect(calls[0].signal.aborted).toBe(true); expect(screen.queryByText('private question')).toBeNull(); expect(screen.queryByText('private answer')).toBeNull()
    expect(screen.getByText('How can I help?')).toBeInTheDocument()
  })

  it('a different user never sees the previous person\'s conversation', async () => {
    const { user } = await convo()
    await user.click(screen.getByRole('button', { name: 'switch user' }))
    expect(calls[0].signal.aborted).toBe(true); expect(screen.queryByText('private question')).toBeNull(); expect(screen.queryByText('private answer')).toBeNull()
  })

  it('unmounting (the app shell leaving on sign-out) aborts the request', async () => {
    const { view } = await convo()
    view.unmount()
    expect(calls[0].signal.aborted).toBe(true)
  })

  it('writes nothing to localStorage, sessionStorage or cookies', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { user } = await convo(); await done(0); await ask(user, 'another one')
    expect(set.mock.calls.flat().join(' ')).not.toMatch(/private|another/)
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('')
  })
})

describe('windowForSend', () => {
  const t = (n: number): ChatTurn[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }))
  it('keeps short conversations whole', () => { expect(windowForSend(t(5))).toEqual(t(5)) })
  it('keeps at most 20 turns, always starting with the student and ending with the newest message', () => {
    const w = windowForSend(t(31))
    expect(w.length).toBeLessThanOrEqual(20); expect(w[0].role).toBe('user'); expect(w.at(-1)).toEqual(t(31).at(-1))
  })
  it('drops the oldest turns until the total fits 12,000 characters', () => {
    const turns: ChatTurn[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(1900) }))
    const w = windowForSend(turns)
    expect(w.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(12_000); expect(w[0].role).toBe('user'); expect(w.at(-1)).toBe(turns.at(-1))
  })
  it('never returns an empty conversation', () => { expect(windowForSend([{ role: 'user', content: 'only' }])).toEqual([{ role: 'user', content: 'only' }]) })
})
