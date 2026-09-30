import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { authService } from '../lib/services'
import { GoogleAuthButton } from '../components/common/GoogleAuthButton'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await authService.login(values)
      login(res.access_token, res.role)
      toast.success('Welcome back')
      navigate(res.role === 'REVIEWER' ? '/review' : '/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 bg-navy-900 text-white">
        <div className="text-xl font-semibold tracking-tight">NIRMAAN</div>
        <div>
          <p className="text-2xl font-medium leading-snug mb-3">Find opportunities that fit.<br />Build teams that complement.<br />Validate ideas before you build.</p>
          <p className="text-sm text-white/50">The AI Operating System for Student Innovation.</p>
        </div>
        <div />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-1">Log in</h1>
          <p className="text-sm text-muted mb-6">Welcome back to NIRMAAN.</p>
          {params.get('expired') && (
            <p className="text-xs text-warning-500 mb-4">Your session expired — please log in again.</p>
          )}
          <GoogleAuthButton />
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-[11px] text-muted">OR</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Input label="Email" type="email" placeholder="you@gla.demo" error={errors.email?.message} {...register('email')} />
            <div className="relative">
              <Input label="Password" type={showPw ? 'text' : 'password'} placeholder="••••••••" error={errors.password?.message} {...register('password')} />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-[34px] text-muted" aria-label="Toggle password visibility">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button type="submit" className="w-full" loading={isSubmitting}>Log in</Button>
          </form>
          <p className="text-xs text-muted mt-5 leading-relaxed">
            Demo student: <b>priya.nair@gla.demo</b> / demo1234<br />
            Demo reviewer: <b>reviewer@gla.demo</b> / demo1234
          </p>
          <p className="text-sm text-muted mt-6">
            New here? <Link to="/register" className="text-accent-500 font-medium">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
