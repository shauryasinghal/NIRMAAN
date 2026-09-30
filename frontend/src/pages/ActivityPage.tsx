import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity as ActivityIcon } from 'lucide-react'
import { activityService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { EmptyState, SkeletonCard } from '../components/ui/primitives'

const KIND_LABEL: Record<string, string> = {
  opportunity_saved: 'Saved an opportunity',
  application_created: 'Added to applications',
  idea_checked: 'Checked idea originality',
  team_created: 'Built a team',
  profile_updated: 'Updated profile',
}

export function ActivityPage() {
  const { data, isLoading } = useQuery({ queryKey: ['activity'], queryFn: () => activityService.list(50) })
  const items = data?.items ?? []

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Activity</h1>
      <p className="text-muted text-sm mb-6">A real record of what you've done in NIRMAAN.</p>

      {isLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && items.length === 0 && <EmptyState icon={ActivityIcon} title="Nothing here yet" description="Your actions across NIRMAAN will show up here." />}

      <div className="space-y-0">
        {items.map((e, i) => (
          <div key={e.id} className="flex gap-4 relative pb-6">
            {i < items.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px" style={{ background: 'var(--border)' }} />}
            <span className="h-2.5 w-2.5 rounded-full bg-accent-500 mt-1.5 shrink-0 relative z-10" />
            <Card variant="surface" className="flex-1 p-3">
              <p className="text-sm">{e.title}</p>
              <p className="text-[11px] text-muted mt-1">{KIND_LABEL[e.kind] ?? e.kind} · {new Date(e.createdAt).toLocaleString()}</p>
              {e.link && <Link to={e.link} className="text-xs text-accent-500 hover:underline mt-1 inline-block">View →</Link>}
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
