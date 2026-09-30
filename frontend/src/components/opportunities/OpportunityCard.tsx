import { Link } from 'react-router-dom'
import { Check, Triangle } from 'lucide-react'
import type { RecommendedOpportunity } from '../../types'
import { Badge } from '../ui/primitives'
import { SaveButton } from './SaveButton'

const URGENCY_LABEL: Record<string, string> = {
  critical: 'Closes soon', soon: 'Closing this week', open: 'Open', expired: 'Closed', unknown: '',
}
const URGENCY_TONE: Record<string, 'danger' | 'warning' | 'success' | 'neutral'> = {
  critical: 'danger', soon: 'warning', open: 'success', expired: 'neutral', unknown: 'neutral',
}

export function OpportunityCard({
  opp, compareMode, selected, onToggleCompare,
}: {
  opp: RecommendedOpportunity
  compareMode?: boolean
  selected?: boolean
  onToggleCompare?: (id: string) => void
}) {
  const fitTone = opp.fitScore >= 65 ? 'success' : opp.fitScore >= 35 ? 'warning' : 'danger'
  return (
    <Link
      to={`/opportunities/${opp.id}`}
      onClick={(e) => { if (compareMode) { e.preventDefault(); onToggleCompare?.(opp.id) } }}
      className="block rounded-lg border p-4 hover:border-accent-500/50 transition-colors relative"
      style={{ borderColor: selected ? 'var(--color-accent-500)' : 'var(--border)' }}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          {compareMode && (
            <span
              className="mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0"
              style={{ borderColor: selected ? 'var(--color-accent-500)' : 'var(--border)', background: selected ? 'var(--color-accent-500)' : 'transparent' }}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
            </span>
          )}
          <div className="min-w-0">
            <div className="font-medium text-sm">{opp.title}</div>
            <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{opp.organization} · {opp.domain} · deadline {opp.deadline || 'TBD'}</span>
              {opp.category && <Badge tone="neutral">{opp.category}</Badge>}
              {opp.urgency && opp.urgency !== 'unknown' && (
                <Badge tone={URGENCY_TONE[opp.urgency]}>{URGENCY_LABEL[opp.urgency]}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          <div className="text-right">
            <div className="text-lg font-semibold text-accent-500">{opp.fitScore}%</div>
            <Badge tone={fitTone as 'success' | 'warning' | 'danger'}>
              {opp.fitScore >= 65 ? 'Excellent fit' : opp.fitScore >= 35 ? 'Good fit' : 'Partial fit'}
            </Badge>
          </div>
          {!compareMode && <SaveButton opportunityId={opp.id} />}
        </div>
      </div>
      <p className="text-xs text-muted mt-2">{opp.reason}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {opp.matchedSkills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-success-500/10 text-success-500">
            <Check size={10} /> {s}
          </span>
        ))}
        {opp.missingSkills.slice(0, 2).map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-warning-500/10 text-warning-500">
            <Triangle size={10} /> {s}
          </span>
        ))}
      </div>
    </Link>
  )
}
