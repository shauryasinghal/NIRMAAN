import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { PageHeader, Pagination, Tabs } from '../components/ui/kit'
import { notificationService } from '../lib/services'
import { timeAgo } from '../lib/format'
import type { NotificationItem } from '../types'

const KIND: Record<string, string> = { smart_alert: 'Smart alert', saved_search_match: 'Smart alert', high_fit_opportunity: 'High fit', deadline_approaching: 'Deadline', application_reminder: 'Reminder', reviewer_decision: 'Review', originality_review: 'Review', team_event: 'Team', profile_completion: 'Profile', application_update: 'Application', recommendation_update: 'Update' }

export function NotificationsPage() {
  const [tab, setTab] = useState<'all' | 'unread'>('all'); const [page, setPage] = useState(1)
  const qc = useQueryClient(); const nav = useNavigate()
  const q = useQuery({ queryKey: ['notifications', tab, page], queryFn: () => notificationService.list(tab === 'unread', page), placeholderData: keepPreviousData })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifications'] }) }
  const read = useMutation({ mutationFn: (id: string) => notificationService.markRead(id), onSuccess: refresh })
  const readAll = useMutation({ mutationFn: notificationService.markAllRead, onSuccess: refresh })
  const open = (n: NotificationItem) => { if (!n.read) read.mutate(n.id); if (n.link) nav(n.link) }
  const d = q.data
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" subtitle="Only real events appear here — matches, deadlines, decisions and invitations." actions={<><Link to="/settings" className="text-xs text-accent-500 focus-ring rounded">Preferences</Link><Button variant="secondary" size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending} disabled={!d?.unread}><Check size={14} /> Mark all read</Button></>} />
      <Tabs label="Filter notifications" value={tab} onChange={(t) => { setTab(t); setPage(1) }} tabs={[{ id: 'all', label: 'All', count: tab === 'all' ? d?.total : undefined }, { id: 'unread', label: 'Unread', count: d?.unread }]} />
      <div className="mt-4" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
          : !d?.items.length ? <EmptyState icon={Bell} title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'} description="Create a smart alert or save an opportunity with a deadline and you'll hear from us when it matters." action={<Link to="/smart-alerts"><Button variant="secondary">Set up an alert</Button></Link>} />
          : (<><ul className="space-y-2">{d.items.map((n) => (
              <li key={n.id}><button onClick={() => open(n)} className={clsx('w-full text-left rounded-xl p-4 flex gap-3 items-start surface-interactive focus-ring', !n.read && 'border-accent-500/40')}>
                <span className={clsx('mt-1.5 h-2 w-2 rounded-full shrink-0', n.read ? 'bg-transparent' : 'bg-accent-500')} aria-label={n.read ? 'Read' : 'Unread'} />
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[11px] text-muted uppercase tracking-wide"><span>{KIND[n.kind] ?? 'Update'}</span><span>·</span><time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time></span>
                  <span className="block text-sm font-medium mt-0.5">{n.title}</span>{n.body && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{n.body}</span>}</span></button></li>))}</ul>
            <Pagination page={d.page} pages={Math.max(1, Math.ceil(d.total / d.pageSize))} onPage={setPage} /></>)}
      </div>
    </div>
  )
}
