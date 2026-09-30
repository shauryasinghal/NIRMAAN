import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { AuthLayout, friendlyAuthError } from './AuthLayout'
import { GoogleButton, OrDivider } from './GoogleButton'

// NB: no role field exists. Every public signup is a student; roles are granted only by an admin, server-side.
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { signUp, configured } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async (v: Form) => {
    setError(null)
    const { error: err, needsConfirmation } = await signUp(v.name, v.email, v.password)
    if (err) { setError(friendlyAuthError(err.message)); return }
    if (needsConfirmation) setSentTo(v.email); else navigate('/onboarding', { replace: true })
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your inbox" footer={<Link to="/login" className="text-accent-500 font-medium focus-ring rounded">Back to log in</Link>}>
        <div className="text-center py-2"><MailCheck size={32} className="mx-auto text-accent-500 mb-3" aria-hidden />
          <p className="text-sm">We sent a verification link to <strong>{sentTo}</strong>. Open it to activate your account.</p>
          <p className="text-xs text-muted mt-2">Didn't get it? Check spam, or</p>
          {resent ? <p className="text-xs text-success-500 mt-1" role="status">Sent again.</p> : <button className="text-xs text-accent-500 underline mt-1 focus-ring rounded" onClick={async () => { await supabase.auth.resend({ type: 'signup', email: sentTo }); setResent(true) }}>resend the email</button>}
        </div>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Create your account" subtitle="Free for students. Takes a minute." footer={<>Already have an account? <Link to="/login" className="text-accent-500 font-medium focus-ring rounded">Log in</Link></>}>
      <GoogleButton label="Sign up with Google" />
      <OrDivider />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" {...register('name')} error={errors.name?.message} />
        <Input label="Email" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Input label="Password" type="password" autoComplete="new-password" {...register('password')} error={errors.password?.message} />
        <Input label="Confirm password" type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
        {error && <p className="text-sm text-danger-500" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} disabled={!configured}>Create account</Button>
        <p className="text-[11px] text-muted text-center">You'll be signed up as a student. Reviewer access is granted by an administrator.</p>
      </form>
    </AuthLayout>
  )
}
