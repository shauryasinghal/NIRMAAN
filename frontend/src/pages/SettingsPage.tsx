import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

const MODES = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
] as const

export function SettingsPage() {
  const { mode, setMode } = useTheme()
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <Card className="p-5 mb-4">
        <h2 className="text-sm font-medium mb-3">Appearance</h2>
        <div className="flex gap-2">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key} onClick={() => setMode(key)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs"
              style={{ borderColor: mode === key ? 'var(--color-accent-500)' : 'var(--border)', color: mode === key ? 'var(--color-accent-500)' : 'inherit' }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-sm font-medium mb-1">Account</h2>
        <p className="text-xs text-muted">Manage your profile from the Profile page.</p>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3">Session</h2>
        <Button variant="danger" size="sm" onClick={() => { logout(); navigate('/login') }}>Log out</Button>
      </Card>
    </div>
  )
}
