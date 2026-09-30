import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute, RoleProtectedRoute, PublicOnlyRoute } from '../components/RouteGuards'

const LandingPage = lazy(() => import('../pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('../pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const GoogleCallbackPage = lazy(() => import('../pages/GoogleCallbackPage').then((m) => ({ default: m.GoogleCallbackPage })))
const OnboardingPage = lazy(() => import('../pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const OpportunitiesPage = lazy(() => import('../pages/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })))
const OpportunityDetailPage = lazy(() => import('../pages/OpportunityDetailPage').then((m) => ({ default: m.OpportunityDetailPage })))
const TeamBuilderPage = lazy(() => import('../pages/TeamBuilderPage').then((m) => ({ default: m.TeamBuilderPage })))
const OriginalityPage = lazy(() => import('../pages/OriginalityPage').then((m) => ({ default: m.OriginalityPage })))
const OriginalityHistoryPage = lazy(() => import('../pages/OriginalityHistoryPage').then((m) => ({ default: m.OriginalityHistoryPage })))
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ReviewerQueuePage = lazy(() => import('../pages/ReviewerQueuePage').then((m) => ({ default: m.ReviewerQueuePage })))
const ReviewerDetailPage = lazy(() => import('../pages/ReviewerDetailPage').then((m) => ({ default: m.ReviewerDetailPage })))
const SavedPage = lazy(() => import('../pages/SavedPage').then((m) => ({ default: m.SavedPage })))
const ApplicationsPage = lazy(() => import('../pages/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const ActivityPage = lazy(() => import('../pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const OrganizationsPage = lazy(() => import('../pages/OrganizationsPage').then((m) => ({ default: m.OrganizationsPage })))
const OrganizationDetailPage = lazy(() => import('../pages/OrganizationDetailPage').then((m) => ({ default: m.OrganizationDetailPage })))
const SmartAlertsPage = lazy(() => import('../pages/SmartAlertsPage').then((m) => ({ default: m.SmartAlertsPage })))
const ComparePage = lazy(() => import('../pages/ComparePage').then((m) => ({ default: m.ComparePage })))

function withSuspense(el: React.ReactNode) {
  return <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>{el}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/', element: withSuspense(<LandingPage />) },
  { path: '/auth/google/callback', element: withSuspense(<GoogleCallbackPage />) },
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: withSuspense(<LoginPage />) },
      { path: '/register', element: withSuspense(<RegisterPage />) },
    ],
  },
  { path: '/onboarding', element: withSuspense(<OnboardingPage />) },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: withSuspense(<DashboardPage />) },
      { path: '/opportunities', element: withSuspense(<OpportunitiesPage />) },
      { path: '/opportunities/:id', element: withSuspense(<OpportunityDetailPage />) },
      { path: '/saved', element: withSuspense(<SavedPage />) },
      { path: '/organizations', element: withSuspense(<OrganizationsPage />) },
      { path: '/organizations/:name', element: withSuspense(<OrganizationDetailPage />) },
      { path: '/compare', element: withSuspense(<ComparePage />) },
      { path: '/smart-alerts', element: withSuspense(<SmartAlertsPage />) },
      { path: '/team-builder', element: withSuspense(<TeamBuilderPage />) },
      { path: '/originality', element: withSuspense(<OriginalityPage />) },
      { path: '/originality/history', element: withSuspense(<OriginalityHistoryPage />) },
      { path: '/applications', element: withSuspense(<ApplicationsPage />) },
      { path: '/activity', element: withSuspense(<ActivityPage />) },
      { path: '/notifications', element: withSuspense(<NotificationsPage />) },
      { path: '/profile', element: withSuspense(<ProfilePage />) },
      { path: '/settings', element: withSuspense(<SettingsPage />) },
    ],
  },
  {
    element: <RoleProtectedRoute role="REVIEWER" />,
    children: [
      { path: '/review', element: withSuspense(<ReviewerQueuePage />) },
      { path: '/review/:reviewId', element: withSuspense(<ReviewerDetailPage />) },
    ],
  },
])
