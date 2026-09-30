import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives'
import { Dialog, Meter, Notice, PageHeader, Tabs } from '../components/ui/kit'
import { reviewerService } from '../lib/services'
import { formatDate, timeAgo, titleCase } from '../lib/format'
import type { ApiError } from '../lib/api'
import type { ReviewDecisionKind } from '../types'

const ACTIONS: { kind: ReviewDecisionKind; label: string; help: string; note: 'required' | 'optional'; variant: 'primary' | 'secondary' | 'danger' }[] = [
  { kind: 'approve', label: 'Approve', help: 'The idea is sufficiently distinct. The student is told it was approved.', note: 'optional', variant: 'primary' },
  { kind: 'request_changes', label: 'Request changes', help: 'Ask the student to differentiate or clarify. They see your note.', note: 'required', variant: 'secondary' },
  { kind: 'escalate', label: 'Escalate', help: 'Hand this to an administrator. Reviewers can no longer decide it.', note: 'optional', variant: 'secondary' },
  { kind: 'reject', label: 'Reject', help: 'The idea substantially duplicates existing work. The student sees your note.', note: 'required', variant: 'danger' },
]

export function ReviewerQueuePage() {
  const [state, setState] = useState<'pending' | 'escalated'>('pending')
  const q = useQuery({ queryKey: ['review-queue', state], queryFn: () => reviewerService.queue(state) })
  return (
    <div>
      <PageHeader title="Review queue" subtitle="Ideas whose semantic similarity crossed the review threshold. Every decision is recorded in an append-only audit log." />
      <Tabs label="Queue" value={state} onChange={setState} tabs={[{ id: 'pending', label: 'Pending', count: q.data?.counts.pending ?? 0 }, { id: 'escalated', label: 'Escalated', count: q.data?.counts.escalated ?? 0 }]} />
      <div className="mt-4" role="tabpanel" id={`panel-${state}`} aria-labelledby={`tab-${state}`}>
        {q.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
          : !q.data?.items.length ? <EmptyState icon={ClipboardCheck} title="Queue is clear" description={state === 'pending' ? 'Nothing is waiting for a decision.' : 'No escalated reviews.'} />
          : <ul className="space-y-3">{q.data.items.map((i) => (
            <li key={i.reviewId}><Link to={`/review/${i.reviewId}`} className="block focus-ring rounded-xl"><Card variant="interactive" className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-sm">{i.title}</p><p className="text-xs text-muted mt-1 line-clamp-2">{i.description}</p></div>
                {i.topSimilarity !== null && <span className="text-lg font-semibold tabular-nums shrink-0">{Math.round(i.topSimilarity)}%</span>}</div>
              <div className="flex flex-wrap gap-2 mt-3 items-center"><Badge tone={i.state === 'escalated' ? 'warning' : 'accent'}>{i.state}</Badge>{i.confidence && <Badge>{i.confidence} confidence</Badge>}{i.isMine && <Badge tone="danger">your own idea</Badge>}<span className="text-xs text-muted">queued {timeAgo(i.queuedAt)}</span></div></Card></Link></li>))}</ul>}
      </div>
    </div>
  )
}

export function ReviewerDetailPage() {
  const { reviewId = '' } = useParams(); const nav = useNavigate(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['review', reviewId], queryFn: () => reviewerService.detail(reviewId), retry: false })
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null); const [note, setNote] = useState('')
  const decide = useMutation({ mutationFn: () => reviewerService.decide(reviewId, action!.kind, note.trim()), onSuccess: () => { toast.success('Decision recorded'); setAction(null); setNote(''); for (const k of ['review', 'review-queue']) qc.invalidateQueries({ queryKey: [k] }); if (action?.kind !== 'escalate') nav('/review') }, onError: (e: ApiError) => toast.error(e.message) })
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState message={(q.error as ApiError)?.status === 404 ? 'That review does not exist.' : (q.error as Error)?.message} onRetry={(q.error as ApiError)?.status === 404 ? () => nav('/review') : () => q.refetch()} />
  const r = q.data
  const needNote = action?.note === 'required' && note.trim().length === 0
  return (
    <div className="max-w-4xl">
      <Link to="/review" className="text-xs text-muted hover:text-[var(--text)] focus-ring rounded">← Queue</Link>
      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">{r.idea.title}</h1><p className="text-xs text-muted mt-1">Submitted {formatDate(r.idea.submittedAt)}{r.idea.domain && ` · ${r.idea.domain}`}{r.idea.opportunity && ` · for ${r.idea.opportunity}`}</p></div><Badge tone={r.state === 'escalated' ? 'warning' : r.state === 'decided' ? 'success' : 'accent'}>{r.state}</Badge></div>

      <Card className="p-5 mb-5"><h2 className="text-sm font-semibold mb-2">Submitted idea</h2><p className="text-sm whitespace-pre-line leading-relaxed">{r.idea.description}</p></Card>
      <Card className="p-5 mb-5"><h2 className="text-sm font-semibold mb-3">Similarity evidence</h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm"><div><div className="text-2xl font-semibold tabular-nums">{r.similarity.top !== null ? `${Math.round(r.similarity.top)}%` : '—'}</div><div className="text-xs text-muted">closest match</div></div><div><div className="text-sm font-medium capitalize">{r.similarity.confidence ?? '—'}</div><div className="text-xs text-muted">confidence</div></div><div><div className="text-sm font-medium">{r.similarity.corpusSize ?? '—'} ideas</div><div className="text-xs text-muted">comparison corpus</div></div></div>
        <p className="text-xs text-muted mt-3">{r.similarity.method}. {r.similarity.disclaimer}</p>
        <ol className="mt-4 space-y-3">{r.matches.map((m, i) => (<li key={m.id + i} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium">{m.title} <Badge tone={m.kind === 'reference' ? 'neutral' : 'warning'}>{m.kind}</Badge></p><p className="text-xs text-muted mt-1 line-clamp-3">{m.description}</p></div><span className="font-semibold tabular-nums">{Math.round(m.similarity)}%</span></div>
          {m.overlap.semantic !== undefined && <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-2"><Meter label="Semantic" value={m.overlap.semantic ?? null} tone="var(--color-accent-500)" /><Meter label="Title" value={m.overlap.title ?? null} tone="var(--color-accent-500)" /></div>}
          {m.overlap.sharedTerms && m.overlap.sharedTerms.length > 0 && <p className="text-xs mt-2 text-muted">Shared terms: {m.overlap.sharedTerms.join(', ')}</p>}
          {!m.shownToSubmitter && <p className="text-[11px] text-warning-500 mt-1.5">Hidden from the submitter (another student's work).</p>}</li>))}</ol></Card>
      <Card className="p-5 mb-5"><h2 className="text-sm font-semibold mb-2">Submitter's history</h2>{Object.keys(r.submitterHistory).length === 0 ? <p className="text-sm text-muted">No other ideas.</p> : <div className="flex flex-wrap gap-2">{Object.entries(r.submitterHistory).map(([s, n]) => <Badge key={s}>{titleCase(s)}: {n}</Badge>)}</div>}</Card>
      <Card className="p-5 mb-5"><h2 className="text-sm font-semibold mb-3">Decision history</h2>{r.decisions.length === 0 ? <p className="text-sm text-muted">No decisions yet.</p> : <ol className="space-y-3">{r.decisions.map((d, i) => <li key={i} className="text-sm"><Badge>{titleCase(d.decision)}</Badge> <span className="text-xs text-muted ml-2">{d.reviewer} · {formatDate(d.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>{d.note && <p className="mt-1 italic text-muted">“{d.note}”</p>}</li>)}</ol>}</Card>

      {r.canDecide ? (
        <Card variant="elevated" className="p-5"><h2 className="text-sm font-semibold mb-3">Your decision</h2><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{ACTIONS.map((a) => <Button key={a.kind} variant={a.variant} onClick={() => { setAction(a); setNote('') }}>{a.label}</Button>)}</div></Card>
      ) : <Notice tone="warning" title="You can't decide this one">{r.isMine ? 'It is your own idea — reviewers cannot decide on their own submissions.' : r.state === 'decided' ? 'It has already been decided.' : 'It has been escalated and can only be decided by an administrator.'}</Notice>}

      <Dialog open={!!action} onClose={() => setAction(null)} title={action?.label ?? ''} description={action?.help} footer={<><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button variant={action?.variant === 'danger' ? 'danger' : 'primary'} onClick={() => decide.mutate()} loading={decide.isPending} disabled={needNote}>Confirm {action?.label.toLowerCase()}</Button></>}>
        <Textarea label={action?.note === 'required' ? 'Note to the student (required)' : 'Note (optional)'} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[11px] text-muted mt-2">This creates an immutable decision record and an audit entry with your name.</p>
      </Dialog>
    </div>
  )
}
