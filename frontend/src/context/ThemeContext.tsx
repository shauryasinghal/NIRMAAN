import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeState | undefined>(undefined)

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const resolved =
    mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode
  root.classList.toggle('dark', resolved === 'dark')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    (localStorage.getItem('nirmaan_theme') as ThemeMode) || 'system',
  )

  useEffect(() => {
    applyTheme(mode)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => mode === 'system' && applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = (m: ThemeMode) => {
    localStorage.setItem('nirmaan_theme', m)
    setModeState(m)
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
