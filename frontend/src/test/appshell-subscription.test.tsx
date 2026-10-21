import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { baseAuth, renderApp } from './utils'

const signOut = vi.fn(async () => undefined)
const auth = { ...baseAuth, isAuthenticated: true, role: 'student', signOut, me: { id: 'u', email: 'e@x.dev', fullName: 'Stu Dent', role: 'student', isReviewer: false, isAdmin: false, onboardingCompleted: true } }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ mode: 'light', setMode: () => undefined }) }))
vi.mock('../lib/services', () => ({ notificationService: { unreadCount: async () => ({ unread: 0 }) } }))
vi.mock('../components/chat/ChatGate', () => ({ ChatGate: () => null }))
vi.mock('../components/common/CommandPalette', () => ({ CommandPalette: () => null, recordRecentPage: () => undefined }))
import { AppShell } from '../components/layout/AppShell'

const app = () => renderApp(
  <Routes>
    <Route path="/dashboard" element={<AppShell><p>dashboard page</p></AppShell>} />
    <Route path="/pricing" element={<p>pricing page</p>} />
  </Routes>, '/dashboard')

describe('Subscription navigation (authenticated shell)', () => {
  it('lists "Subscription" under Workspace, after Settings, linking to the existing /pricing route', () => {
    app()
    const links = screen.getAllByRole('link', { name: 'Subscription' })
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(l).toHaveAttribute('href', '/pricing')
    const sidebar = links[0].closest('nav')!
    const labels = within(sidebar).getAllByRole('link').map((a) => a.textContent)
    expect(labels.indexOf('Subscription')).toBe(labels.indexOf('Settings') + 1)
  })
  it('navigates to /pricing without signing the user out', async () => {
    app()
    fireEvent.click(screen.getAllByRole('link', { name: 'Subscription' })[0])
    expect(await screen.findByText('pricing page')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})
