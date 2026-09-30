import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Notice } from '../../components/ui/kit'
import { useAuth } from '../../context/AuthContext'
import { AuthLayout, friendlyAuthError } from './AuthLayout'

export function ForgotPasswordPage() {
  const { sendPasswordReset, configured } = useAuth()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address') })) })
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link." footer={<Link to="/login" className="text-accent-500 font-medium focus-ring rounded">Back to log in</Link>}>
      {sent ? <Notice tone="success" title="Check your inbox">If an account exists for that email, a reset link is on its way. The link expires soon, so use it promptly.</Notice> : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => { setError(null); const e = await sendPasswordReset(v.email); if (e && !/not found/i.test(e.message)) setError(friendlyAuthError(e.message)); else setSent(true) })}>
          <Input label="Email" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
          {error && <p className="text-sm text-danger-500" role="alert">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting} disabled={!configured}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  )
}

const pwSchema = z.object({ password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** Landing page of the emailed recovery link: Supabase turns it into a short-lived recovery session. */
export function ResetPasswordPage() {
  const { updatePassword, session, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [waited, setWaited] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) })
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t) }, [])
  if (!session && (loading || !waited)) return <AuthLayout title="Verifying link…"><p className="text-sm text-muted" role="status">One moment…</p></AuthLayout>
  if (!session) return <AuthLayout title="Link expired" footer={<Link to="/login" className="text-accent-500 focus-ring rounded">Back to log in</Link>}><Notice tone="warning">This reset link is invalid or has expired. <Link to="/forgot-password" className="underline">Request a new one</Link>.</Notice></AuthLayout>
  return (
    <AuthLayout title="Choose a new password">
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => { setError(null); const e = await updatePassword(v.password); if (e) { setError(friendlyAuthError(e.message)); return } toast.success('Password updated'); navigate('/dashboard', { replace: true }) })}>
        <Input label="New password" type="password" autoComplete="new-password" {...register('password')} error={errors.password?.message} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
        {error && <p className="text-sm text-danger-500" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthLayout>
  )
}
