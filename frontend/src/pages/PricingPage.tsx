import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Notice } from '../components/ui/kit'
import { useAuth } from '../context/AuthContext'
import { NirmaanLogo } from '../components/common/NirmaanMark'
import { PlanCard } from '../components/pricing/PlanCard'
import { SegmentedControl } from '../components/pricing/SegmentedControl'
import { PLANS, type Billing } from '../components/pricing/plans'

type Audience = 'individual' | 'team'

export function PricingPage() {
  const { loading, isAuthenticated } = useAuth()
  const [audience, setAudience] = useState<Audience>('individual')
  const [billing, setBilling] = useState<Billing>('monthly')
  return (
    <div className="min-h-screen bg-paper dark:bg-navy-950 overflow-x-hidden">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" aria-label="NIRMAAN — home" className="focus-ring rounded"><NirmaanLogo variant="compact" size={30} decorative /></Link>
        {/* While the persisted session resolves, render nothing (same as the route guards) so a signed-in user never sees Log in flash by. */}
        {!loading && (isAuthenticated
          ? <Link to="/dashboard"><Button size="sm"><ArrowLeft size={14} aria-hidden /> Back to dashboard</Button></Link>
          : <div className="flex gap-2">
              <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
              <Link to="/register"><Button size="sm">Get started</Button></Link>
            </div>)}
      </header>
      <main className="max-w-6xl mx-auto px-6 pt-6 sm:pt-10 pb-16">
        <h1 className="text-center text-3xl sm:text-5xl font-semibold tracking-tight">Plans that grow with you</h1>
        <p className="text-center text-muted mt-3 max-w-xl mx-auto text-sm sm:text-base">Subscription pricing is coming soon. Nothing can be purchased yet, and no prices have been announced.</p>
        {/* Both switches share one row (they wrap on narrow screens), so the billing period sits directly above the cards it applies to. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 mt-6">
          <SegmentedControl label="Plan audience" value={audience} onChange={setAudience} options={[{ id: 'individual', label: 'Individual' }, { id: 'team', label: 'Team and Enterprise' }]} />
          {audience === 'individual' && <SegmentedControl label="Billing period" value={billing} onChange={setBilling} options={[{ id: 'monthly', label: 'Monthly' }, { id: 'yearly', label: 'Yearly' }]} />}
        </div>
        {audience === 'individual' ? (
          <div className="grid gap-5 lg:gap-6 mt-6 md:grid-cols-3 items-stretch">
            {PLANS.map((p) => <PlanCard key={p.id} plan={p} billing={billing} />)}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto mt-8">
            <Notice tone="accent" title="Team and Enterprise plans are not defined yet">
              There are no team or enterprise plans, prices or features to show. Individual accounts and Team Builder work today; this page will be updated when plans are announced.
            </Notice>
          </div>
        )}
        <p className="text-center text-xs text-muted mt-8">Plans and prices are subject to change. Everything listed under Free is available to every NIRMAAN account today.</p>
      </main>
    </div>
  )
}
