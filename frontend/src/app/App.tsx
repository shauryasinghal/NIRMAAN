import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { queryClient } from '../lib/queryClient'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { router } from './router'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" toastOptions={{ style: { fontSize: '13px' }, ariaProps: { role: 'status', 'aria-live': 'polite' } }} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
