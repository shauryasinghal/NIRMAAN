import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import { reviewerService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SkeletonCard } from '../components/ui/primitives'

export function ReviewerDetailPage() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['review-queue'], queryFn: reviewerService.queue })
  const item = data?.items.find((i) => i.reviewId === reviewId)

  const mutation = useMutation({
    mutationFn: (decision: 'confirm_overlap' | 'dismiss' | 'needs_review') => reviewerService.decide(reviewId!, decision),
    onSuccess: () => {
      toast.success('Review decision saved')
      qc.invalidateQueries({ queryKey: ['review-queue'] })
      navigate('/review')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save decision'),
  })

  if (isLoading) return <SkeletonCard />
  if (!item) {
    return (
      <div>
        <Link to="/review" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to queue</Link>
        <p className="text-sm text-muted">This item is no longer in the queue (already decided, or an invalid link).</p>
      </div>
    )
  }

  return (
    <div>
      <Link to="/review" className="text-sm text-muted flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Back to queue</Link>

      <Card className="p-6 mb-4">
        <h1 className="text-lg font-semibold">{item.title}</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">{item.description}</p>
        <p className="text-xs text-muted mt-3">Submitted {new Date(item.submittedAt).toLocaleString()}</p>
      </Card>

      <Card className="p-6 mb-4">
        <h2 className="text-sm font-medium mb-3">Similarity evidence</h2>
        <p className="text-sm mb-3">Top similarity: <span className="text-danger-500 font-semibold">{item.topSimilarity}%</span></p>
        <div className="space-y-2">
          {item.matches.map((m) => (
            <div key={m.id} className="border rounded-lg p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between"><span className="font-medium">{m.title}</span><span className="text-accent-500">{m.similarity}%</span></div>
              <p className="text-xs text-muted mt-1">{m.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate('confirm_overlap')}>Confirm overlap</Button>
        <Button variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate('dismiss')}>Dismiss</Button>
        <Button variant="ghost" loading={mutation.isPending} onClick={() => mutation.mutate('needs_review')}>Needs more review</Button>
      </div>
    </div>
  )
}
