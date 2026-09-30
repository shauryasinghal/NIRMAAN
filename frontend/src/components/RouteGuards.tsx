import { lazy, Suspense } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AppShell = lazy(() => import('./layout/AppShell').then((m) => ({ default: m.AppShell })))

function ShellFallback() {
  return <div className="min-h-screen flex items-center justify-center text-sm text-muted">Loading…</div>
}

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>
        <Outlet />
      </AppShell>
    </Suspense>
  )
}

export function RoleProtectedRoute({ role }: { role: 'REVIEWER' | 'STUDENT' }) {
  const { isAuthenticated, role: userRole } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (userRole !== role) return <Navigate to="/dashboard" replace />
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>
        <Outlet />
      </AppShell>
    </Suspense>
  )
}

export function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
