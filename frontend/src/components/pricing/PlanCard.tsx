import { Link } from 'react-router-dom'
import { Check, Clock } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import type { Billing, Plan } from './plans'

export function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  const Icon = plan.icon
  const Mark = plan.featureState === 'available' ? Check : Clock
  const headingId = `plan-${plan.id}-name`
  return (
    <article aria-labelledby={headingId} className="surface-elevated rounded-2xl flex flex-col min-w-0 overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <div className="p-6 sm:p-7 flex flex-col gap-5" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent-500) 6%, transparent), transparent 70%)' }}>
        <span className="h-12 w-12 rounded-xl border flex items-center justify-center bg-[var(--surface-2)]" style={{ borderColor: 'var(--border-strong)' }}>
          <Icon size={26} strokeWidth={1.5} aria-hidden className="text-[var(--text)]" />
        </span>
        <div>
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">{plan.name}</h2>
          <p className="text-sm text-muted mt-1">{plan.tagline}</p>
        </div>
        <div>
          <p className="text-4xl font-semibold tracking-tight">{plan.price}</p>
          <p className="text-xs text-muted mt-2">{plan.priceNote ?? `INR · billed ${billing === 'monthly' ? 'monthly' : 'yearly'} · pricing not announced`}</p>
        </div>
        {plan.cta.kind === 'link'
          ? <Link to={plan.cta.to} className="focus-ring rounded-xl"><Button size="lg" className="w-full">{plan.cta.label}</Button></Link>
          : <Button size="lg" variant="secondary" className="w-full" disabled>{plan.cta.label}</Button>}
      </div>
      <div className="border-t p-6 sm:p-7 flex-1" style={{ borderColor: 'var(--border-strong)' }}>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-4">{plan.featuresHeading}</h3>
        <ul className="space-y-3">
          {plan.features.map((f) => (
            <li key={f} className={clsx('flex gap-3 text-sm leading-snug', plan.featureState === 'pending' && 'text-muted')}>
              <Mark size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--accent-text)]" /><span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
