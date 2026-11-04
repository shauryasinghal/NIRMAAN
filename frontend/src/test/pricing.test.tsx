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
  const card = (n: string) => screen.getByRole('article', { name: n })
  it('renders the heading and three plans with real prices and no "coming soon" / "not announced" text', () => {
    app()
    expect(screen.getByRole('heading', { level: 1, name: 'Plans that grow with you' })).toBeInTheDocument()
    expect(within(card('Free')).getByText('₹0')).toBeInTheDocument()
    expect(within(card('Free')).getByText('Free forever')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/coming soon|not announced|to be announced|nothing can be purchased/i)
  })
  it('monthly pricing is the default: Pro ₹499/month, Max ₹999/month', () => {
    app()
    expect(within(screen.getByRole('radiogroup', { name: 'Billing period' })).getByRole('radio', { name: 'Monthly' })).toBeChecked()
    expect(card('Pro')).toHaveTextContent('₹499/month')
    expect(card('Max')).toHaveTextContent('₹999/month')
    expect(within(card('Pro')).getByText('Billed monthly')).toBeInTheDocument()
  })
  it('yearly toggle switches to Pro ₹4,999/year and Max ₹9,999/year with derived savings, and back', async () => {
    app()
    const group = screen.getByRole('radiogroup', { name: 'Billing period' })
    await userEvent.click(within(group).getByRole('radio', { name: 'Yearly' }))
    expect(within(group).getByRole('radio', { name: 'Yearly' })).toBeChecked()
    expect(card('Pro')).toHaveTextContent('₹4,999/year')
    expect(card('Max')).toHaveTextContent('₹9,999/year')
    expect(within(card('Pro')).getByText('Billed yearly · save ₹989 vs monthly')).toBeInTheDocument()
    expect(within(card('Max')).getByText('Billed yearly · save ₹1,989 vs monthly')).toBeInTheDocument()
    expect(card('Free')).toHaveTextContent('₹0')
    expect(card('Free')).not.toHaveTextContent(/year|billed/i)
    await userEvent.click(within(group).getByRole('radio', { name: 'Monthly' }))
    expect(card('Pro')).toHaveTextContent('₹499/month')
  })
  it('highlights Pro as the only recommended plan', () => {
    app()
    expect(within(card('Pro')).getByText('Recommended')).toBeInTheDocument()
    expect(within(card('Free')).queryByText('Recommended')).toBeNull()
    expect(within(card('Max')).queryByText('Recommended')).toBeNull()
  })
  it('CTAs only route into the app (no fake payment): signed out they go to sign-up', async () => {
    app()
    expect(within(card('Free')).getByRole('link', { name: 'Explore NIRMAAN' })).toHaveAttribute('href', '/register')
    expect(within(card('Pro')).getByRole('link', { name: 'Get Pro' })).toHaveAttribute('href', '/register')
    expect(within(card('Max')).getByRole('link', { name: 'Get Max' })).toHaveAttribute('href', '/register')
    await userEvent.click(within(card('Pro')).getByRole('link', { name: 'Get Pro' }))
    expect(screen.getByText('register page')).toBeInTheDocument()
  })
  it('CTAs when signed in go to the dashboard instead', () => {
    Object.assign(auth, { isAuthenticated: true })
    app()
    expect(within(card('Free')).getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(card('Pro')).getByRole('link', { name: 'Get Pro' })).toHaveAttribute('href', '/dashboard')
  })
  it('Team and Enterprise view hides the plan cards and the billing toggle, and Individual restores them', async () => {
    app()
    await userEvent.click(screen.getByRole('radio', { name: 'Team and Enterprise' }))
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Billing period' })).toBeNull()
    expect(screen.getByText(/Organisation-wide Team and Enterprise plans/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Individual' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
  it('toggles are keyboard operable: one tab stop, arrows move and select, Home/End wrap', async () => {
    app()
    const individual = screen.getByRole('radio', { name: 'Individual' }), team = screen.getByRole('radio', { name: 'Team and Enterprise' })
    expect(individual).toHaveAttribute('tabindex', '0'); expect(team).toHaveAttribute('tabindex', '-1')
    individual.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(team).toBeChecked(); expect(team).toHaveFocus()
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText(/Organisation-wide Team and Enterprise plans/)).toBeInTheDocument()
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
