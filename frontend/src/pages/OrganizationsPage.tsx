import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, ErrorState, SkeletonCard } from '../components/ui/primitives'
import { DemoBadge, PageHeader, Pagination } from '../components/ui/kit'
import { organizationService } from '../lib/services'

export function OrganizationsPage() {
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const r = useQuery({ queryKey: ['organizations', dq, page], queryFn: () => organizationService.list(dq, page), placeholderData: keepPreviousData })
  return (
    <div>
      <PageHeader title="Organizations" subtitle="Who is running opportunities. Counts come from the listings themselves — no invented popularity numbers." />
      <div className="relative max-w-md mb-6"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" aria-label="Search organizations" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organizations…" className="w-full rounded-lg border bg-[var(--surface)] pl-9 pr-3 py-2.5 text-sm focus-ring" style={{ borderColor: 'var(--border)' }} /></div>
      {r.isLoading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        : r.isError ? <ErrorState message={(r.error as Error).message} onRetry={() => r.refetch()} />
        : !r.data?.items.length ? <EmptyState icon={Building2} title="No organizations found" description={dq ? `Nothing matches “${dq}”.` : undefined} />
        : (<><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{r.data.items.map((o) => (
            <Link key={o.slug} to={`/organizations/${o.slug}`} className="focus-ring rounded-xl"><Card variant="interactive" className="p-4 h-full">
              <div className="flex items-start justify-between gap-2"><h2 className="font-semibold text-sm">{o.name}</h2>{o.isDemo && <DemoBadge />}</div>
              <p className="text-xs text-muted mt-1">{o.openCount} open {o.openCount === 1 ? 'opportunity' : 'opportunities'}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">{o.categories.slice(0, 4).map((c) => <Badge key={c}>{c}</Badge>)}</div></Card></Link>))}</div>
          <Pagination page={r.data.page} pages={r.data.pages} onPage={setPage} /></>)}
    </div>
  )
}
