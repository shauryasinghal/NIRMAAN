import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseAuth, renderApp } from './utils'

const auth = { ...baseAuth }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth, AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { resend: vi.fn().mockResolvedValue({}) } } }))
const config = vi.fn()
vi.mock('../lib/services', () => ({ authService: { config: () => config() } }))

import { LoginPage } from '../pages/auth/LoginPage'
import { RegisterPage } from '../pages/auth/RegisterPage'

beforeEach(() => { Object.assign(auth, baseAuth, { signInWithPassword: vi.fn().mockResolvedValue(null), signUp: vi.fn().mockResolvedValue({ error: null, needsConfirmation: true }) }); config.mockResolvedValue({ google: false, emailPassword: true, emailConfirmationRequired: true, verified: true }) })

describe('LoginPage', () => {
  it('validates before calling Supabase', async () => {
    renderApp(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email'); await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument(); expect(screen.getByText('Enter your password')).toBeInTheDocument(); expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })
  it('signs in with the typed credentials', async () => {
    renderApp(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'hunter22'); await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith('a@b.co', 'hunter22'))
  })
  it('shows a friendly error for wrong credentials', async () => {
    auth.signInWithPassword = vi.fn().mockResolvedValue({ message: 'Invalid login credentials' })
    renderApp(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'x'); await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })
  it('offers to resend verification when the email is unconfirmed', async () => {
    auth.signInWithPassword = vi.fn().mockResolvedValue({ message: 'Email not confirmed' })
    renderApp(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'x'); await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('button', { name: /resend verification/i })).toBeInTheDocument()
  })
  it('DISABLES Google (never fakes it) when Supabase reports the provider is off', async () => {
    renderApp(<LoginPage />)
    const btn = await screen.findByRole('button', { name: /continue with google/i })
    await waitFor(() => expect(btn).toBeDisabled()); expect(await screen.findByText(/isn't enabled for this project/i)).toBeInTheDocument()
  })
  it('enables Google only when Supabase says it is configured, then starts real OAuth', async () => {
    config.mockResolvedValue({ google: true, emailPassword: true, emailConfirmationRequired: true, verified: true })
    renderApp(<LoginPage />)
    const btn = await screen.findByRole('button', { name: /continue with google/i })
    await waitFor(() => expect(btn).toBeEnabled()); await userEvent.click(btn); expect(auth.signInWithGoogle).toBeDefined()
  })
  it('warns when the app has no Supabase project configured', () => { auth.configured = false; renderApp(<LoginPage />); expect(screen.getByText(/isn't configured/i)).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled() })
})

describe('RegisterPage', () => {
  it('has no role selector and never sends a role', async () => {
    renderApp(<RegisterPage />)
    expect(screen.queryByLabelText(/role/i)).toBeNull(); expect(screen.queryByText(/reviewer/i)).toHaveTextContent(/administrator/i)
    await userEvent.type(screen.getByLabelText('Full name'), 'Priya Nair'); await userEvent.type(screen.getByLabelText('Email'), 'p@n.co')
    await userEvent.type(screen.getByLabelText('Password'), 'abcdef12'); await userEvent.type(screen.getByLabelText('Confirm password'), 'abcdef12'); await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith('Priya Nair', 'p@n.co', 'abcdef12'))
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
  })
  it('enforces password rules and matching confirmation', async () => {
    renderApp(<RegisterPage />)
    await userEvent.type(screen.getByLabelText('Full name'), 'Priya'); await userEvent.type(screen.getByLabelText('Email'), 'p@n.co')
    await userEvent.type(screen.getByLabelText('Password'), 'short'); await userEvent.type(screen.getByLabelText('Confirm password'), 'different'); await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument(); expect(screen.getByText('Passwords do not match')).toBeInTheDocument(); expect(auth.signUp).not.toHaveBeenCalled()
  })
  it('surfaces "already registered" clearly', async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: { message: 'User already registered' }, needsConfirmation: false })
    renderApp(<RegisterPage />)
    await userEvent.type(screen.getByLabelText('Full name'), 'Priya'); await userEvent.type(screen.getByLabelText('Email'), 'p@n.co'); await userEvent.type(screen.getByLabelText('Password'), 'abcdef12'); await userEvent.type(screen.getByLabelText('Confirm password'), 'abcdef12'); await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })
})
