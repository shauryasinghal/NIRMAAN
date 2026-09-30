import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute, RoleRoute, FullPageLoading } from '../components/RouteGuards'
import { RouteError } from '../components/RouteError'

const page = <T extends object>(loader: () => Promise<T>, name: keyof T) => lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))

const LandingPage = page(() => import('../pages/LandingPage'), 'LandingPage')
const LoginPage = page(() => import('../pages/auth/LoginPage'), 'LoginPage')
const RegisterPage = page(() => import('../pages/auth/RegisterPage'), 'RegisterPage')
const ForgotPasswordPage = page(() => import('../pages/auth/PasswordPages'), 'ForgotPasswordPage')
const ResetPasswordPage = page(() => import('../pages/auth/PasswordPages'), 'ResetPasswordPage')
const AuthCallbackPage = page(() => import('../pages/auth/AuthCallbackPage'), 'AuthCallbackPage')
const OnboardingPage = page(() => import('../pages/OnboardingPage'), 'OnboardingPage')
const DashboardPage = page(() => import('../pages/DashboardPage'), 'DashboardPage')
const OpportunitiesPage = page(() => import('../pages/OpportunitiesPage'), 'OpportunitiesPage')
const OpportunityDetailPage = page(() => import('../pages/OpportunityDetailPage'), 'OpportunityDetailPage')
const ComparePage = page(() => import('../pages/ComparePage'), 'ComparePage')
const SavedPage = page(() => import('../pages/SavedPage'), 'SavedPage')
const OrganizationsPage = page(() => import('../pages/OrganizationsPage'), 'OrganizationsPage')
const OrganizationDetailPage = page(() => import('../pages/OrganizationDetailPage'), 'OrganizationDetailPage')
const ApplicationsPage = page(() => import('../pages/ApplicationsPage'), 'ApplicationsPage')
const SmartAlertsPage = page(() => import('../pages/SmartAlertsPage'), 'SmartAlertsPage')
const NotificationsPage = page(() => import('../pages/NotificationsPage'), 'NotificationsPage')
const ActivityPage = page(() => import('../pages/ActivityPage'), 'ActivityPage')
const TeamBuilderPage = page(() => import('../pages/TeamBuilderPage'), 'TeamBuilderPage')
const OriginalityPage = page(() => import('../pages/OriginalityPage'), 'OriginalityPage')
const OriginalityHistoryPage = page(() => import('../pages/OriginalityHistoryPage'), 'OriginalityHistoryPage')
const IdeaDetailPage = page(() => import('../pages/OriginalityHistoryPage'), 'IdeaDetailPage')
const ProfilePage = page(() => import('../pages/ProfilePage'), 'ProfilePage')
const SettingsPage = page(() => import('../pages/SettingsPage'), 'SettingsPage')
const IntegrationCallbackPage = page(() => import('../pages/IntegrationCallbackPage'), 'IntegrationCallbackPage')
const ReviewerQueuePage = page(() => import('../pages/ReviewerPages'), 'ReviewerQueuePage')
const ReviewerDetailPage = page(() => import('../pages/ReviewerPages'), 'ReviewerDetailPage')
const AdminPage = page(() => import('../pages/AdminPage'), 'AdminPage')
const NotFoundPage = page(() => import('../pages/NotFoundPage'), 'NotFoundPage')

const S = (el: React.ReactNode) => <Suspense fallback={<div className="p-8 text-sm text-muted" role="status">Loading…</div>}>{el}</Suspense>
const P = (C: React.ComponentType) => ({ element: S(<C />), errorElement: <RouteError /> })

export const router = createBrowserRouter([
  { errorElement: <RouteError />, element: <Suspense fallback={<FullPageLoading />}><Outlet /></Suspense>, children: [
    { path: '/', element: S(<LandingPage />) },
    { path: '/auth/callback', element: S(<AuthCallbackPage />) },
    { path: '/auth/reset', element: S(<ResetPasswordPage />) },
    { element: <PublicOnlyRoute />, children: [
      { path: '/login', element: S(<LoginPage />) }, { path: '/register', element: S(<RegisterPage />) }, { path: '/forgot-password', element: S(<ForgotPasswordPage />) },
    ] },
    { element: <ProtectedRoute requireOnboarded={false} />, children: [{ path: '/onboarding', element: S(<OnboardingPage />) }] },
    { element: <ProtectedRoute />, children: [
      { path: '/dashboard', ...P(DashboardPage) }, { path: '/opportunities', ...P(OpportunitiesPage) }, { path: '/opportunities/:id', ...P(OpportunityDetailPage) },
      { path: '/compare', ...P(ComparePage) }, { path: '/saved', ...P(SavedPage) }, { path: '/organizations', ...P(OrganizationsPage) }, { path: '/organizations/:slug', ...P(OrganizationDetailPage) },
      { path: '/applications', ...P(ApplicationsPage) }, { path: '/smart-alerts', ...P(SmartAlertsPage) }, { path: '/notifications', ...P(NotificationsPage) }, { path: '/activity', ...P(ActivityPage) },
      { path: '/team-builder', ...P(TeamBuilderPage) }, { path: '/originality', ...P(OriginalityPage) }, { path: '/originality/history', ...P(OriginalityHistoryPage) }, { path: '/originality/history/:id', ...P(IdeaDetailPage) },
      { path: '/profile', ...P(ProfilePage) }, { path: '/settings', ...P(SettingsPage) }, { path: '/integrations/google/callback', ...P(IntegrationCallbackPage) },
      { element: <RoleRoute min="reviewer" />, children: [{ path: '/review', ...P(ReviewerQueuePage) }, { path: '/review/:reviewId', ...P(ReviewerDetailPage) }] },
      { element: <RoleRoute min="admin" />, children: [{ path: '/admin', ...P(AdminPage) }] },
    ] },
    { path: '*', element: S(<NotFoundPage />) },
  ] },
])
