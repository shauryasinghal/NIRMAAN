import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Plus, RotateCcw, Send, Square } from 'lucide-react'
import clsx from 'clsx'
import { Dialog, Notice } from '../ui/kit'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'
import { CHAT_LIMITS } from '../../lib/chatStream'
import type { ChatMessage, useChat } from './useChat'

/** Who receives the text matters, so the disclosure names the provider the API reports. For Gemini it also states the free-tier data-use rule:
 *  Google's pricing page says free-tier content is used to improve its products and paid-tier content is not. The app cannot tell which tier the
 *  project's key is on, so it says exactly that instead of guessing. */
const GEMINI_TIER_NOTE = "On Google's free tier, content sent to the API may be used to improve Google's products; on the paid tier it is not. NIRMAAN can't tell which tier this project uses, so please don't share sensitive information."
function disclosure(provider?: string, providerName?: string): string {
  const base = `AI assistant — answers can be wrong. Your messages and a summary of your NIRMAAN profile and activity are sent to ${providerName ?? 'an external AI provider'} to write replies. Chats aren't saved by NIRMAAN.`
  return provider === 'gemini' ? `${base} ${GEMINI_TIER_NOTE}` : base
}
const STARTERS = ['Which opportunities fit me best right now?', 'What skills should I build next?', "What's due soon?"]

type Chat = ReturnType<typeof useChat>

function Bubble({ m, last, canRetry, onRetry }: { m: ChatMessage; last: boolean; canRetry: boolean; onRetry: () => void }) {
  const mine = m.role === 'user'
  return (
    <li className={clsx('flex flex-col max-w-[88%]', mine ? 'self-end items-end' : 'self-start items-start')}>
      <span className="text-[11px] text-muted mb-0.5">{mine ? 'You' : 'Assistant'}</span>
      <div className={clsx('rounded-2xl px-3.5 py-2 text-sm leading-relaxed border', mine ? 'bg-accent-600 text-white border-transparent' : 'surface')}>
        {/* Plain text on purpose: React escapes it, and whitespace-pre-wrap keeps the model's line breaks. No HTML, no markdown, no links. */}
        {m.content ? <p className="whitespace-pre-wrap break-words">{m.content}{m.status === 'streaming' && <span aria-hidden className="motion-safe:animate-pulse"> ▍</span>}</p>
          : m.status === 'streaming' ? <p className="text-muted">Thinking…</p> : null}
        {m.status === 'stopped' && <p className="text-[11px] text-muted mt-1">Stopped</p>}
      </div>
      {m.status === 'error' && m.failure && (
        <div className="mt-2 w-full">
          <Notice tone="danger" title="That didn't work">
            <p>{m.failure.message}{m.failure.retryAfterSeconds ? ` Try again in about ${m.failure.retryAfterSeconds} seconds.` : ''}</p>
            {m.failure.requestId && <p className="text-[11px] mt-1">Reference: {m.failure.requestId}</p>}
            {last && canRetry && <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onRetry}><RotateCcw size={13} aria-hidden /> Retry</Button>}
          </Notice>
        </div>
      )}
    </li>
  )
}

export function ChatPanel({ open, onClose, chat, provider, providerName }: { open: boolean; onClose: () => void; chat: Chat; provider?: string; providerName?: string }) {
  const { messages, streaming, send, stop, retry, reset, canRetry } = chat
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)                                  // follow the newest text unless the student scrolled up to read
  const countId = useId()

  useEffect(() => {
    const el = listRef.current
    if (open && el && stick.current) el.scrollTop = el.scrollHeight
  }, [open, messages])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (send(draft)) { setDraft(''); stick.current = true }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!streaming) submit() }
  }
  const canSend = !streaming && draft.trim().length > 0
  const nearLimit = draft.length >= CHAT_LIMITS.messageChars - 200

  const composer = (
    <form onSubmit={submit} className="w-full" aria-label="Message the assistant">
      <div className="flex items-end gap-2">
        <Textarea aria-label="Your message" aria-describedby={nearLimit ? countId : undefined} data-autofocus rows={2} maxLength={CHAT_LIMITS.messageChars} value={draft} placeholder="Ask about opportunities, skills, deadlines…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
        {streaming
          ? <Button type="button" variant="secondary" onClick={stop} className="shrink-0 min-h-[44px]"><Square size={14} aria-hidden /> Stop</Button>
          : <Button type="submit" disabled={!canSend} className="shrink-0 min-h-[44px]"><Send size={14} aria-hidden /> Send</Button>}
      </div>
      <div className="flex justify-between gap-3 mt-1.5 text-[11px] text-muted">
        <span>Enter to send · Shift+Enter for a new line</span>
        {nearLimit && <span id={countId}>{draft.length}/{CHAT_LIMITS.messageChars}</span>}
      </div>
    </form>
  )

  return (
    <Dialog open={open} onClose={onClose} title="NIRMAAN assistant" description={disclosure(provider, providerName)} size="lg" footer={composer}>
      <div className="flex justify-end mb-2 min-h-[28px]">
        {messages.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={reset}><Plus size={13} aria-hidden /> New chat</Button>}
      </div>
      <div ref={listRef} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" aria-busy={streaming} tabIndex={0}
        onScroll={(e) => { const t = e.currentTarget; stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 48 }}
        className="min-h-[36dvh] max-h-[52dvh] overflow-y-auto overscroll-contain rounded-lg focus-ring">
        {messages.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">How can I help?</p>
            <p className="text-xs text-muted mt-1 mb-4">Ask about your matches, deadlines, applications or skills — or for general advice.</p>
            <ul className="flex flex-col items-stretch gap-2 max-w-sm mx-auto">
              {STARTERS.map((s) => <li key={s}><Button type="button" variant="secondary" size="sm" className="w-full justify-start text-left" onClick={() => send(s)}>{s}</Button></li>)}
            </ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 py-1 pr-1">
            {messages.map((m, i) => <Bubble key={m.id} m={m} last={i === messages.length - 1} canRetry={canRetry} onRetry={retry} />)}
          </ul>
        )}
      </div>
      <p role="status" className="sr-only">{streaming ? 'The assistant is writing a reply.' : ''}</p>
    </Dialog>
  )
}
