import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { baseAuth, renderApp } from './utils'

const auth: Record<string, unknown> = { ...baseAuth }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../components/layout/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }))
import { ProtectedRoute, PublicOnlyRoute, RoleRoute } from '../components/RouteGuards'

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const app = (
  <Routes>
    <Route path="/login" element={<Where />} /><Route path="/onboarding" element={<Where />} /><Route path="/dashboard" element={<Where />} />
    <Route element={<PublicOnlyRoute />}><Route path="/register" element={<div>register</div>} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/secret" element={<div>secret page</div>} /><Route element={<RoleRoute min="admin" />}><Route path="/admin" element={<div>admin page</div>} /></Route><Route element={<RoleRoute min="reviewer" />}><Route path="/review" element={<div>review page</div>} /></Route></Route>
  </Routes>
)
const me = (role: string, onboardingCompleted = true) => ({ id: 'u', email: 'e', fullName: 'N', role, isReviewer: role !== 'student', isAdmin: role === 'admin', onboardingCompleted })
beforeEach(() => { Object.assign(auth, baseAuth) })

describe('route guards (UX only — the API enforces the real rules)', () => {
  it('sends anonymous visitors to login and remembers where they were going', () => { renderApp(app, '/secret?x=1'); expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fsecret%3Fx%3D1') })
  it('shows a loading state while the session resolves — no flash of protected content', () => { auth.loading = true; renderApp(app, '/secret'); expect(screen.queryByText('secret page')).toBeNull(); expect(screen.getByRole('status')).toBeInTheDocument() })
  it('lets a signed-in, onboarded student in', async () => { Object.assign(auth, { isAuthenticated: true, me: me('student'), role: 'student' }); renderApp(app, '/secret'); expect(await screen.findByText('secret page')).toBeInTheDocument(); expect(screen.getByTestId('shell')).toBeInTheDocument() })
  it('sends students who have not onboarded to onboarding', () => { Object.assign(auth, { isAuthenticated: true, me: me('student', false), role: 'student' }); renderApp(app, '/secret'); expect(screen.getByTestId('where')).toHaveTextContent('/onboarding') })
  it('does not force reviewers through student onboarding', async () => { Object.assign(auth, { isAuthenticated: true, me: me('reviewer', false), role: 'reviewer' }); renderApp(app, '/review'); expect(await screen.findByText('review page')).toBeInTheDocument() })
  it('keeps students out of reviewer/admin screens', () => { Object.assign(auth, { isAuthenticated: true, me: me('student'), role: 'student' }); renderApp(app, '/review'); expect(screen.getByTestId('where')).toHaveTextContent('/dashboard'); renderApp(app, '/admin') })
  it('lets admins into admin', async () => { Object.assign(auth, { isAuthenticated: true, me: me('admin'), role: 'admin' }); renderApp(app, '/admin'); expect(await screen.findByText('admin page')).toBeInTheDocument() })
  it('reviewers are blocked from /admin', () => { Object.assign(auth, { isAuthenticated: true, me: me('reviewer'), role: 'reviewer' }); renderApp(app, '/admin'); expect(screen.getByTestId('where')).toHaveTextContent('/dashboard') })
  it('bounces signed-in users away from register', () => { Object.assign(auth, { isAuthenticated: true, me: me('student') }); renderApp(app, '/register'); expect(screen.getByTestId('where')).toHaveTextContent('/dashboard') })
  it('shows a retryable error when the profile cannot load', () => { Object.assign(auth, { isAuthenticated: true, me: null, meError: new Error('boom') }); renderApp(app, '/secret'); expect(screen.getByText('boom')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument() })
})
