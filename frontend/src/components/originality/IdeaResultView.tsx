import { Link } from 'react-router-dom'
import { CheckCircle2, Info, SearchCheck, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from '../ui/primitives'
import { Card } from '../ui/Card'
import { Meter, Notice } from '../ui/kit'
import { formatDate, titleCase } from '../../lib/format'
import type { IdeaResult, WordingOverlap } from '../../types'

const LEVEL = {
  no_significant_match: { icon: CheckCircle2, tone: 'text-success-500 bg-success-500/10', title: 'No significant match found' },
  related_work: { icon: SearchCheck, tone: 'text-warning-500 bg-warning-500/10', title: 'Related prior work found' },
  high_overlap: { icon: ShieldAlert, tone: 'text-danger-500 bg-danger-500/10', title: 'Substantial semantic overlap' },
  no_corpus: { icon: Info, tone: 'text-muted bg-black/[0.05] dark:bg-white/[0.08]', title: 'Nothing to compare against yet' },
} as const

const WORDING = { exact: 'Identical wording', near_duplicate: 'Very similar wording' } as const
const wordingNote = (w: WordingOverlap) => `${Math.round(w.jaccard * 100)}% of 3-word sequences are shared (${w.scope ?? 'title and description'}). Shared wording is a prompt to compare the two ideas, not proof of copying.`

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

      {r.coverage && (r.coverage.sections > 1 || r.coverage.complete === false) && (
        <Notice tone={r.coverage.complete ? 'neutral' : 'warning'} title={r.coverage.complete ? 'Long idea analysed in sections' : 'Part of your idea may not have been compared'}>
          {r.coverage.sections > 1 && <>Your idea is longer than the model reads at once, so it was compared in {r.coverage.sections} overlapping sections and each existing idea is shown at its best-matching section. </>}
          {r.coverage.complete
            ? 'Every part of your text was checked to fit the model. '
            : r.coverage.verified === 'estimate'
              ? 'The model’s own length check was unavailable, so coverage could not be verified. '
              : `It needs ${r.coverage.sectionsNeeded ?? 'more'} sections and only the first ${r.coverage.sections} were compared, so text near the end was not. `}
          Existing ideas in the corpus are compared on roughly their first 190 words.</Notice>)}

      {r.previousChecks && r.previousChecks.length > 0 && (
        <section aria-label="Your earlier checks"><h3 className="text-sm font-semibold mb-3">You checked something similar before</h3>
          <ul className="space-y-2">{r.previousChecks.map((p) => (
            <li key={p.id}><Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0"><Link to={`/originality/history/${p.id}`} className="font-medium text-sm underline focus-ring rounded">{p.title}</Link>
                <p className="text-xs text-muted mt-0.5">Checked {formatDate(p.checkedAt)} · Status: {titleCase(p.status)}{p.wording && <> · <Badge tone="warning">{WORDING[p.wording]}</Badge></>}</p></div>
              <span className="text-lg font-semibold tabular-nums shrink-0">{Math.round(p.similarity)}%</span></Card></li>))}</ul>
          <p className="text-xs text-muted mt-2">Only you can see this. Your earlier result is unchanged and is not counted as a match against other work.</p>
        </section>)}

      <section aria-label="Closest matches"><h3 className="text-sm font-semibold mb-3">Closest matches in the comparison corpus</h3>
        {r.matches.length === 0 ? <p className="text-sm text-muted">No comparable ideas were found.</p> : (
          <ol className="space-y-3">{r.matches.map((m) => (
            <li key={m.id}><Card className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-sm">{m.title}</p><p className="text-xs text-muted mt-0.5 line-clamp-2">{m.description}</p></div><span className="text-lg font-semibold tabular-nums shrink-0">{Math.round(m.similarity)}%</span></div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3"><Meter label="Overall semantic similarity" value={m.overlap.semantic} tone="var(--color-accent-500)" /><Meter label="Title similarity" value={m.overlap.title} tone="var(--color-accent-500)" /></div>
              {m.overlap.wording?.signal && <p className="text-xs mt-3 flex flex-wrap items-center gap-1.5"><Badge tone="warning">{WORDING[m.overlap.wording.signal]}</Badge><span className="text-muted">{wordingNote(m.overlap.wording)}</span></p>}
              {m.overlap.sharedPhrases && m.overlap.sharedPhrases.length > 0 && <p className="text-xs mt-3"><span className="text-muted">Shared phrases: </span>{m.overlap.sharedPhrases.map((t) => <Badge key={t}>“{t}”</Badge>)}</p>}
              {m.overlap.sharedTerms.length > 0 && <p className="text-xs mt-3"><span className="text-muted">Shared terms: </span>{m.overlap.sharedTerms.map((t) => <Badge key={t}>{t}</Badge>)}</p>}
              {m.source && <p className="text-[11px] text-muted mt-2">Source: {m.source}</p>}
            </Card></li>))}</ol>)}
        {!!r.display?.hiddenWeakMatches && <p className="text-xs text-muted mt-3">{r.display.hiddenWeakMatches} weaker {r.display.hiddenWeakMatches === 1 ? 'match' : 'matches'} {r.display.floor !== null && r.display.floor !== undefined ? `(below ${Math.round(r.display.floor * 100)}% similarity) ` : ''}{r.display.hiddenWeakMatches === 1 ? 'is' : 'are'} not shown. {r.review ? 'Reviewers can see them.' : ''}</p>}
      </section>

      <Card className="p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">How this was analysed</h3>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs"><div><dt className="text-muted inline">Method: </dt><dd className="inline">{r.method.description}</dd></div><div><dt className="text-muted inline">Comparison corpus: </dt><dd className="inline">{r.method.corpusSize} ideas</dd></div>
          {r.method.thresholds && <div><dt className="text-muted inline">Review threshold: </dt><dd className="inline">{Math.round(r.method.thresholds.review * 100)}% similarity · related ≥ {Math.round(r.method.thresholds.related * 100)}%</dd></div>}<div><dt className="text-muted inline">Checked: </dt><dd className="inline">{formatDate(r.createdAt)}</dd></div></dl>
        <p className="text-xs text-muted mt-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" aria-hidden /> {r.disclaimer} A “no match” only means nothing similar exists in the corpus above, not on the wider internet.</p></Card>
    </div>
  )
}
