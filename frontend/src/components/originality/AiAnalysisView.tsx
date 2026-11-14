import { useState } from 'react'
import { AlertTriangle, Lightbulb, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from '../ui/primitives'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Notice } from '../ui/kit'
import { formatDate } from '../../lib/format'
import type { AiAnalysis, AiDimension, AiMatchAssessment, AiRelationship, IdeaSections } from '../../types'

const LEVEL_TONE: Record<AiDimension['level'], 'success' | 'warning' | 'danger'> = { low: 'success', moderate: 'warning', high: 'danger' }
const RELATION_TONE: Record<AiRelationship, 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
  largely_unrelated: 'success', similar_problem_different_solution: 'accent', similar_solution_different_implementation: 'warning', similar_functionality_and_approach: 'warning', potentially_substantial_overlap: 'danger',
}
const RELATION_HELP: Record<AiRelationship, string> = {
  largely_unrelated: 'The two ideas have little in common beyond general terms.',
  similar_problem_different_solution: 'Both address a similar problem, but the way they solve it is clearly different. Solving the same problem is not plagiarism.',
  similar_solution_different_implementation: 'The solution concept is similar, but it is built in a materially different way.',
  similar_functionality_and_approach: 'Both the functionality and the technical approach are similar. Look at what sets yours apart.',
  potentially_substantial_overlap: 'The texts describe substantially the same idea. A reviewer should compare them; this is not a plagiarism finding.',
}
const SUGGESTION_KIND: Record<string, string> = { new_feature: 'New feature', technical_approach: 'Technical approach', target_users: 'Target users', implementation: 'Implementation', use_case: 'New use case', problem_approach: 'Problem approach' }
const SECTION_LABEL: Record<string, string> = { problem_statement: 'Problem statement', objectives: 'Objectives', proposed_solution: 'Proposed solution', technologies: 'Technologies', additional_context: 'Additional context' }
const DIMENSIONS: { key: keyof Pick<AiMatchAssessment, 'problemSimilarity' | 'solutionSimilarity' | 'functionalSimilarity' | 'targetUserSimilarity' | 'technicalApproachSimilarity'>; label: string }[] = [
  { key: 'problemSimilarity', label: 'Problem' }, { key: 'solutionSimilarity', label: 'Solution' }, { key: 'functionalSimilarity', label: 'Functionality' },
  { key: 'targetUserSimilarity', label: 'Target users' }, { key: 'technicalApproachSimilarity', label: 'Technical approach' },
]

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-muted">{empty}</p>
  return <ul className="list-disc pl-4 space-y-1 text-sm">{items.map((t) => <li key={t}>{t}</li>)}</ul>
}

function MatchComparison({ m, mine }: { m: AiMatchAssessment; mine: { title: string; description: string; sections?: IdeaSections | null } }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0"><p className="font-medium text-sm">{m.title}</p><div className="flex flex-wrap gap-1.5 mt-1.5"><Badge tone={RELATION_TONE[m.relationship]}>{m.relationshipLabel}</Badge></div></div>
        <div className="text-right shrink-0"><div className="text-lg font-semibold tabular-nums">{Math.round(m.similarity)}%</div><div className="text-[11px] text-muted">embedding similarity (measured)</div></div>
      </div>
      <p className="text-xs text-muted mt-2">{RELATION_HELP[m.relationship]}</p>
      <p className="text-sm mt-3 leading-relaxed">{m.summary}</p>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-4">
        {DIMENSIONS.map(({ key, label }) => (
          <div key={key} className="text-xs"><dt className="flex items-center gap-2"><span className="font-medium">{label}</span><Badge tone={LEVEL_TONE[m[key].level]}>{m[key].level} similarity</Badge></dt><dd className="text-muted mt-1 leading-relaxed">{m[key].explanation}</dd></div>
        ))}
      </dl>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Common features</h4><List items={m.commonFeatures} empty="No shared features were identified." /></div>
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Unique to your idea</h4><List items={m.uniqueToSubmission} empty="Nothing unique to your idea was identified against this match." /></div>
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Meaningful differences</h4><List items={m.meaningfulDifferences} empty="No meaningful differences were identified." /></div>
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Possibly reused concepts</h4><List items={m.potentiallyReusedConcepts} empty="None identified from the texts." /></div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs text-accent-500 mt-4 focus-ring rounded">{open ? 'Hide side-by-side text' : 'Show side-by-side text'}</button>
      {open && (
        <div className="grid sm:grid-cols-2 gap-4 mt-3 text-xs">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><p className="font-semibold mb-1">Your idea</p><p className="font-medium">{mine.title}</p><p className="text-muted mt-1 whitespace-pre-line leading-relaxed">{mine.description}</p>
            {mine.sections && Object.entries(mine.sections).filter(([, v]) => v).map(([k, v]) => <p key={k} className="mt-2"><span className="font-medium">{SECTION_LABEL[k] ?? k}: </span><span className="text-muted">{v}</span></p>)}</div>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><p className="font-semibold mb-1">Existing idea</p><p className="font-medium">{m.title}</p><p className="text-muted mt-1 leading-relaxed">Shown above in “Closest matches” (first part of its description).</p></div>
        </div>)}
    </Card>
  )
}

export function AiAnalysisView({ a, mine, onRun, running, compact }: { a: AiAnalysis; mine: { title: string; description: string; sections?: IdeaSections | null }; onRun?: (force: boolean) => void; running?: boolean; compact?: boolean }) {
  if (a.status === 'disabled') return null
  const head = <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent-500" aria-hidden /><h3 className="text-sm font-semibold">AI deep analysis</h3><Badge tone="accent">{a.provider}{a.model ? ` · ${a.model}` : ''}</Badge></div>
  if (a.status === 'pending') {
    return (
      <Card className="p-5"><div className="flex items-start justify-between gap-3 flex-wrap">{head}{onRun && <Button size="sm" variant="secondary" onClick={() => onRun(false)} loading={running}>Run AI deep analysis</Button>}</div>
        <p className="text-sm text-muted mt-2">{running ? 'Gemini is reading your idea and the closest matches…' : 'The semantic similarity check is complete. The AI stage has not run for this idea yet.'}</p></Card>)
  }
  if (a.status === 'unavailable' || a.status === 'skipped') {
    return (
      <Card className="p-5">{head}
        <div className="mt-3"><Notice tone={a.status === 'skipped' ? 'neutral' : 'warning'} title={a.status === 'skipped' ? 'AI deep analysis was skipped' : 'AI deep analysis could not be completed'}>
          {a.error?.message ?? 'The AI stage did not produce a result.'} Your semantic similarity result above is complete and unaffected.
          {onRun && a.status === 'unavailable' && <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => onRun(true)} loading={running}>Try again</Button></div>}
        </Notice></div></Card>)
  }
  const r = a.report
  if (!r) return null
  return (
    <section aria-label="AI deep analysis" className="space-y-4">
      <Card variant="elevated" className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">{head}<Badge tone={r.confidence === 'high' ? 'success' : r.confidence === 'medium' ? 'accent' : 'warning'}>{r.confidence} confidence (AI)</Badge></div>
        <p className="text-sm mt-3 leading-relaxed">{r.overallSummary}</p>
        {a.embedding && (
          <dl className="grid sm:grid-cols-2 gap-3 mt-4 text-xs">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><dt className="text-muted">Measured embedding similarity</dt>
              <dd className="mt-1"><span className="text-xl font-semibold tabular-nums">{a.embedding.topSimilarity !== null ? `${Math.round(a.embedding.topSimilarity)}%` : '—'}</span>{a.embedding.band && <span className="ml-2 text-muted">{a.embedding.band.label}</span>}</dd>
              <dd className="text-muted mt-1">{a.embedding.method} · screening bands: below {Math.round(a.embedding.thresholds.related * 100)}% low, {Math.round(a.embedding.thresholds.related * 100)}–{Math.round(a.embedding.thresholds.review * 100)}% moderate, {Math.round(a.embedding.thresholds.review * 100)}%+ high (human review)</dd></div>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}><dt className="text-muted">AI qualitative assessment</dt><dd className="mt-1">Levels and explanations below are Gemini’s reading of the texts. They are words, not scores, and they are not combined with the percentage.</dd></div>
          </dl>)}
        <p className="text-xs text-muted mt-4 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden />{a.disclaimer}</p>
      </Card>

      {!compact && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-4"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Your unique contributions</h4><List items={r.uniqueContributions} empty="None were identified from the texts provided." /></Card>
          <Card className="p-4"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Potential overlap areas</h4><List items={r.potentialOverlapAreas} empty="No overlap areas were identified." /></Card>
          <Card className="p-4 sm:col-span-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Missing differentiating details</h4><p className="text-xs text-muted mb-2">Things a reader would expect your description to specify in order to tell it apart from existing ideas.</p><List items={r.missingDifferentiators} empty="Nothing was flagged as missing." /></Card>
        </div>)}

      <div><h3 className="text-sm font-semibold mb-3">Comparison with each closest match</h3>
        {r.matches.length === 0 ? <p className="text-sm text-muted">The AI stage did not return an assessment for any match.</p>
          : <ol className="space-y-3">{r.matches.map((m) => <li key={m.id}><MatchComparison m={m} mine={mine} /></li>)}</ol>}
        {r.matchesNotAssessed.length > 0 && <p className="text-xs text-muted mt-2">{r.matchesNotAssessed.length} {r.matchesNotAssessed.length === 1 ? 'match was' : 'matches were'} not assessed by the AI stage; the measured similarity for {r.matchesNotAssessed.length === 1 ? 'it' : 'them'} is still shown above.</p>}
      </div>

      {!compact && (
        <Card className="p-5"><div className="flex items-center gap-2 mb-3"><Lightbulb size={16} className="text-warning-500" aria-hidden /><h3 className="text-sm font-semibold">Ways to make your idea more distinctive</h3></div>
          {r.suggestions.length === 0 ? <p className="text-sm text-muted">No suggestions were produced.</p>
            : <ol className="space-y-3">{r.suggestions.map((s, i) => <li key={i} className="text-sm"><Badge tone="accent">{SUGGESTION_KIND[s.kind] ?? s.kind}</Badge><p className="mt-1.5 font-medium">{s.suggestion}</p><p className="text-xs text-muted mt-0.5 leading-relaxed">{s.rationale}</p></li>)}</ol>}
          <p className="text-xs text-muted mt-4">These are suggestions only. Your submitted idea has not been changed.</p></Card>)}

      <Card className={clsx('p-4', compact && 'text-xs')}><h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Confidence and limitations</h4>
        <List items={r.limitations} empty="No limitations were stated." />
        <p className="text-[11px] text-muted mt-3">Generated {a.generatedAt ? formatDate(a.generatedAt) : 'earlier'} by {a.provider}{a.model ? ` (${a.model})` : ''}{a.inputs ? ` from your text and ${a.inputs.matchesSent} reference ${a.inputs.matchesSent === 1 ? 'idea' : 'ideas'}; no other student’s submission was sent.` : '.'}</p></Card>
    </section>
  )
}
