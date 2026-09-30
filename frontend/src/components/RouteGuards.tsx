import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ErrorState, Skeleton } from './ui/primitives'
import type { Role } from '../types'

const AppShell = lazy(() => import('./layout/AppShell').then((m) => ({ default: m.AppShell })))
const RANK: Record<Role, number> = { student: 1, reviewer: 2, admin: 3 }

export function FullPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      <div className="w-64 space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /><span className="sr-only">Loading…</span></div>
    </div>
  )
}

function Shell() {
  return <Suspense fallback={<FullPageLoading />}><AppShell><Outlet /></AppShell></Suspense>
}

/** Signed in + profile loaded. Students who haven't finished onboarding are sent there first. */
export function ProtectedRoute({ requireOnboarded = true }: { requireOnboarded?: boolean }) {
  const { loading, isAuthenticated, me, meLoading, meError, refreshMe } = useAuth()
  const loc = useLocation()
  if (loading || meLoading) return <FullPageLoading />
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (meError || !me) return <div className="min-h-screen flex items-center justify-center"><ErrorState message={meError?.message ?? 'We could not load your account.'} onRetry={() => void refreshMe()} /></div>
  if (requireOnboarded && me.role === 'student' && !me.onboardingCompleted && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <Shell />
}

/** Route-level convenience only. The API re-checks the role on every request — this never is the security boundary. */
export function RoleRoute({ min }: { min: Role }) {
  const { me } = useAuth()
  if (!me || RANK[me.role] < RANK[min]) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { loading, isAuthenticated } = useAuth()
  if (loading) return <FullPageLoading />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
