import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { organizationService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Badge, SkeletonCard } from '../components/ui/primitives'

export function OrganizationDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['organization', name],
    queryFn: () => organizationService.detail(name!),
    enabled: !!name,
  })

  if (isLoading) return <SkeletonCard />
  if (!data) return null

  return (
    <div>
      <Link to="/organizations" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to organizations</Link>

      <Card variant="elevated" className="p-6 mb-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-accent-500/10 flex items-center justify-center text-accent-500 text-xl font-semibold shrink-0">
            {data.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{data.name}</h1>
            <p className="text-sm text-muted mt-0.5">{data.opportunityCount} opportunit{data.opportunityCount === 1 ? 'y' : 'ies'} · {data.domains.join(', ')}</p>
          </div>
        </div>
        <p className="text-xs text-muted mt-4">
          Description, website and verification state are not currently available for this organization — NIRMAAN
          only shows fields it actually has data for.
        </p>
      </Card>

      <h2 className="font-medium mb-3">Opportunities from {data.name}</h2>
      <div className="space-y-2">
        {data.opportunities.map((o) => (
          <Link key={o.id} to={`/opportunities/${o.id}`}>
            <Card variant="interactive" className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{o.title}</div>
                <div className="text-xs text-muted mt-0.5">{o.domain} · deadline {o.deadline || 'TBD'}</div>
              </div>
              {o.category && <Badge tone="neutral">{o.category}</Badge>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
