import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { notificationService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState, SkeletonCard } from '../components/ui/primitives'
import clsx from 'clsx'

export function NotificationsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: notificationService.list })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const markAllRead = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const items = data?.items ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {items.some((n) => !n.read) && (
          <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate()}><CheckCheck size={14} /> Mark all read</Button>
        )}
      </div>
      <p className="text-muted text-sm mb-6">{data?.unreadCount ?? 0} unread.</p>

      {isLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && items.length === 0 && <EmptyState icon={Bell} title="You're all caught up" description="Nothing needs your attention right now." />}

      <div className="space-y-2">
        {items.map((n) => (
          <Card
            key={n.id}
            variant={n.read ? 'surface' : 'highlight'}
            className={clsx('p-4', !n.read && 'cursor-pointer')}
            onClick={() => !n.read && markRead.mutate(n.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted mt-1">{n.body}</p>}
                <p className="text-[11px] text-muted mt-1.5">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.read && <span className="h-2 w-2 rounded-full bg-accent-500 mt-1.5 shrink-0" />}
            </div>
            {n.link && (
              <Link to={n.link} className="text-xs text-accent-500 mt-2 inline-block hover:underline">View →</Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
