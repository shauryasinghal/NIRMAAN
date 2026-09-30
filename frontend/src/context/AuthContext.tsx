import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Role } from '../types'

interface AuthState {
  token: string | null
  role: Role | null
  isAuthenticated: boolean
  login: (token: string, role: Role) => void
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('nirmaan_token'))
  const [role, setRole] = useState<Role | null>(localStorage.getItem('nirmaan_role') as Role | null)

  const login = (t: string, r: Role) => {
    localStorage.setItem('nirmaan_token', t)
    localStorage.setItem('nirmaan_role', r)
    setToken(t)
    setRole(r)
  }

  const logout = () => {
    localStorage.removeItem('nirmaan_token')
    localStorage.removeItem('nirmaan_role')
    setToken(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ token, role, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
