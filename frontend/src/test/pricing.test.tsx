import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { PricingPage } from '../pages/PricingPage'
import { baseAuth, renderApp } from './utils'

const signOut = vi.fn(async () => undefined)
const auth: Record<string, unknown> = { ...baseAuth }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
beforeEach(() => { Object.assign(auth, baseAuth, { signOut }); signOut.mockClear() })

const app = () => renderApp(<Routes><Route path="/pricing" element={<PricingPage />} /><Route path="/register" element={<p>register page</p>} /><Route path="/login" element={<p>login page</p>} /><Route path="/dashboard" element={<p>dashboard page</p>} /></Routes>, '/pricing')

describe('Pricing page', () => {
  it('renders the heading and three plans: Free shows "Free", Pro and Max "Coming soon", with no numeric price', () => {
    app()
    expect(screen.getByRole('heading', { level: 1, name: 'Plans that grow with you' })).toBeInTheDocument()
    for (const n of ['Pro', 'Max']) expect(within(screen.getByRole('article', { name: n })).getByText('Coming soon', { selector: 'p' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[₹$]\s?\d|\d\s?%|save/i)
  })
  it('Free states it needs no payment and implies no billing cycle; Pro and Max keep the billing caption', async () => {
    app()
    const free = screen.getByRole('article', { name: 'Free' })
    expect(within(free).getByText('Free', { selector: 'p' })).toBeInTheDocument()
    expect(within(free).queryByText('Coming soon', { selector: 'p' })).toBeNull()
    expect(within(free).getByText('No payment needed today')).toBeInTheDocument()
    expect(within(free).queryByText(/billed|INR/)).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Yearly' }))
    expect(within(free).queryByText(/billed/)).toBeNull()
    for (const n of ['Pro', 'Max']) expect(within(screen.getByRole('article', { name: n })).getByText(/INR · billed yearly · pricing not announced/)).toBeInTheDocument()
  })
  it('only offers an honest CTA: Free links to sign-up, Pro and Max are disabled', async () => {
    app()
    expect(within(screen.getByRole('article', { name: 'Free' })).getByRole('link', { name: 'Explore NIRMAAN' })).toHaveAttribute('href', '/register')
    for (const n of ['Pro', 'Max']) expect(within(screen.getByRole('article', { name: n })).getByRole('button', { name: 'Coming soon' })).toBeDisabled()
    await userEvent.click(within(screen.getByRole('article', { name: 'Free' })).getByRole('link', { name: 'Explore NIRMAAN' }))
    expect(screen.getByText('register page')).toBeInTheDocument()
  })
  it('billing toggle switches the billing wording and has no savings claim', async () => {
    app()
    const group = screen.getByRole('radiogroup', { name: 'Billing period' })
    expect(within(group).getByRole('radio', { name: 'Monthly' })).toBeChecked()
    expect(screen.getAllByText(/billed monthly/)).toHaveLength(2)
    await userEvent.click(within(group).getByRole('radio', { name: 'Yearly' }))
    expect(within(group).getByRole('radio', { name: 'Yearly' })).toBeChecked()
    expect(screen.getAllByText(/billed yearly/)).toHaveLength(2)
  })
  it('toggles are keyboard operable: one tab stop, arrows move and select, Home/End wrap', async () => {
    app()
    const individual = screen.getByRole('radio', { name: 'Individual' }), team = screen.getByRole('radio', { name: 'Team and Enterprise' })
    expect(individual).toHaveAttribute('tabindex', '0'); expect(team).toHaveAttribute('tabindex', '-1')
    individual.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(team).toBeChecked(); expect(team).toHaveFocus()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Team and Enterprise plans are not defined yet')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}'); expect(individual).toBeChecked()
    await userEvent.keyboard('{End}'); expect(team).toBeChecked()
    await userEvent.keyboard('{Home}'); expect(individual).toBeChecked()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
  describe('header actions follow the existing auth state', () => {
    it('signed out: Log in and Get started keep their destinations, and the page is public', () => {
      app()
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
      expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
      expect(screen.queryByRole('link', { name: /Back to dashboard/ })).toBeNull()
      expect(screen.getByRole('heading', { level: 1, name: 'Plans that grow with you' })).toBeInTheDocument()
    })
    it('authenticated: shows only Back to dashboard, which navigates to /dashboard without signing out', async () => {
      Object.assign(auth, { isAuthenticated: true })
      app()
      expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull()
      const back = screen.getByRole('link', { name: /Back to dashboard/ })
      expect(back).toHaveAttribute('href', '/dashboard')
      await userEvent.click(back)
      expect(screen.getByText('dashboard page')).toBeInTheDocument()
      expect(signOut).not.toHaveBeenCalled()
    })
    it('while the session is resolving, shows neither set of actions', () => {
      Object.assign(auth, { loading: true, isAuthenticated: false })
      app()
      for (const n of ['Log in', 'Get started', /Back to dashboard/]) expect(screen.queryByRole('link', { name: n })).toBeNull()
    })
  })
})
