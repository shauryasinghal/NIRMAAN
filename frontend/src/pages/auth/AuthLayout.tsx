import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { NirmaanLogo } from '../../components/common/NirmaanMark'
import { Notice } from '../../components/ui/kit'
import { useAuth } from '../../context/AuthContext'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { configured } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-grid bg-radial-glow">
      <main className="w-full max-w-md">
        <Link to="/" aria-label="NIRMAAN — home" className="flex justify-center mb-8 focus-ring rounded"><NirmaanLogo variant="full" decorative className="w-[min(100%,19rem)] text-navy-900 dark:text-white" /></Link>
        <div className="surface-elevated rounded-2xl p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1 mb-6">{subtitle}</p>}
          {!configured && (
            <div className="mb-5"><Notice tone="warning" title="Sign-in isn't configured">
              This build has no Supabase project connected. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see the README) and reload.
            </Notice></div>
          )}
          {children}
        </div>
        {footer && <p className="text-center text-sm text-muted mt-5">{footer}</p>}
      </main>
    </div>
  )
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'Incorrect email or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the verification link.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try logging in instead.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.'
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('pwned') || m.includes('compromised'))) return message
  if (m.includes('fetch') || m.includes('network')) return "We couldn't reach the sign-in service. Check your connection and try again."
  return message
}
