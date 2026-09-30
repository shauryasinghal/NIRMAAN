import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from '../pages/LoginPage'
import { AuthProvider } from '../context/AuthContext'
import { authService } from '../lib/services'

vi.mock('../lib/services', () => ({
  authService: { login: vi.fn() },
  googleAuthService: { status: vi.fn().mockResolvedValue({ configured: false }) },
}))

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  it('shows a validation error for an invalid email without calling the API', async () => {
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), 'irrelevant')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('calls authService.login with the submitted credentials', async () => {
    vi.mocked(authService.login).mockResolvedValue({ access_token: 'tok123', role: 'STUDENT' })
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'priya.nair@gla.demo')
    await userEvent.type(screen.getByLabelText('Password'), 'demo1234')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() =>
      expect(authService.login).toHaveBeenCalledWith({ email: 'priya.nair@gla.demo', password: 'demo1234' }),
    )
  })
})
