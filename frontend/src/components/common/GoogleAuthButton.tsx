import { useQuery } from '@tanstack/react-query'
import { googleAuthService } from '../../lib/services'
import { Button } from '../ui/Button'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.1 27 36 24 36c-5.2 0-9.6-3.4-11.2-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  )
}

export function GoogleAuthButton({ label = 'Continue with Google' }: { label?: string }) {
  const { data } = useQuery({ queryKey: ['google-status'], queryFn: googleAuthService.status })
  const configured = data?.configured ?? false

  const handleClick = async () => {
    if (!configured) return
    const { authorizationUrl } = await googleAuthService.loginUrl()
    window.location.href = authorizationUrl
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!configured}
        onClick={handleClick}
      >
        <GoogleIcon /> {label}
      </Button>
      {data && !configured && (
        <p className="text-[11px] text-muted mt-1.5 text-center">Google sign-in is not configured in this environment.</p>
      )}
    </div>
  )
}
