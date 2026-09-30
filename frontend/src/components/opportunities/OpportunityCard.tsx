import { Link } from 'react-router-dom'
import { Building2, CalendarClock, MapPin, Users } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from '../ui/primitives'
import { DemoBadge, FitBadge, StatusPill } from '../ui/kit'
import { SaveButton } from './SaveButton'
import { deadlineLabel, money, titleCase } from '../../lib/format'
import type { OpportunityCardData } from '../../types'

export function OpportunityCard({ o, compare, onCompare, compareDisabled }: { o: OpportunityCardData; compare?: boolean; onCompare?: (id: string) => void; compareDisabled?: boolean }) {
  const matched = new Set(o.fit?.matchedSkills ?? [])
  const pay = money(o.stipendAmount, o.stipendCurrency)
  const team = o.participation === 'team' ? (o.minTeamSize && o.maxTeamSize ? `Team of ${o.minTeamSize}–${o.maxTeamSize}` : o.minTeamSize ? `Team of ${o.minTeamSize}+` : 'Team') : o.participation === 'individual' ? 'Individual' : null
  const headline = o.fit?.concerns[0] && (o.isExpired || o.urgency === 'critical' || (o.fit?.overall ?? 100) < 40) ? o.fit.concerns[0] : o.fit?.reasons[0]
  return (
    <article className={clsx('surface-interactive rounded-xl p-4 flex flex-col gap-3 relative', o.isExpired && 'opacity-75')} aria-label={o.title}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {o.category && <Badge tone="accent">{o.category}</Badge>}
            {o.difficulty && <Badge>{titleCase(o.difficulty)}</Badge>}
            {o.isDemo && <DemoBadge />}
            {!o.isDemo && o.verificationStatus === 'verified' && <Badge tone="success">Verified source</Badge>}
            {o.applicationStatus && <StatusPill status={o.applicationStatus} />}
          </div>
          <h3 className="font-semibold leading-snug text-[15px]">
            <Link to={`/opportunities/${o.id}`} className="after:absolute after:inset-0 after:content-[''] focus-ring rounded">{o.title}</Link>
          </h3>
          <Link to={`/organizations/${o.organizationSlug}`} className="relative z-10 inline-flex items-center gap-1 text-xs text-muted hover:text-[var(--text)] mt-0.5 focus-ring rounded"><Building2 size={12} aria-hidden /> {o.organization}</Link>
        </div>
        {o.fit && <FitBadge score={o.fit.overall} confidence={o.fit.confidence} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className={clsx('inline-flex items-center gap-1', o.urgency === 'critical' && 'text-danger-500 font-medium', o.urgency === 'soon' && 'text-warning-500')}><CalendarClock size={12} aria-hidden /> {deadlineLabel(o.daysRemaining, o.urgency)}</span>
        {(o.format || o.workMode) && <span className="capitalize">{[o.format, o.workMode].filter(Boolean).join(' · ')}</span>}
        {o.location && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden /> {o.location}</span>}
        {team && <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden /> {team}</span>}
        {pay && <span>{pay}/mo</span>}{o.prizeText && <span>{o.prizeText}</span>}
      </div>

      {(o.requiredSkills.length > 0) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Required skills">
          {o.requiredSkills.slice(0, 6).map((s) => (
            <span key={s} className={clsx('text-[11px] px-2 py-0.5 rounded-full border capitalize', matched.has(s) ? 'border-success-500/40 bg-success-500/10 text-success-500' : 'border-[var(--border)] text-muted')}
              title={matched.has(s) ? 'You have this skill' : 'Required — not in your confirmed skills'}>{matched.has(s) ? '✓ ' : ''}{s}</span>
          ))}
        </div>
      )}
      {headline && <p className="text-xs text-muted leading-relaxed line-clamp-2">{headline}</p>}

      <div className="relative z-10 flex items-center justify-between mt-auto pt-1">
        <SaveButton id={o.id} saved={o.saved} />
        {onCompare && (
          <label className={clsx('inline-flex items-center gap-1.5 text-xs cursor-pointer min-h-[36px]', compareDisabled && !compare && 'opacity-50 cursor-not-allowed')}>
            <input type="checkbox" checked={!!compare} disabled={compareDisabled && !compare} onChange={() => onCompare(o.id)} className="h-4 w-4 accent-[var(--color-accent-500)]" /> Compare
          </label>
        )}
      </div>
    </article>
  )
}
