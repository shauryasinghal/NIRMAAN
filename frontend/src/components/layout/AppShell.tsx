import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Compass, Users, ShieldCheck, History, User, Settings, LogOut,
  ClipboardList, ChevronsLeft, ChevronsRight, Search, ChevronDown, Sun, Moon, Bookmark, Activity, Bell, Building2, Menu, ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Dialog } from '../ui/kit'
import { useTheme } from '../../context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { notificationService } from '../../lib/services'
import { CommandPalette, recordRecentPage } from '../common/CommandPalette'
import { NirmaanMark } from '../common/NirmaanMark'
import clsx from 'clsx'

const NAV_SECTIONS = [
  { label: 'Overview', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/opportunities', label: 'Opportunities', icon: Compass },
    { to: '/organizations', label: 'Organizations', icon: Building2 },
    { to: '/saved', label: 'Saved', icon: Bookmark },
  ]},
  { label: 'Build', items: [
    { to: '/team-builder', label: 'Team Builder', icon: Users },
  ]},
  { label: 'Validate', items: [
    { to: '/originality', label: 'Originality', icon: ShieldCheck },
    { to: '/originality/history', label: 'History', icon: History },
  ]},
  { label: 'Track', items: [
    { to: '/applications', label: 'Applications', icon: ClipboardList },
    { to: '/smart-alerts', label: 'Smart Alerts', icon: Bell },
    { to: '/activity', label: 'Activity', icon: Activity },
  ]},
]
const workspaceNav = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]
const reviewerSection = { label: 'Review', items: [{ to: '/review', label: 'Review Queue', icon: ClipboardList }] }
const adminSection = { label: 'Admin', items: [{ to: '/admin', label: 'Admin', icon: ShieldAlert }] }

export function AppShell({ children }: { children: ReactNode }) {
  const { me, role, signOut } = useAuth()
  const { mode, setMode } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const sections = [...NAV_SECTIONS, ...(role === 'reviewer' || role === 'admin' ? [reviewerSection] : []), ...(role === 'admin' ? [adminSection] : [])]
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = (me?.fullName || me?.email || '?').trim().charAt(0).toUpperCase()
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : ''
  const allFlatItems = sections.flatMap((s) => s.items)

  const handleLogout = async () => { await signOut(); navigate('/login') }
  const toggleTheme = () => setMode(mode === 'dark' ? 'light' : 'dark')
  const { data: unreadData } = useQuery({ queryKey: ['notifications', 'unread'], queryFn: notificationService.unreadCount, refetchInterval: 30_000 })
  const unreadCount = unreadData?.unread ?? 0

  useEffect(() => {
    recordRecentPage(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const NavItem = ({ to, label, icon: Icon }: { to: string; label: string; icon: typeof LayoutDashboard }) => (
    <NavLink to={to} className="group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active-pill"
              className="absolute inset-0 rounded-lg bg-white/10"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className={clsx('relative z-10 flex items-center gap-3', isActive ? 'text-white' : 'text-white/60 group-hover:text-white/90')}>
            <Icon size={16} />
            {!collapsed && label}
          </span>
          {collapsed && (
            <span className="absolute left-full ml-2 whitespace-nowrap px-2 py-1 rounded-md text-xs bg-navy-800 text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-white focus:text-navy-900 focus:shadow">Skip to content</a>
      <aside
        className={clsx(
          'shrink-0 hidden md:flex md:flex-col p-4 bg-navy-900 transition-[width] duration-200',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      >
        <div className="mb-6 flex items-center justify-between px-1">
          {!collapsed && (
            <div className="flex items-center gap-2 text-white">
              <NirmaanMark size={18} />
              <div>
                <div className="text-sm font-semibold tracking-tight leading-none">NIRMAAN</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/40 hover:text-white p-1 rounded-md hover:bg-white/5"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.label}>
              {!collapsed && <p className="text-[10px] uppercase tracking-wider text-white/55 px-3 mb-1.5">{section.label}</p>}
              <div className="space-y-1">
                {section.items.map((item) => <NavItem key={item.to} {...item} />)}
              </div>
            </div>
          ))}
          <div>
            {!collapsed && <p className="text-[10px] uppercase tracking-wider text-white/55 px-3 mb-1.5">Workspace</p>}
            <div className="space-y-1">
              {workspaceNav.map((item) => <NavItem key={item.to} {...item} />)}
            </div>
          </div>
        </nav>

        <button
          onClick={handleLogout}
          className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5', collapsed && 'justify-center')}
        >
          <LogOut size={16} /> {!collapsed && 'Log out'}
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top command bar (desktop) */}
        <header className="hidden md:flex items-center justify-between gap-3 px-8 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted surface-interactive w-72"
          >
            <Search size={14} />
            <span className="flex-1 text-left">Search NIRMAAN…</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08]">⌘K</kbd>
          </button>
          <div className="flex items-center gap-1.5">
            <NavLink to="/notifications" className="relative p-2 rounded-lg text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Notifications">
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-danger-500" />
              )}
            </NavLink>
            <button onClick={toggleTheme} className="p-2 rounded-lg text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Toggle theme">
              {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                <span className="h-6 w-6 rounded-full bg-accent-600 text-white text-[11px] flex items-center justify-center">
                  {initial}
                </span>
                <span className="text-muted max-w-[140px] truncate">{me?.fullName || roleLabel}</span>
                <ChevronDown size={13} className="text-muted" />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg surface-elevated py-1 text-sm z-30" onMouseLeave={() => setProfileMenuOpen(false)}>
                  <div className="px-3 py-1.5 text-xs text-muted border-b mb-1 truncate" style={{ borderColor: 'var(--border)' }}>{me?.email}<span className="ml-1.5 uppercase tracking-wide">· {roleLabel}</span></div>
                  <NavLink to="/profile" className="block px-3 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Profile</NavLink>
                  <NavLink to="/settings" className="block px-3 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Settings</NavLink>
                  <button onClick={handleLogout} className="block w-full text-left px-3 py-1.5 text-danger-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 surface border-b sticky top-0 z-20" style={{ borderColor: 'var(--border)' }}>
          <span className="font-semibold flex items-center gap-2"><NirmaanMark size={16} /> NIRMAAN</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPaletteOpen(true)} className="p-1.5 rounded-lg text-muted"><Search size={16} /></button>
            <NavLink to="/notifications" className="relative p-1.5 rounded-lg text-muted" aria-label="Notifications">
              <Bell size={16} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-danger-500" />}
            </NavLink>
            <button onClick={toggleTheme} className="p-1.5 rounded-lg text-muted" aria-label="Toggle theme">
              {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="relative">
              <button onClick={() => setProfileMenuOpen((o) => !o)} className="h-7 w-7 rounded-full bg-accent-600 text-white text-xs flex items-center justify-center">
                {initial}
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 rounded-lg surface-elevated py-1 text-sm z-30">
                  <NavLink to="/profile" className="block px-3 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Profile</NavLink>
                  <NavLink to="/settings" className="block px-3 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Settings</NavLink>
                  <button onClick={handleLogout} className="block w-full text-left px-3 py-1.5 text-danger-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 pb-24 md:pb-8 outline-none">
          <div className="max-w-6xl mx-auto w-full px-4 sm:px-5 md:px-8 pt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <nav aria-label="Primary" className="md:hidden fixed bottom-0 left-0 right-0 surface flex justify-around py-1 z-20 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {[allFlatItems[0], allFlatItems[1], allFlatItems[3], allFlatItems.find((i) => i.to === '/applications')!].map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 text-[10px] px-2 py-1 min-h-[48px] min-w-[56px] justify-center focus-ring', isActive ? 'text-accent-500' : 'text-muted')}>
            <Icon size={18} aria-hidden /> {label}
          </NavLink>
        ))}
        <button onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 text-[10px] px-2 py-1 min-h-[48px] min-w-[56px] justify-center text-muted focus-ring" aria-haspopup="dialog">
          <Menu size={18} aria-hidden /> Menu
        </button>
      </nav>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav aria-label="All pages" className="space-y-4">
          {[...sections, { label: 'Workspace', items: workspaceNav }].map((sec) => (
            <div key={sec.label}>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{sec.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {sec.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => clsx('flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm min-h-[44px] focus-ring', isActive ? 'bg-accent-500/10 text-accent-500' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08]')}>
                    <Icon size={16} aria-hidden /> {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => { setMenuOpen(false); void handleLogout() }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-danger-500 hover:bg-danger-500/10 min-h-[44px] focus-ring"><LogOut size={16} aria-hidden /> Log out</button>
        </nav>
      </Dialog>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
