import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClipboardList, LayoutGrid, List } from 'lucide-react'
import { applicationService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { EmptyState, SkeletonCard, Badge } from '../components/ui/primitives'
import { Button } from '../components/ui/Button'
import type { Application, ApplicationStatus } from '../types'

const PIPELINE: ApplicationStatus[] = ['wishlist', 'saved', 'planning', 'applying', 'applied', 'shortlisted', 'interview', 'selected']
const STATUS_LABEL: Record<string, string> = {
  wishlist: 'Wishlist', saved: 'Saved', planning: 'Planning', applying: 'Applying', applied: 'Applied',
  shortlisted: 'Shortlisted', interview: 'Interview', selected: 'Selected', rejected: 'Rejected', withdrawn: 'Withdrawn',
}

export function ApplicationsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['applications'], queryFn: applicationService.list })
  const [view, setView] = useState<'board' | 'list'>('board')

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => applicationService.update(id, { status }),
    onSuccess: () => {
      toast.success('Status updated')
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  const items = data?.items ?? []
  const grouped = useMemo(() => {
    const map = new Map<string, Application[]>()
    for (const status of PIPELINE) map.set(status, [])
    for (const a of items) {
      if (!map.has(a.status)) map.set(a.status, [])
      map.get(a.status)!.push(a)
    }
    return map
  }, [items])

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>

  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">My Applications</h1>
        <p className="text-muted text-sm mb-6">Track the opportunities you decide to pursue.</p>
        <EmptyState
          icon={ClipboardList}
          title="Track the opportunities you decide to pursue"
          description="Add an opportunity to your tracker from its detail page to see it here."
          action={<Link to="/opportunities"><Button size="sm">Discover opportunities</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">My Applications</h1>
        <div className="flex gap-1">
          <button onClick={() => setView('board')} className={`p-1.5 rounded-lg ${view === 'board' ? 'bg-accent-500/10 text-accent-500' : 'text-muted'}`} aria-label="Board view"><LayoutGrid size={16} /></button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-accent-500/10 text-accent-500' : 'text-muted'}`} aria-label="List view"><List size={16} /></button>
        </div>
      </div>
      <p className="text-muted text-sm mb-6">{items.length} opportunities in your pipeline.</p>

      {view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {PIPELINE.map((status) => {
            const apps = grouped.get(status) ?? []
            return (
              <div key={status} className="w-64 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">{STATUS_LABEL[status]}</span>
                  <span className="text-xs text-muted">{apps.length}</span>
                </div>
                <div className="space-y-2">
                  {apps.map((a) => (
                    <ApplicationCard key={a.id} app={a} onMove={(next) => mutation.mutate({ id: a.id, status: next })} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <ApplicationCard key={a.id} app={a} onMove={(next) => mutation.mutate({ id: a.id, status: next })} wide />
          ))}
        </div>
      )}
    </div>
  )
}

function ApplicationCard({ app, onMove, wide }: { app: Application; onMove: (s: ApplicationStatus) => void; wide?: boolean }) {
  const currentIndex = PIPELINE.indexOf(app.status)
  const next = currentIndex >= 0 && currentIndex < PIPELINE.length - 1 ? PIPELINE[currentIndex + 1] : null
  return (
    <Card variant="interactive" className={`p-3 ${wide ? 'flex items-center justify-between gap-3' : ''}`}>
      <div className="min-w-0">
        <Link to={`/opportunities/${app.opportunityId}`} className="font-medium text-sm hover:text-accent-500 line-clamp-1">{app.title}</Link>
        <p className="text-xs text-muted mt-0.5">{app.organization}</p>
        {app.urgency && app.urgency !== 'unknown' && (
          <Badge tone={app.urgency === 'critical' ? 'danger' : app.urgency === 'soon' ? 'warning' : 'neutral'}>{app.deadline}</Badge>
        )}
      </div>
      {next && (
        <button onClick={() => onMove(next)} className="text-[11px] mt-2 text-accent-500 hover:underline">
          Move to {STATUS_LABEL[next]} →
        </button>
      )}
    </Card>
  )
}
