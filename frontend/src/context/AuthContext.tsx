import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { supabaseConfigured } from '../lib/env'
import { authService } from '../lib/services'
import type { Me, Role } from '../types'

interface AuthState {
  configured: boolean
  loading: boolean                 // resolving the persisted Supabase session
  session: Session | null
  isAuthenticated: boolean
  me: Me | null                    // role + onboarding come from the API (database), never from the token or localStorage
  meLoading: boolean
  meError: Error | null
  role: Role | null
  signInWithPassword: (email: string, password: string) => Promise<AuthError | null>
  signUp: (fullName: string, email: string, password: string) => Promise<{ error: AuthError | null; needsConfirmation: boolean }>
  signInWithGoogle: () => Promise<AuthError | null>
  sendPasswordReset: (email: string) => Promise<AuthError | null>
  updatePassword: (password: string) => Promise<AuthError | null>
  signOut: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)
const origin = () => window.location.origin

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabaseConfigured) return
    let live = true
    supabase.auth.getSession().then(({ data }) => { if (live) { setSession(data.session); setLoading(false) } })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') qc.clear()
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') qc.invalidateQueries({ queryKey: ['me'] })
    })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [qc])

  const meQuery = useQuery({ queryKey: ['me', session?.user.id], queryFn: authService.me, enabled: !!session, staleTime: 60_000 })

  const signInWithPassword = useCallback(async (email: string, password: string) => (await supabase.auth.signInWithPassword({ email, password })).error, [])
  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    // NB: no role is ever sent. Every public signup is a student; roles change only through the admin-only database function.
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${origin()}/auth/callback` } })
    return { error, needsConfirmation: !error && !data.session }
  }, [])
  const signInWithGoogle = useCallback(async () => (await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin()}/auth/callback` } })).error, [])
  const sendPasswordReset = useCallback(async (email: string) => (await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/auth/reset` })).error, [])
  const updatePassword = useCallback(async (password: string) => (await supabase.auth.updateUser({ password })).error, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut(); qc.clear() }, [qc])
  const refreshMe = useCallback(async () => { await qc.invalidateQueries({ queryKey: ['me'] }) }, [qc])

  const value = useMemo<AuthState>(() => ({
    configured: supabaseConfigured, loading, session, isAuthenticated: !!session,
    me: meQuery.data ?? null, meLoading: !!session && meQuery.isLoading, meError: (meQuery.error as Error | null) ?? null, role: meQuery.data?.role ?? null,
    signInWithPassword, signUp, signInWithGoogle, sendPasswordReset, updatePassword, signOut, refreshMe,
  }), [loading, session, meQuery.data, meQuery.isLoading, meQuery.error, signInWithPassword, signUp, signInWithGoogle, sendPasswordReset, updatePassword, signOut, refreshMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
