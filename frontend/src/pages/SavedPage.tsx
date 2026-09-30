import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bookmark } from 'lucide-react'
import { savedService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, SkeletonCard } from '../components/ui/primitives'
import { SaveButton } from '../components/opportunities/SaveButton'
import { Button } from '../components/ui/Button'

const URGENCY_TONE: Record<string, 'danger' | 'warning' | 'success' | 'neutral'> = {
  critical: 'danger', soon: 'warning', open: 'success', expired: 'neutral', unknown: 'neutral',
}

export function SavedPage() {
  const { data, isLoading } = useQuery({ queryKey: ['saved-opportunities'], queryFn: savedService.list })

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Saved opportunities</h1>
      <p className="text-muted text-sm mb-6">Your shortlist starts here.</p>

      {isLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}

      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState
          icon={Bookmark}
          title="Your shortlist starts here"
          description="Save opportunities while browsing to come back to them later."
          action={<Link to="/opportunities"><Button size="sm">Discover opportunities</Button></Link>}
        />
      )}

      <div className="space-y-3">
        {data?.items.map((o) => (
          <Card key={o.id} variant="interactive" className="p-4">
            <div className="flex justify-between items-start gap-3">
              <Link to={`/opportunities/${o.id}`} className="min-w-0">
                <div className="font-medium text-sm">{o.title}</div>
                <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{o.organization} · {o.domain} · deadline {o.deadline || 'TBD'}</span>
                  {o.urgency && o.urgency !== 'unknown' && <Badge tone={URGENCY_TONE[o.urgency]}>{o.urgency}</Badge>}
                </div>
              </Link>
              <SaveButton opportunityId={o.id} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
