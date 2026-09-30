import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { Dialog, PageHeader } from '../components/ui/kit'
import { IdeaResultView } from '../components/originality/IdeaResultView'
import { ideaService } from '../lib/services'
import { formatDate, titleCase } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { IdeaHistoryItem } from '../types'

const tone = (l: string | null) => (l === 'high_overlap' ? 'danger' : l === 'related_work' ? 'warning' : l === 'no_significant_match' ? 'success' : 'neutral') as 'danger' | 'warning' | 'success' | 'neutral'
const LABEL: Record<string, string> = { no_significant_match: 'No significant match', related_work: 'Related work', high_overlap: 'High overlap', no_corpus: 'No corpus' }

export function OriginalityHistoryPage() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['ideas'], queryFn: ideaService.list })
  const [del, setDel] = useState<IdeaHistoryItem | null>(null)
  const remove = useMutation({ mutationFn: (id: string) => ideaService.remove(id), onSuccess: () => { toast.success('Deleted'); setDel(null); for (const k of ['ideas', 'dashboard']) qc.invalidateQueries({ queryKey: [k] }) }, onError: (e: ApiError) => toast.error(e.message) })
  return (
    <div className="max-w-4xl">
      <PageHeader title="Idea history" subtitle="Every idea you've checked, with its result and review status." actions={<Link to="/originality"><Button>Check another idea</Button></Link>} />
      {q.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        : !q.data?.items.length ? <EmptyState icon={History} title="No ideas checked yet" description="Check an idea to see how it compares before you build it." action={<Link to="/originality"><Button>Check an idea</Button></Link>} />
        : <ul className="space-y-3">{q.data.items.map((i) => (
          <li key={i.id}><Card className="p-4 flex items-center justify-between gap-3">
            <Link to={`/originality/history/${i.id}`} className="min-w-0 flex-1 focus-ring rounded"><p className="font-medium text-sm truncate">{i.title}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><Badge tone={tone(i.level)}>{LABEL[i.level ?? ''] ?? titleCase(i.status)}</Badge>{i.topSimilarity !== null && <span className="text-xs text-muted tabular-nums">{Math.round(i.topSimilarity)}% closest match</span>}{i.reviewState && <Badge tone={i.reviewState === 'decided' ? 'success' : 'warning'}>review {i.reviewState}</Badge>}<span className="text-xs text-muted">{formatDate(i.createdAt)}</span></div></Link>
            <Button variant="ghost" size="sm" onClick={() => setDel(i)} aria-label={`Delete ${i.title}`}><Trash2 size={14} /></Button></Card></li>))}</ul>}
      <Dialog open={!!del} onClose={() => setDel(null)} title="Delete this idea check?" description={del?.title} footer={<><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={() => del && remove.mutate(del.id)} loading={remove.isPending}>Delete</Button></>}><p className="text-sm text-muted">Any review of it is removed from your view; reviewer decisions remain in the audit log.</p></Dialog>
    </div>
  )
}

export function IdeaDetailPage() {
  const { id = '' } = useParams(); const nav = useNavigate()
  const q = useQuery({ queryKey: ['idea', id], queryFn: () => ideaService.get(id), retry: false })
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-48 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState message={(q.error as ApiError)?.status === 404 ? 'That idea check does not exist.' : (q.error as Error)?.message} onRetry={(q.error as ApiError)?.status === 404 ? () => nav('/originality/history') : () => q.refetch()} />
  return <div className="max-w-4xl"><Link to="/originality/history" className="text-xs text-muted hover:text-[var(--text)] focus-ring rounded">← History</Link><h1 className="text-2xl font-semibold tracking-tight mt-3 mb-1">{q.data.title}</h1><p className="text-sm text-muted mb-6 whitespace-pre-line">{q.data.description}</p><IdeaResultView r={q.data} /></div>
}
