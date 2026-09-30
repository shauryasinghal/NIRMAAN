import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Notice } from '../components/ui/kit'
import { integrationService } from '../lib/services'
import type { ApiError } from '../lib/api'

/** Google Calendar / Gmail consent lands here (the separate, optional connection — not sign-in). The one-time code is
 *  posted to the API together with the signed `state` that binds it to this user, then removed from the URL. */
export function IntegrationCallbackPage() {
  const [sp] = useSearchParams(); const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return; ran.current = true
    const code = sp.get('code'), state = sp.get('state'), denied = sp.get('error')
    const provider = (sessionStorage.getItem('nirmaan_google_provider') as 'calendar' | 'gmail' | null) ?? 'calendar'
    window.history.replaceState({}, '', '/integrations/google/callback')
    if (denied) { setErr('You declined the permission, so nothing was connected.'); return }
    if (!code || !state) { setErr('This connection link is incomplete. Please start again from Settings.'); return }
    integrationService.callback(provider, code, state).then(() => { sessionStorage.removeItem('nirmaan_google_provider'); toast.success('Connected'); nav('/settings', { replace: true }) }).catch((e: ApiError) => setErr(e.message))
  }, [sp, nav])
  return <div className="max-w-md mx-auto pt-16">{err ? <Notice tone="danger" title="Couldn't connect">{err} <Link to="/settings" className="underline">Back to settings</Link></Notice> : <p className="text-sm text-muted text-center" role="status">Finishing the connection…</p>}</div>
}
