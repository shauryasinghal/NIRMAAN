import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { PageHeader, Pagination } from '../components/ui/kit'
import { activityService } from '../lib/services'
import { formatDate, timeAgo } from '../lib/format'

export function ActivityPage() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['activity', page], queryFn: () => activityService.list(page), placeholderData: keepPreviousData })
  const sig = useQuery({ queryKey: ['signals'], queryFn: activityService.signals })
  const d = q.data
  const groups = (d?.items ?? []).reduce<Record<string, typeof d extends undefined ? never : NonNullable<typeof d>['items']>>((acc, i) => { (acc[formatDate(i.createdAt)] ||= []).push(i); return acc }, {})
  return (
    <div className="max-w-3xl">
      <PageHeader title="Activity" subtitle="A record of what you actually did in NIRMAAN." />
      {sig.data && <Card className="p-4 mb-6"><h2 className="text-sm font-semibold mb-1">What shapes your recommendations</h2><p className="text-xs text-muted">{sig.data.active ? `${sig.data.usedForRanking} recent actions are nudging your ranking${sig.data.topCategories[0] ? ` — mostly ${sig.data.topCategories[0].name}` : ''}.` : `Personalisation from behaviour starts after ${sig.data.minEvents} actions (${sig.data.usedForRanking} so far); until then only your profile is used.`} <Link to="/settings" className="text-accent-500 underline focus-ring rounded">See details or reset</Link></p></Card>}
      {q.isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        : !d?.items.length ? <EmptyState icon={Activity} title="No activity yet" description="Save an opportunity, track an application or check an idea and it will show up here." action={<Link to="/opportunities" className="text-sm text-accent-500">Browse opportunities</Link>} />
        : (<>{Object.entries(groups).map(([day, items]) => (<section key={day} className="mb-5"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{day}</h2>
            <ul className="space-y-1.5">{items.map((i) => (<li key={i.id} className="surface rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{i.link ? <Link to={i.link} className="hover:underline focus-ring rounded">{i.title}</Link> : i.title}</span><time className="text-xs text-muted shrink-0" dateTime={i.createdAt}>{timeAgo(i.createdAt)}</time></li>))}</ul></section>))}
          <Pagination page={d.page} pages={Math.max(1, Math.ceil(d.total / d.pageSize))} onPage={setPage} /></>)}
    </div>
  )
}
