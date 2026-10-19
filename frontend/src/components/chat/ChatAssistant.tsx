import { useCallback, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { useChat } from './useChat'

/** Launcher + panel. The conversation lives in this component's hook, so it survives page changes and closing the panel, but not sign-out. */
export function ChatAssistant({ provider, providerName }: { provider?: string; providerName?: string }) {
  const [open, setOpen] = useState(false)
  const chat = useChat()
  const { stop } = chat
  // Stable on purpose: Dialog re-runs its focus handling whenever `onClose` changes identity. Closing also stops a reply in progress.
  const close = useCallback(() => { stop(); setOpen(false) }, [stop])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Open the NIRMAAN assistant" title="Ask the assistant"
        className="fixed z-30 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 h-12 w-12 rounded-full bg-accent-600 text-white shadow-lg hover:bg-accent-500 transition-colors focus-ring flex items-center justify-center">
        <MessageCircle size={22} aria-hidden />
      </button>
      <ChatPanel open={open} onClose={close} chat={chat} provider={provider} providerName={providerName} />
    </>
  )
}
