import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../lib/services'

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 7.3l3.8 3c.9-2.7 3.4-4.7 6.4-4.7z"/></svg>
)

/** Real Supabase Google OAuth (Google's own consent screen — NIRMAAN never sees a Google password).
 *  The button is enabled only when Supabase itself reports the Google provider as configured. */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const { signInWithGoogle, configured } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cfg = useQuery({ queryKey: ['auth-config'], queryFn: authService.config, staleTime: 5 * 60_000, retry: false, enabled: configured })
  const enabled = configured && cfg.data?.google === true
  const reason = !configured ? 'Sign-in is not configured.' : cfg.isLoading ? 'Checking availability…' : "Google sign-in isn't enabled for this project yet."
  return (
    <div>
      <Button type="button" variant="secondary" size="lg" className="w-full" disabled={!enabled || busy} loading={busy} aria-describedby="google-hint"
        onClick={async () => { setBusy(true); setErr(null); const e = await signInWithGoogle(); if (e) { setErr(e.message); setBusy(false) } }}>
        <GoogleG /> {label}
      </Button>
      {!enabled && <p id="google-hint" className="text-[11px] text-muted mt-1.5 text-center">{reason}</p>}
      {err && <p className="text-xs text-danger-500 mt-1.5 text-center" role="alert">{err}</p>}
    </div>
  )
}

export function OrDivider() {
  return <div className="flex items-center gap-3 my-5" role="separator"><span className="h-px flex-1" style={{ background: 'var(--border)' }} /><span className="text-[11px] uppercase tracking-wide text-muted">or</span><span className="h-px flex-1" style={{ background: 'var(--border)' }} /></div>
}
