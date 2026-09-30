import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Notice } from '../../components/ui/kit'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { AuthLayout, friendlyAuthError } from './AuthLayout'
import { GoogleButton, OrDivider } from './GoogleButton'

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') })
type Form = z.infer<typeof schema>

export function LoginPage() {
  const { signInWithPassword, configured } = useAuth()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting }, getValues } = useForm<Form>({ resolver: zodResolver(schema) })
  const next = sp.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  const onSubmit = async (v: Form) => {
    setError(null); setUnconfirmed(null)
    const err = await signInWithPassword(v.email, v.password)
    if (err) { if (err.message.toLowerCase().includes('not confirmed')) setUnconfirmed(v.email); setError(friendlyAuthError(err.message)); return }
    navigate(safeNext, { replace: true })
  }
  const resend = async () => { await supabase.auth.resend({ type: 'signup', email: getValues('email') }); setResent(true) }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue building." footer={<>New to NIRMAAN? <Link to="/register" className="text-accent-500 font-medium focus-ring rounded">Create an account</Link></>}>
      {sp.get('expired') && <div className="mb-4"><Notice tone="warning">Your session expired. Please log in again.</Notice></div>}
      {sp.get('verified') && <div className="mb-4"><Notice tone="success">Email confirmed. You can log in now.</Notice></div>}
      <GoogleButton />
      <OrDivider />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Input label="Password" type="password" autoComplete="current-password" {...register('password')} error={errors.password?.message} />
        <div className="text-right -mt-2"><Link to="/forgot-password" className="text-xs text-accent-500 focus-ring rounded">Forgot password?</Link></div>
        {error && <p className="text-sm text-danger-500" role="alert">{error}</p>}
        {unconfirmed && (resent ? <p className="text-xs text-success-500" role="status">Verification email sent again.</p> : <button type="button" onClick={resend} className="text-xs text-accent-500 underline focus-ring rounded">Resend verification email</button>)}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} disabled={!configured}>Log in</Button>
      </form>
    </AuthLayout>
  )
}
