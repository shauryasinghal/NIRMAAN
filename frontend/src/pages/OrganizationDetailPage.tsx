import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ErrorState, EmptyState, Skeleton } from '../components/ui/primitives'
import { DemoBadge, Notice, PageHeader } from '../components/ui/kit'
import { OpportunityCard } from '../components/opportunities/OpportunityCard'
import { organizationService } from '../lib/services'
import type { ApiError } from '../lib/api'

export function OrganizationDetailPage() {
  const { slug = '' } = useParams()
  const q = useQuery({ queryKey: ['organization', slug], queryFn: () => organizationService.detail(slug), retry: false })
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState message={(q.error as ApiError)?.status === 404 ? 'That organization does not exist.' : (q.error as Error)?.message} onRetry={(q.error as ApiError)?.status === 404 ? undefined : () => q.refetch()} />
  const o = q.data
  return (
    <div>
      <Link to="/organizations" className="text-xs text-muted hover:text-[var(--text)] focus-ring rounded">← Organizations</Link>
      <div className="mt-3"><PageHeader title={o.name} subtitle={`${o.openCount} open ${o.openCount === 1 ? 'opportunity' : 'opportunities'}${o.website ? '' : ''}`} actions={o.isDemo ? <DemoBadge /> : undefined} /></div>
      <div className="mb-6"><Notice>{o.note}{o.website && <> Website: <a className="underline" href={o.website} target="_blank" rel="noopener noreferrer nofollow">{o.website}</a></>}</Notice></div>
      {o.opportunities.length === 0 ? <EmptyState title="No listings from this organization" /> : <div className="grid md:grid-cols-2 gap-4">{o.opportunities.map((x) => <OpportunityCard key={x.id} o={x} />)}</div>}
    </div>
  )
}
