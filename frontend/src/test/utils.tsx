import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function renderApp(ui: ReactElement, route = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>) }
}

export const baseAuth = {
  configured: true, loading: false, session: null, isAuthenticated: false, me: null, meLoading: false, meError: null, role: null,
  signInWithPassword: async () => null, signUp: async () => ({ error: null, needsConfirmation: false }), signInWithGoogle: async () => null,
  sendPasswordReset: async () => null, updatePassword: async () => null, signOut: async () => undefined, refreshMe: async () => undefined,
}
