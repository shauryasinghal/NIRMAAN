import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const signInWithOAuth = vi.fn()
const getSession = vi.fn()
vi.mock('../lib/env', () => ({ env: { supabaseUrl: 'http://x.test', supabaseAnonKey: 'k', apiUrl: '' }, supabaseConfigured: true }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: (a: unknown) => signInWithOAuth(a), getSession: () => getSession(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }), signOut: vi.fn() } } }))
vi.mock('../lib/services', () => ({ authService: { me: vi.fn().mockResolvedValue(null), config: vi.fn() } }))

import { AuthProvider, useAuth } from '../context/AuthContext'
import { AuthCallbackPage } from '../pages/auth/AuthCallbackPage'

function Trigger() { const { signInWithGoogle } = useAuth(); return <button onClick={async () => { await signInWithGoogle() }}>go</button> }
const tree = (route: string, ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}><AuthProvider><Routes><Route path="/auth/callback" element={ui} /><Route path="/dashboard" element={<p>DASHBOARD</p>} /><Route path="/login" element={<p>LOGIN</p>} /></Routes></AuthProvider></MemoryRouter>
  </QueryClientProvider>)

beforeEach(() => { signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null }); getSession.mockReset().mockResolvedValue({ data: { session: null } }) })
afterEach(() => { vi.useRealTimers(); window.history.replaceState({}, '', '/') })

describe('signInWithGoogle (the real AuthProvider)', () => {
  it('calls Supabase signInWithOAuth with provider "google" and a redirect to THIS origin\'s /auth/callback', async () => {
    render(tree('/auth/callback', <Trigger />))
    await userEvent.click(await screen.findByRole('button', { name: 'go' }))
    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
  })
  it('derives the redirect from the running origin only (nothing user-supplied is used)', async () => {
    window.history.replaceState({}, '', '/auth/callback?redirect_to=https://evil.example&next=https://evil.example')
    render(tree('/auth/callback', <Trigger />))
    await userEvent.click(await screen.findByRole('button', { name: 'go' }))
    const arg = signInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } }
    expect(arg.options.redirectTo).toBe(`${window.location.origin}/auth/callback`); expect(arg.options.redirectTo).not.toMatch(/evil/)
  })
})

describe('AuthCallbackPage (PKCE code exchange is done by supabase-js; the page waits for the session)', () => {
  it('shows progress, then sends a signed-in user to the dashboard', async () => {
    let resolve!: (v: unknown) => void
    getSession.mockReturnValue(new Promise((r) => { resolve = r }))
    render(tree('/auth/callback', <AuthCallbackPage />))
    expect(screen.getByRole('status')).toHaveTextContent(/finish/i)
    await act(async () => { resolve({ data: { session: { user: { id: 'u1' }, access_token: 't' } } }) })
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })
  it('reports a provider error (access denied) in plain language and offers a way back', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_description=User+denied+access')
    render(tree('/auth/callback', <AuthCallbackPage />))
    expect(await screen.findByText(/was cancelled/i)).toBeInTheDocument(); expect(screen.getByText(/User denied access/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to log in' })).toHaveAttribute('href', '/login')
  })
  it('reports an error returned in the URL fragment too', async () => {
    window.history.replaceState({}, '', '/auth/callback#error=server_error&error_description=Unable+to+exchange+external+code')
    render(tree('/auth/callback', <AuthCallbackPage />))
    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument()
  })
  it('does not hang forever when the code exchange never produces a session', async () => {
    vi.useFakeTimers()
    render(tree('/auth/callback', <AuthCallbackPage />))
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(8100) })
    expect(screen.getByText(/couldn't finish signing you in/i)).toBeInTheDocument()
    expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument()
  })
})
