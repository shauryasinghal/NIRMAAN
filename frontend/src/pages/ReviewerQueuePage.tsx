import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClipboardList } from 'lucide-react'
import { reviewerService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState, SkeletonCard } from '../components/ui/primitives'

export function ReviewerQueuePage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['review-queue'], queryFn: reviewerService.queue })
  const [confirming, setConfirming] = useState<{ reviewId: string; decision: 'confirm_overlap' | 'dismiss' | 'needs_review' } | null>(null)

  const mutation = useMutation({
    mutationFn: ({ reviewId, decision }: { reviewId: string; decision: 'confirm_overlap' | 'dismiss' | 'needs_review' }) =>
      reviewerService.decide(reviewId, decision),
    onSuccess: () => {
      toast.success('Review decision saved')
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      setConfirming(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save decision'),
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Originality Review Queue</h1>
      <p className="text-muted text-sm mb-6">High-similarity ideas awaiting human confirmation before a flag reaches the student.</p>

      {isLoading && <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon={ClipboardList} title="Review queue is empty" description="Nothing needs your attention right now." />
      )}

      <div className="space-y-3">
        {data?.items.map((item) => (
          <Card key={item.reviewId} className="p-4">
            <Link to={`/review/${item.reviewId}`} className="block mb-3">
              <div className="font-medium text-sm">{item.title}</div>
              <p className="text-xs text-muted mt-1">{item.description}</p>
              <p className="text-xs text-muted mt-1">Top similarity: <span className="text-danger-500 font-medium">{item.topSimilarity}%</span> · submitted {new Date(item.submittedAt).toLocaleDateString()}</p>
            </Link>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={() => setConfirming({ reviewId: item.reviewId, decision: 'confirm_overlap' })}>Confirm overlap</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirming({ reviewId: item.reviewId, decision: 'dismiss' })}>Dismiss</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming({ reviewId: item.reviewId, decision: 'needs_review' })}>Needs more review</Button>
            </div>
          </Card>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
          <Card className="p-5 max-w-sm w-full">
            <p className="text-sm font-medium mb-1">Confirm decision</p>
            <p className="text-xs text-muted mb-4">Mark this idea as "{confirming.decision.replace('_', ' ')}"? This will update its status and remove it from the queue.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate(confirming)}>Confirm</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
