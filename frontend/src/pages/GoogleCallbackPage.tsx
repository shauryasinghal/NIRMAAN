import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { googleAuthService } from '../lib/services'
import { useAuth } from '../context/AuthContext'

export function GoogleCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error')

    if (oauthError) {
      setError('Google sign-in was cancelled.')
      return
    }
    if (!code || !state) {
      setError('Missing information from Google — please try signing in again.')
      return
    }

    googleAuthService.callback(code, state)
      .then((res) => {
        login(res.access_token, res.role)
        toast.success('Signed in with Google')
        navigate(res.isNewProfile ? '/onboarding' : '/dashboard')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-in failed.'))
  }, [params, login, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <p className="text-sm text-danger-500 mb-3">{error}</p>
            <a href="/login" className="text-sm text-accent-500 hover:underline">Back to login</a>
          </>
        ) : (
          <p className="text-sm text-muted">Signing you in with Google…</p>
        )}
      </div>
    </div>
  )
}
