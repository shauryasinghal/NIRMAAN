import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import { originalityService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, SkeletonCard } from '../components/ui/primitives'
import { Button } from '../components/ui/Button'

const FILTERS = ['all', 'novel', 'needs_review', 'confirmed_overlap'] as const
const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  novel: 'success', needs_review: 'warning', confirmed_overlap: 'danger', worth_reviewing: 'warning',
}

export function OriginalityHistoryPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['history'], queryFn: originalityService.history })
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => originalityService.remove(id),
    onSuccess: () => {
      toast.success('Deleted')
      qc.invalidateQueries({ queryKey: ['history'] })
      setPendingDelete(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  })

  const items = useMemo(() => {
    const all = data?.items ?? []
    return filter === 'all' ? all : all.filter((i) => i.status === filter)
  }, [data, filter])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Originality history</h1>
      <p className="text-muted text-sm mb-6">Every idea you've checked, with its outcome.</p>

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f} onClick={() => setFilter(f)}
            className="text-xs px-3 py-1.5 rounded-full border capitalize"
            style={{ borderColor: filter === f ? 'var(--color-accent-500)' : 'var(--border)', color: filter === f ? 'var(--color-accent-500)' : 'inherit' }}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && items.length === 0 && <EmptyState icon={HistoryIcon} title="No idea checks yet" description="Run an originality check to see it here." />}
      <div className="space-y-2">
        {items.map((i) => (
          <Card key={i.id} className="p-4 flex justify-between items-center">
            <div>
              <div className="font-medium text-sm">{i.title}</div>
              <div className="text-xs text-muted mt-0.5">{new Date(i.date).toLocaleDateString()} · top similarity {i.topSimilarity}%</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-accent-500">{i.noveltyScore}</span>
              <Badge tone={TONE[i.status] ?? 'neutral'}>{i.status.replace('_', ' ')}</Badge>
              <button onClick={() => setPendingDelete(i.id)} className="p-1.5 rounded-lg text-muted hover:text-danger-500" aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
          <Card variant="elevated" className="p-5 max-w-sm w-full">
            <p className="text-sm font-medium mb-1">Delete this idea check?</p>
            <p className="text-xs text-muted mb-4">This permanently removes it from your history. This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button size="sm" variant="danger" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate(pendingDelete)}>Delete</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
