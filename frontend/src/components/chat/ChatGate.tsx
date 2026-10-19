import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { chatService } from '../../lib/services'

const ChatAssistant = lazy(() => import('./ChatAssistant').then((m) => ({ default: m.ChatAssistant })))

/** Shows the assistant only when the API says it is switched on and keyed. Anything else (off, error, slow) shows nothing and loads no chat code. */
export function ChatGate() {
  const { data } = useQuery({ queryKey: ['chat', 'status'], queryFn: chatService.status, retry: false, staleTime: 10 * 60_000, refetchOnWindowFocus: false })
  if (!data?.enabled) return null
  return <Suspense fallback={null}><ChatAssistant provider={data.provider} providerName={data.providerName} /></Suspense>
}
