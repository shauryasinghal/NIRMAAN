import { CheckCircle2, Info, SearchCheck, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from '../ui/primitives'
import { Card } from '../ui/Card'
import { Meter, Notice } from '../ui/kit'
import { formatDate, titleCase } from '../../lib/format'
import type { IdeaResult } from '../../types'

const LEVEL = {
  no_significant_match: { icon: CheckCircle2, tone: 'text-success-500 bg-success-500/10', title: 'No significant match found' },
  related_work: { icon: SearchCheck, tone: 'text-warning-500 bg-warning-500/10', title: 'Related prior work found' },
  high_overlap: { icon: ShieldAlert, tone: 'text-danger-500 bg-danger-500/10', title: 'Substantial semantic overlap' },
  no_corpus: { icon: Info, tone: 'text-muted bg-black/[0.05] dark:bg-white/[0.08]', title: 'Nothing to compare against yet' },
} as const

export function IdeaResultView({ r }: { r: IdeaResult }) {
  const L = LEVEL[r.verdict.level] ?? LEVEL.no_corpus
  const Icon = L.icon
  return (
    <div className="space-y-5">
      <Card variant="elevated" className="p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <span className={clsx('h-11 w-11 rounded-xl inline-flex items-center justify-center shrink-0', L.tone)}><Icon size={22} aria-hidden /></span>
          <div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-wide text-muted">Originality signal</p><h2 className="text-lg font-semibold">{r.verdict.label || L.title}</h2>
            <p className="text-sm mt-1 leading-relaxed">{r.verdict.message}</p></div>
          {r.topSimilarity !== null && <div className="text-right"><div className="text-3xl font-semibold tabular-nums">{Math.round(r.topSimilarity)}%</div><div className="text-[11px] text-muted">closest semantic match</div></div>}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {r.confidence && <Badge tone={r.confidence === 'high' ? 'success' : r.confidence === 'medium' ? 'accent' : 'warning'}>{r.confidence} confidence</Badge>}
          {r.review && <Badge tone={r.review.state === 'decided' ? 'success' : 'warning'}>Review: {r.review.state}</Badge>}
          <Badge>Status: {titleCase(r.status)}</Badge>
        </div>
        {r.verdict.needsReview && !r.review?.decisions.length && <div className="mt-4"><Notice tone="warning" title="Queued for human review">A reviewer will look at the closest matches. Similarity alone never becomes a plagiarism finding.</Notice></div>}
        {r.peerOverlapsExist && <div className="mt-3"><Notice>Another idea on the platform is also semantically close. Details are only shared with reviewers, to protect other students' work.</Notice></div>}
      </Card>

      {r.review?.decisions.length ? (
        <Card className="p-5"><h3 className="text-sm font-semibold mb-3">Reviewer decision</h3>
          <ul className="space-y-3">{r.review.decisions.map((d, i) => <li key={i} className="text-sm"><Badge tone={d.decision === 'approve' || d.decision === 'dismiss' ? 'success' : d.decision === 'request_changes' || d.decision === 'escalate' ? 'warning' : 'danger'}>{titleCase(d.decision)}</Badge> <time className="text-xs text-muted ml-2" dateTime={d.at}>{formatDate(d.at)}</time>{d.note && <p className="mt-1.5 italic text-muted">“{d.note}”</p>}</li>)}</ul></Card>
      ) : null}

      <section aria-label="Closest matches"><h3 className="text-sm font-semibold mb-3">Closest matches in the comparison corpus</h3>
        {r.matches.length === 0 ? <p className="text-sm text-muted">No comparable ideas were found.</p> : (
          <ol className="space-y-3">{r.matches.map((m) => (
            <li key={m.id}><Card className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-sm">{m.title}</p><p className="text-xs text-muted mt-0.5 line-clamp-2">{m.description}</p></div><span className="text-lg font-semibold tabular-nums shrink-0">{Math.round(m.similarity)}%</span></div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3"><Meter label="Overall semantic similarity" value={m.overlap.semantic} tone="var(--color-accent-500)" /><Meter label="Title similarity" value={m.overlap.title} tone="var(--color-accent-500)" /></div>
              {m.overlap.sharedTerms.length > 0 && <p className="text-xs mt-3"><span className="text-muted">Shared terms: </span>{m.overlap.sharedTerms.map((t) => <Badge key={t}>{t}</Badge>)}</p>}
              {m.source && <p className="text-[11px] text-muted mt-2">Source: {m.source}</p>}
            </Card></li>))}</ol>)}
      </section>

      <Card className="p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">How this was analysed</h3>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs"><div><dt className="text-muted inline">Method: </dt><dd className="inline">{r.method.description}</dd></div><div><dt className="text-muted inline">Comparison corpus: </dt><dd className="inline">{r.method.corpusSize} ideas</dd></div>
          {r.method.thresholds && <div><dt className="text-muted inline">Review threshold: </dt><dd className="inline">{Math.round(r.method.thresholds.review * 100)}% similarity · related ≥ {Math.round(r.method.thresholds.related * 100)}%</dd></div>}<div><dt className="text-muted inline">Checked: </dt><dd className="inline">{formatDate(r.createdAt)}</dd></div></dl>
        <p className="text-xs text-muted mt-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" aria-hidden /> {r.disclaimer} A “no match” only means nothing similar exists in the corpus above, not on the wider internet.</p></Card>
    </div>
  )
}
