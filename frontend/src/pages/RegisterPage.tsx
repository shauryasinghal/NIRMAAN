import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { authService } from '../lib/services'
import { GoogleAuthButton } from '../components/common/GoogleAuthButton'

const schema = z
  .object({
    name: z.string().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await authService.register(values)
      const res = await authService.login(values)
      login(res.access_token, res.role)
      toast.success('Account created')
      navigate('/onboarding')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-navy-900 text-white">
        <div className="text-xl font-semibold tracking-tight">NIRMAAN</div>
        <div>
          <p className="text-2xl font-medium leading-snug mb-3">Three engines.<br />One dashboard.<br />Zero guesswork.</p>
          <p className="text-sm text-white/50">Opportunity fit, complementary teams, and originality screening.</p>
        </div>
        <div />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
          <p className="text-sm text-muted mb-6">Takes less than a minute.</p>
          <GoogleAuthButton label="Sign up with Google" />
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-[11px] text-muted">OR</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Input label="Full name" placeholder="Ananya Sharma" error={errors.name?.message} {...register('name')} />
            <Input label="Email" type="email" placeholder="you@gla.demo" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" placeholder="At least 8 characters" error={errors.password?.message} {...register('password')} />
            <Input label="Confirm password" type="password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
            <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
          </form>
          <p className="text-sm text-muted mt-6">
            Already have an account? <Link to="/login" className="text-accent-500 font-medium">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
