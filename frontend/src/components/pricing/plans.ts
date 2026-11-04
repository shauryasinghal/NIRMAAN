import { Sprout, Layers, Rocket, type LucideIcon } from 'lucide-react'

/** Plan content and prices for /pricing. This is display data only: NIRMAAN has no billing backend, no plan field on an account and no
 *  gated feature, so nothing here is enforced or purchasable. Prices are whole rupees, edited in one place (`price`). */
export type PlanId = 'free' | 'pro' | 'max'
export type Billing = 'monthly' | 'yearly'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  icon: LucideIcon
  /** INR per period. `null` = free forever (no billing period). */
  price: Record<Billing, number> | null
  /** Shown with a "Recommended" badge and an accent border. */
  recommended?: boolean
  featuresHeading: string
  features: string[]
  cta: { label: string }
}

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', tagline: 'Meet NIRMAAN', icon: Sprout, price: null, featuresHeading: 'Included',
    features: [
      'Opportunities ranked by an explainable fit score',
      'Skill-coverage Team Builder (opt-in)',
      'Idea originality check against prior work',
      'Application tracker and smart alerts',
      'Resume import to build your profile',
    ],
    cta: { label: 'Explore NIRMAAN' },
  },
  {
    id: 'pro', name: 'Pro', tagline: 'For active applicants', icon: Layers, price: { monthly: 499, yearly: 4999 }, recommended: true, featuresHeading: 'Everything in Free, plus',
    features: ['Everything in the Free plan', 'Support for NIRMAAN as it grows', 'Early access to new features'],
    cta: { label: 'Get Pro' },
  },
  {
    id: 'max', name: 'Max', tagline: 'For power users', icon: Rocket, price: { monthly: 999, yearly: 9999 }, featuresHeading: 'Everything in Pro, plus',
    features: ['Everything in the Pro plan', 'Highest tier of support for NIRMAAN', 'Priority consideration for new capabilities'],
    cta: { label: 'Get Max' },
  },
]

const inr = new Intl.NumberFormat('en-IN')
export const formatInr = (n: number) => `₹${inr.format(n)}`

/** What a yearly subscription saves versus twelve monthly payments, derived from the prices so it cannot drift. */
export const yearlySavings = (p: Plan) => (p.price ? p.price.monthly * 12 - p.price.yearly : 0)
