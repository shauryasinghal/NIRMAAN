import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseAuth, renderApp } from './utils'

const auth = { ...baseAuth }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth, AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
const config = vi.fn()
vi.mock('../lib/services', () => ({ authService: { config: () => config() } }))

import { GoogleButton } from '../pages/auth/GoogleButton'

const cfg = (over: object = {}) => ({ google: true, emailPassword: true, emailConfirmationRequired: true, verified: true, ...over })
beforeEach(() => { Object.assign(auth, baseAuth, { signInWithGoogle: vi.fn().mockResolvedValue(null) }); config.mockReset() })

describe('GoogleButton states (the UI never pretends)', () => {
  it('is ENABLED when Supabase reports Google as configured, and clicking starts Google OAuth', async () => {
    config.mockResolvedValue(cfg())
    renderApp(<GoogleButton />)
    const btn = await screen.findByRole('button', { name: /continue with google/i })
    await waitFor(() => expect(btn).toBeEnabled())
    await userEvent.click(btn)
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
  })
  it('is DISABLED, with the real reason, when Supabase says the provider is off', async () => {
    config.mockResolvedValue(cfg({ google: false }))
    renderApp(<GoogleButton />)
    expect(await screen.findByText(/isn't enabled for this project/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled()
  })
  it('is DISABLED and says it could not check (not "disabled") when the config cannot be verified', async () => {
    config.mockResolvedValue(cfg({ google: false, verified: false }))
    renderApp(<GoogleButton />)
    expect(await screen.findByText(/couldn't check whether google sign-in is available/i)).toBeInTheDocument()
    expect(screen.queryByText(/isn't enabled for this project/i)).toBeNull()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled()
  })
  it('is DISABLED and says it could not check when the config request fails', async () => {
    config.mockRejectedValue(new Error('network'))
    renderApp(<GoogleButton />)
    expect(await screen.findByText(/couldn't check whether google sign-in is available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled()
  })
  it('is DISABLED when no Supabase project is configured, without asking the API', () => {
    auth.configured = false
    renderApp(<GoogleButton />)
    expect(screen.getByText(/sign-in is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled(); expect(config).not.toHaveBeenCalled()
  })
  it.each([
    ['Unsupported provider: provider is not enabled', /isn't enabled for this project yet\. Please use email/i],
    ['access_denied', /was cancelled/i],
    ['invalid flow state, no valid flow state found', /expired or was already used/i],
    ['AuthRetryableFetchError: Failed to fetch', /couldn't reach the sign-in service/i],
  ])('shows a friendly message for the OAuth error "%s"', async (message, expected) => {
    config.mockResolvedValue(cfg()); auth.signInWithGoogle = vi.fn().mockResolvedValue({ message })
    renderApp(<GoogleButton />)
    const btn = await screen.findByRole('button', { name: /continue with google/i }); await waitFor(() => expect(btn).toBeEnabled())
    await userEvent.click(btn)
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent(expected); expect(alert.textContent).not.toMatch(/at \w+\.|stack|secret|key/i)
    await waitFor(() => expect(btn).toBeEnabled())     // the user can try again
  })
})
