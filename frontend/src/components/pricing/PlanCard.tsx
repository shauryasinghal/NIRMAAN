import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { formatInr, yearlySavings, type Billing, type Plan } from './plans'

/** There is no checkout, so a plan CTA only routes into the app: sign-up when signed out, the dashboard when signed in (like the page header). */
export function PlanCard({ plan, billing, isAuthenticated }: { plan: Plan; billing: Billing; isAuthenticated: boolean }) {
  const Icon = plan.icon
  const headingId = `plan-${plan.id}-name`
  const savings = yearlySavings(plan)
  const to = isAuthenticated ? '/dashboard' : '/register'
  const label = isAuthenticated && plan.id === 'free' ? 'Go to dashboard' : plan.cta.label
  return (
    <article aria-labelledby={headingId} className={clsx('surface-elevated rounded-2xl flex flex-col min-w-0 overflow-hidden transition-transform duration-200 hover:-translate-y-0.5', plan.recommended && 'ring-2 ring-[var(--accent-text)]')}>
      <div className="p-6 sm:p-7 flex flex-col gap-5" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent-500) 6%, transparent), transparent 70%)' }}>
        <div className="flex items-start justify-between gap-3">
          <span className="h-12 w-12 rounded-xl border flex items-center justify-center bg-[var(--surface-2)]" style={{ borderColor: 'var(--border-strong)' }}>
            <Icon size={26} strokeWidth={1.5} aria-hidden className="text-[var(--text)]" />
          </span>
          {plan.recommended && <span className="rounded-full px-3 py-1 text-xs font-medium bg-[var(--accent-text)] text-[var(--surface-2)]">Recommended</span>}
        </div>
        <div>
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">{plan.name}</h2>
          <p className="text-sm text-muted mt-1">{plan.tagline}</p>
        </div>
        <div>
          {plan.price
            ? <p className="text-4xl font-semibold tracking-tight">{formatInr(plan.price[billing])}<span className="text-base font-normal text-muted">/{billing === 'monthly' ? 'month' : 'year'}</span></p>
            : <p className="text-4xl font-semibold tracking-tight">₹0</p>}
          <p className="text-xs text-muted mt-2">
            {!plan.price ? 'Free forever' : billing === 'yearly' ? `Billed yearly · save ${formatInr(savings)} vs monthly` : 'Billed monthly'}
          </p>
        </div>
        <Link to={to} className="focus-ring rounded-xl"><Button size="lg" variant={plan.recommended ? 'primary' : 'secondary'} className="w-full">{label}</Button></Link>
      </div>
      <div className="border-t p-6 sm:p-7 flex-1" style={{ borderColor: 'var(--border-strong)' }}>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted mb-4">{plan.featuresHeading}</h3>
        <ul className="space-y-3">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-3 text-sm leading-snug">
              <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--accent-text)]" /><span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
