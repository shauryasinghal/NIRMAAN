import { Sprout, Layers, Rocket, type LucideIcon } from 'lucide-react'

/** Plan content for /pricing. Nothing here is a price or an entitlement: NIRMAAN has no billing, no plan field on an account and no gated
 *  feature (see the Phase 1 audit). Every capability listed under Free exists in the product today and is available to every account. */
export type PlanId = 'free' | 'pro' | 'max'
export type Billing = 'monthly' | 'yearly'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  icon: LucideIcon
  price: string
  /** Caption under the price. Omitted for plans with no announced pricing, which show the billing-period caption instead. */
  priceNote?: string
  featuresHeading: string
  features: string[]
  /** `available` = a real, working product capability (check mark); `pending` = not announced yet (clock). */
  featureState: 'available' | 'pending'
  cta: { kind: 'link'; label: string; to: string } | { kind: 'soon'; label: string }
}

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', tagline: 'Meet NIRMAAN', icon: Sprout, price: 'Free', priceNote: 'No payment needed today', featuresHeading: 'Available to every account today', featureState: 'available',
    features: [
      'Opportunities ranked by an explainable fit score',
      'Skill-coverage Team Builder (opt-in)',
      'Idea originality check against prior work',
      'Application tracker and smart alerts',
      'Resume import to build your profile',
    ],
    cta: { kind: 'link', label: 'Explore NIRMAAN', to: '/register' },
  },
  {
    id: 'pro', name: 'Pro', tagline: 'Plan details to be announced', icon: Layers, price: 'Coming soon', featuresHeading: 'What this plan will include', featureState: 'pending',
    features: ['Features and limits are not announced yet', 'Pricing is not announced yet', 'Nothing can be purchased yet'],
    cta: { kind: 'soon', label: 'Coming soon' },
  },
  {
    id: 'max', name: 'Max', tagline: 'Plan details to be announced', icon: Rocket, price: 'Coming soon', featuresHeading: 'What this plan will include', featureState: 'pending',
    features: ['Features and limits are not announced yet', 'Pricing is not announced yet', 'Nothing can be purchased yet'],
    cta: { kind: 'soon', label: 'Coming soon' },
  },
]
