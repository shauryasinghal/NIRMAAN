import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, LayoutDashboard, Compass, Users, ShieldCheck, History, User, Settings, Sun, LogOut,
  Bookmark, ClipboardList, Activity, Bell, Building2,
} from 'lucide-react'
import { opportunityService } from '../../lib/services'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const PAGES = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Opportunities', to: '/opportunities', icon: Compass },
  { label: 'Organizations', to: '/organizations', icon: Building2 },
  { label: 'Saved Opportunities', to: '/saved', icon: Bookmark },
  { label: 'Team Builder', to: '/team-builder', icon: Users },
  { label: 'Originality Checker', to: '/originality', icon: ShieldCheck },
  { label: 'History', to: '/originality/history', icon: History },
  { label: 'My Applications', to: '/applications', icon: ClipboardList },
  { label: 'Smart Alerts', to: '/smart-alerts', icon: Bell },
  { label: 'Activity', to: '/activity', icon: Activity },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Profile', to: '/profile', icon: User },
  { label: 'Settings', to: '/settings', icon: Settings },
]

const RECENT_KEY = 'nirmaan_recent_pages'
export function recordRecentPage(pathname: string) {
  const match = PAGES.find((p) => p.to === pathname)
  if (!match) return
  const existing: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  const next = [pathname, ...existing.filter((p) => p !== pathname)].slice(0, 3)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { mode, setMode } = useTheme()

  const { data } = useQuery({
    queryKey: ['opportunities-search'],
    queryFn: () => opportunityService.list({}),
    enabled: open,
  })

  const recent = useMemo(() => {
    if (query.trim()) return []
    const paths: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return paths.map((p) => PAGES.find((pg) => pg.to === p)).filter(Boolean) as typeof PAGES
  }, [open, query])

  const pageResults = useMemo(() => {
    const q = query.toLowerCase()
    return PAGES.filter((p) => p.label.toLowerCase().includes(q))
  }, [query])

  const actionResults = useMemo(() => {
    const actions = [
      { label: mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: Sun, run: () => setMode(mode === 'dark' ? 'light' : 'dark') },
      { label: 'Log out', icon: LogOut, run: () => { logout(); navigate('/login') } },
    ]
    const q = query.toLowerCase()
    return actions.filter((a) => a.label.toLowerCase().includes(q))
  }, [query, mode])

  const opportunityResults = useMemo(() => {
    if (!query.trim() || !data) return []
    const q = query.toLowerCase()
    return data.items.filter((o) => o.title.toLowerCase().includes(q) || o.organization.toLowerCase().includes(q)).slice(0, 5)
  }, [query, data])

  type Flat = { key: string; label: string; sub?: string; run: () => void }
  const flat: Flat[] = useMemo(() => [
    ...recent.map((p) => ({ key: `recent-${p.to}`, label: p.label, run: () => go(p.to) })),
    ...pageResults.map((p) => ({ key: `page-${p.to}`, label: p.label, run: () => go(p.to) })),
    ...actionResults.map((a) => ({ key: `action-${a.label}`, label: a.label, run: () => { a.run(); onClose() } })),
    ...opportunityResults.map((o) => ({ key: `opp-${o.id}`, label: o.title, sub: o.organization, run: () => go(`/opportunities/${o.id}`) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [recent, pageResults, actionResults, opportunityResults])

  function go(to: string) { navigate(to); onClose() }

  useEffect(() => { if (!open) { setQuery(''); setActiveIndex(0) } }, [open])
  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flat.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') { e.preventDefault(); flat[activeIndex]?.run() }
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, flat, activeIndex])

  if (!open) return null

  let cursor = -1
  const withCursor = <T,>(items: T[], render: (item: T, isActive: boolean) => React.ReactNode) =>
    items.map((item) => { cursor += 1; return render(item, cursor === activeIndex) })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl surface-elevated overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Search size={16} className="text-muted" />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NIRMAAN…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded surface text-muted">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {recent.length > 0 && (
            <Section label="Recent">
              {withCursor(recent, (p, active) => (
                <Row key={p.to} icon={p.icon} label={p.label} active={active} onClick={() => go(p.to)} />
              ))}
            </Section>
          )}
          {pageResults.length > 0 && (
            <Section label="Pages">
              {withCursor(pageResults, (p, active) => (
                <Row key={p.to} icon={p.icon} label={p.label} active={active} onClick={() => go(p.to)} />
              ))}
            </Section>
          )}
          {actionResults.length > 0 && (
            <Section label="Actions">
              {withCursor(actionResults, (a, active) => (
                <Row key={a.label} icon={a.icon} label={a.label} active={active} onClick={() => { a.run(); onClose() }} />
              ))}
            </Section>
          )}
          {opportunityResults.length > 0 && (
            <Section label="Opportunities">
              {withCursor(opportunityResults, (o, active) => (
                <Row key={o.id} label={o.title} sub={`${o.organization} · ${o.domain}`} active={active} onClick={() => go(`/opportunities/${o.id}`)} />
              ))}
            </Section>
          )}
          {query.trim() && pageResults.length === 0 && actionResults.length === 0 && opportunityResults.length === 0 && (
            <p className="text-xs text-muted px-4 py-6 text-center">No matches for "{query}"</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 mt-1 first:mt-0">
      <p className="text-[10px] uppercase tracking-wide text-muted px-2 py-1">{label}</p>
      {children}
    </div>
  )
}

function Row({ icon: Icon, label, sub, active, onClick }: {
  icon?: typeof Search; label: string; sub?: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left"
      style={{ background: active ? 'color-mix(in srgb, var(--color-accent-500) 10%, transparent)' : undefined }}
    >
      {Icon && <Icon size={15} className="text-muted shrink-0" />}
      <span className="flex flex-col items-start min-w-0">
        <span className="truncate w-full">{label}</span>
        {sub && <span className="text-[11px] text-muted truncate w-full">{sub}</span>}
      </span>
    </button>
  )
}
