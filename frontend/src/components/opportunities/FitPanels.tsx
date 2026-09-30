import { AlertTriangle, Check, Info } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '../ui/Card'
import { ScoreRing } from '../ui/primitives'
import { Meter, Notice } from '../ui/kit'
import type { FitDetail, WhyNot } from '../../types'

export function FitPanel({ fit }: { fit: FitDetail }) {
  return (
    <Card className="p-5" aria-label="Why this fit">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="flex flex-col items-center gap-1"><ScoreRing value={fit.overall} label="NIRMAAN fit" /><span className="text-[11px] text-muted capitalize">{fit.confidence} confidence</span></div>
        <div className="flex-1 min-w-[220px] space-y-4">
          {fit.reasons.length > 0 && (
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Why</h3>
              <ul className="space-y-1">{fit.reasons.map((r) => <li key={r} className="flex gap-2 text-sm"><Check size={15} className="text-success-500 mt-0.5 shrink-0" aria-hidden /> {r}</li>)}</ul></div>
          )}
          {fit.concerns.length > 0 && (
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Watch</h3>
              <ul className="space-y-1">{fit.concerns.map((r) => <li key={r} className="flex gap-2 text-sm"><AlertTriangle size={15} className="text-warning-500 mt-0.5 shrink-0" aria-hidden /> {r}</li>)}</ul></div>
          )}
          {!fit.reasons.length && !fit.concerns.length && <p className="text-sm text-muted">Not enough profile information to explain this score yet.</p>}
        </div>
      </div>
      <details className="mt-5 group">
        <summary className="text-xs font-medium cursor-pointer text-accent-500 focus-ring rounded w-fit">How this score is calculated</summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {fit.components.map((c) => (
            <div key={c.key}>
              <Meter label={`${c.label} · weight ${Math.round(c.weight * 100)}%`} value={c.score} />
              <p className={clsx('text-[11px] mt-1', c.known ? 'text-muted' : 'text-muted italic')}>{c.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-3 flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" aria-hidden /> Unknown inputs are left out rather than guessed, so a sparse profile lowers confidence. The same profile and listing always give the same score.</p>
      </details>
    </Card>
  )
}

const SEV = { blocker: 'text-danger-500 bg-danger-500/10', warning: 'text-warning-500 bg-warning-500/10', info: 'text-muted bg-black/[0.05] dark:bg-white/[0.08]' } as const

export function WhyNotPanel({ data }: { data: WhyNot }) {
  const shown = data.blockers
  if (!shown.length && !data.verify.length) return <Notice tone="success" title="No blockers found">Nothing in your profile conflicts with this opportunity's structured requirements.</Notice>
  return (
    <Card className="p-5" aria-label="What is in the way">
      <h3 className="text-sm font-semibold mb-1">{data.mainBlockers.length ? `Main blockers: ${data.mainBlockers.join(' · ')}` : 'Things to keep in mind'}</h3>
      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {shown.map((b) => (
          <li key={b.kind + b.title} className="py-3 flex gap-3">
            <span className={clsx('h-6 shrink-0 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide inline-flex items-center', SEV[b.severity])}>{b.severity}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{b.title}</p><p className="text-xs text-muted mt-0.5">{b.detail}</p><p className="text-xs mt-1"><span className="text-muted">What helps: </span>{b.fix}</p></div>
            {b.impact > 0 && <span className="text-xs font-semibold text-success-500 whitespace-nowrap tabular-nums" title="Fit points gained if this were resolved">+{b.impact.toFixed(1)} pts</span>}
          </li>
        ))}
      </ul>
      {data.verify.length > 0 && <div className="mt-2"><Notice title="Verify on the official page">{data.verify.join(' · ')}</Notice></div>}
    </Card>
  )
}
