import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Notice } from '../../components/ui/kit'
import { useAuth } from '../../context/AuthContext'
import { AuthLayout } from './AuthLayout'

/** Target of Google OAuth and email-verification redirects. Supabase (detectSessionInUrl) exchanges the code for a
 *  session; this page waits for it and then hands off to the router, which sends new students to onboarding. */
export function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const providerError = query.get('error_description') || hash.get('error_description')

  useEffect(() => { if (session) navigate('/dashboard', { replace: true }) }, [session, navigate])
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 8000); return () => clearTimeout(t) }, [])

  if (providerError) return <AuthLayout title="Sign-in didn't complete" footer={<Link to="/login" className="text-accent-500 font-medium focus-ring rounded">Back to log in</Link>}><Notice tone="danger">{providerError.replace(/\+/g, ' ')}</Notice></AuthLayout>
  if (!loading && !session && timedOut) return <AuthLayout title="Couldn't finish signing you in" footer={<Link to="/login" className="text-accent-500 font-medium focus-ring rounded">Back to log in</Link>}><Notice tone="warning">The link may have expired or was already used. If you just verified your email, you can log in now.</Notice></AuthLayout>
  return <AuthLayout title="Signing you in…"><p className="text-sm text-muted" role="status">Just a moment while we finish securely.</p></AuthLayout>
}
