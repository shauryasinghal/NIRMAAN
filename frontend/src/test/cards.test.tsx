import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from './utils'
import type { OpportunityCardData } from '../types'

vi.mock('../lib/services', () => ({ savedService: { save: vi.fn(), unsave: vi.fn() } }))
import { OpportunityCard } from '../components/opportunities/OpportunityCard'

const base: OpportunityCardData = {
  id: 'o1', title: 'Smart Hack', organization: 'Acme', organizationSlug: 'acme', category: 'Hackathon', subcategory: null, domain: 'AI/ML', domainLabel: 'AI/ML', tags: [],
  requiredSkills: ['python', 'docker'], preferredSkills: [], difficulty: 'intermediate', format: null, workMode: null, participation: 'team', minTeamSize: 2, maxTeamSize: 4,
  deadline: '2026-12-01', daysRemaining: 2, urgency: 'critical', isExpired: false, location: null, prizeText: null, stipendAmount: null, stipendCurrency: null, salaryText: null, certificate: null,
  source: 'Demo data', sourceType: 'dev_seed', isDemo: true, verificationStatus: 'unverified', freshnessStatus: 'unknown', lastVerifiedAt: null, officialUrl: null, saved: false, applicationStatus: null,
  fit: { overall: 82, confidence: 'high', matchedSkills: ['python'], missingSkills: ['docker'], reasons: ['1/2 required skills: python'], concerns: ['Deadline in 2 days'], expired: false },
}

describe('OpportunityCard', () => {
  it('labels demo data and shows no outbound link for it', () => {
    renderApp(<OpportunityCard o={base} />)
    expect(screen.getByText('Demo data')).toBeInTheDocument(); expect(document.querySelector('a[href^="http"]')).toBeNull()
  })
  it('shows the real fit, matched vs missing skills, urgency and the top reason', () => {
    renderApp(<OpportunityCard o={{ ...base, urgency: 'open', daysRemaining: 20 }} />)
    expect(screen.getByText('82%')).toBeInTheDocument(); expect(screen.getByText('✓ Python')).toBeInTheDocument(); expect(screen.getByText('Docker')).toBeInTheDocument()
    expect(screen.getByText('20 days left')).toBeInTheDocument(); expect(screen.getByText('1/2 required skills: python')).toBeInTheDocument(); expect(screen.getByText('Team of 2–4')).toBeInTheDocument()
  })
  it('leads with the concern instead of praise when the deadline is critical', () => {
    renderApp(<OpportunityCard o={base} />)
    expect(screen.getByText('Deadline in 2 days')).toBeInTheDocument(); expect(screen.queryByText('1/2 required skills: python')).toBeNull(); expect(screen.getByText('2 days left')).toHaveClass('text-danger-500')
  })
  it('does not invent unknown facts (no format, location, pay shown)', () => {
    renderApp(<OpportunityCard o={base} />)
    expect(screen.queryByText(/online|offline|hybrid|remote/i)).toBeNull(); expect(screen.queryByText(/\/mo/)).toBeNull()
  })
  it('links the title and organization, and exposes compare as a checkbox', () => {
    renderApp(<OpportunityCard o={base} onCompare={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Smart Hack' })).toHaveAttribute('href', '/opportunities/o1'); expect(screen.getByRole('link', { name: /acme/i })).toHaveAttribute('href', '/organizations/acme'); expect(screen.getByRole('checkbox', { name: /compare/i })).toBeInTheDocument()
  })
  it('shows a closed listing as closed and prioritises the concern', () => {
    renderApp(<OpportunityCard o={{ ...base, isExpired: true, urgency: 'expired', daysRemaining: -3, fit: { ...base.fit!, overall: 20, concerns: ['The registration deadline has passed'] } }} />)
    expect(screen.getByText('Closed 3d ago')).toBeInTheDocument(); expect(screen.getByText('The registration deadline has passed')).toBeInTheDocument()
  })
})
