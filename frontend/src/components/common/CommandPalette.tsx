import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, LayoutDashboard, Compass, Users, ShieldCheck, History, User, Settings, Sun, LogOut, Bookmark, ClipboardList, Activity, Bell, Building2, CornerDownLeft, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { opportunityService } from '../../lib/services'
import { EMPTY_FILTERS } from '../../lib/filters'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { Dialog } from '../ui/kit'

const PAGES: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'Opportunities', to: '/opportunities', icon: Compass },
  { label: 'Organizations', to: '/organizations', icon: Building2 }, { label: 'Saved opportunities', to: '/saved', icon: Bookmark },
  { label: 'Team Builder', to: '/team-builder', icon: Users }, { label: 'Originality checker', to: '/originality', icon: ShieldCheck },
  { label: 'Idea history', to: '/originality/history', icon: History }, { label: 'My applications', to: '/applications', icon: ClipboardList },
  { label: 'Smart alerts', to: '/smart-alerts', icon: Bell }, { label: 'Activity', to: '/activity', icon: Activity },
  { label: 'Notifications', to: '/notifications', icon: Bell }, { label: 'Profile', to: '/profile', icon: User }, { label: 'Settings', to: '/settings', icon: Settings },
]
const RECENT_KEY = 'nirmaan_recent_pages'
export function recordRecentPage(pathname: string) {
  if (!PAGES.some((p) => p.to === pathname)) return
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    localStorage.setItem(RECENT_KEY, JSON.stringify([pathname, ...existing.filter((p) => p !== pathname)].slice(0, 3)))
  } catch { /* storage unavailable */ }
}

type Item = { key: string; label: string; hint?: string; icon: LucideIcon; run: () => void; group: string }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { mode, setMode } = useTheme()
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 200); return () => clearTimeout(t) }, [query])
  useEffect(() => { if (!open) { setQuery(''); setActive(0) } }, [open])

  const search = useQuery({ queryKey: ['palette-search', debounced], queryFn: () => opportunityService.search({ ...EMPTY_FILTERS, q: debounced }, 5), enabled: open && debounced.length >= 2, staleTime: 15_000 })

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => { onClose(); navigate(to) }
    const q = query.trim().toLowerCase()
    let recent: string[] = []
    try { recent = q ? [] : JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { /* ignore */ }
    const pages: Item[] = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({ key: p.to, label: p.label, icon: p.icon, run: go(p.to), group: recent.includes(p.to) ? 'Recent' : 'Pages' }))
    pages.sort((a, b) => (a.group === 'Recent' ? -1 : 0) - (b.group === 'Recent' ? -1 : 0))
    const opps: Item[] = (search.data?.items ?? []).map((o) => ({ key: `o:${o.id}`, label: o.title, hint: o.organization, icon: Compass, run: go(`/opportunities/${o.id}`), group: 'Opportunities' }))
    const actions: Item[] = [
      { key: 'a:theme', label: `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`, icon: Sun, run: () => { setMode(mode === 'dark' ? 'light' : 'dark'); onClose() }, group: 'Actions' },
      { key: 'a:out', label: 'Log out', icon: LogOut, run: () => { onClose(); void signOut().then(() => navigate('/login')) }, group: 'Actions' },
    ].filter((a) => !q || a.label.toLowerCase().includes(q))
    return [...opps, ...pages, ...actions]
  }, [query, search.data, mode, navigate, onClose, setMode, signOut])

  useEffect(() => { setActive(0) }, [items.length, debounced])
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run() }
  }

  let lastGroup = ''
  return (
    <Dialog open={open} onClose={onClose} title="Search NIRMAAN" description="Jump to a page, an opportunity or an action.">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active] ? `pal-${items[active].key}` : undefined} aria-label="Search"
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search opportunities, pages, actions…"
          className="w-full rounded-lg border bg-transparent pl-9 pr-3 py-2.5 text-sm focus-ring" style={{ borderColor: 'var(--border)' }} />
      </div>
      <ul id="palette-list" ref={listRef} role="listbox" className="mt-3 max-h-[50vh] overflow-y-auto -mx-1">
        {search.isFetching && debounced.length >= 2 && <li className="px-3 py-2 text-xs text-muted" role="status">Searching…</li>}
        {items.length === 0 && !search.isFetching && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? <li key={`h-${it.group}`} role="presentation" className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted">{it.group}</li> : null
          lastGroup = it.group
          return (<span key={it.key} className="contents">{header}
            <li id={`pal-${it.key}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={it.run}
              className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm min-h-[40px]', i === active ? 'bg-accent-500/10 text-accent-500' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]')}>
              <it.icon size={15} aria-hidden /><span className="flex-1 min-w-0 truncate">{it.label}</span>{it.hint && <span className="text-xs text-muted truncate max-w-[40%]">{it.hint}</span>}
              {i === active && <CornerDownLeft size={12} aria-hidden />}
            </li></span>)
        })}
      </ul>
    </Dialog>
  )
}
