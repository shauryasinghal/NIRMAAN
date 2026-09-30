import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { NirmaanLogo } from '../components/common/NirmaanMark'
import { useAuth } from '../context/AuthContext'

export function NotFoundPage() {
  const { isAuthenticated } = useAuth()
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-grid bg-radial-glow">
      <NirmaanLogo className="mb-8" /><p className="text-xs font-medium text-accent-500 tracking-[0.2em] mb-2">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We couldn't find that page</h1><p className="text-sm text-muted mt-2 max-w-sm">The link may be old or mistyped.</p>
      <div className="flex gap-2 mt-6"><Link to={isAuthenticated ? '/dashboard' : '/'}><Button>{isAuthenticated ? 'Go to dashboard' : 'Back to home'}</Button></Link>{isAuthenticated && <Link to="/opportunities"><Button variant="secondary">Browse opportunities</Button></Link>}</div>
    </main>
  )
}
