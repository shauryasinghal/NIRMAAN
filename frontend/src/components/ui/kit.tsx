import { useEffect, useId, useRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, FlaskConical, X } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from './primitives'
import { fitTone, skillLabel } from '../../lib/format'

// ── Page scaffolding ─────────────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function Section({ title, hint, action, children, className }: { title?: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('mb-8', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <div><h2 className="text-sm font-semibold tracking-tight">{title}</h2>{hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, hint, to }: { label: string; value: ReactNode; hint?: string; to?: string }) {
  const inner = (
    <div className="surface-interactive rounded-xl p-4 h-full">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {hint && <div className="text-[11px] text-muted mt-2">{hint}</div>}
    </div>
  )
  return to ? <a href={to} className="block focus-ring rounded-xl">{inner}</a> : inner
}

// ── Badges ───────────────────────────────────────────────────────────────────────────────────
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span title="Sample data for development and demos — not a live, verified posting" className={clsx('inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted', className)} style={{ borderColor: 'var(--border-strong)' }}>
      <FlaskConical size={10} aria-hidden /> Demo data
    </span>
  )
}

export function FitBadge({ score, confidence, size = 'md' }: { score: number; confidence?: 'high' | 'medium' | 'low'; size?: 'sm' | 'md' }) {
  const tone = fitTone(score)
  const colors = { success: 'text-success-500 bg-success-500/10', warning: 'text-warning-500 bg-warning-500/10', danger: 'text-danger-500 bg-danger-500/10' }[tone]
  return (
    <span className={clsx('inline-flex flex-col items-center rounded-lg px-2.5 py-1 leading-none', colors, size === 'sm' && 'px-2 py-0.5')} title={confidence === 'low' ? 'Low confidence: several inputs are unknown' : `Fit score (${confidence ?? 'n/a'} confidence)`}>
      <span className={clsx('font-semibold tabular-nums', size === 'sm' ? 'text-sm' : 'text-lg')}>{Math.round(score)}%</span>
      <span className="text-[10px] font-medium uppercase tracking-wide mt-0.5">{confidence === 'low' ? 'low conf.' : 'fit'}</span>
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone = ['selected'].includes(status) ? 'success' : ['rejected', 'withdrawn'].includes(status) ? 'danger' : ['applied', 'shortlisted', 'interview'].includes(status) ? 'accent' : 'neutral'
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>
}

// ── Form controls ────────────────────────────────────────────────────────────────────────────
export function Select({ label, error, className, children, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  const auto = useId(); const rid = id ?? auto
  return (
    <div className="w-full">
      {label && <label htmlFor={rid} className="block text-xs font-medium text-muted mb-1.5">{label}</label>}
      <select id={rid} className={clsx('w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm focus-ring', error ? 'border-danger-500' : 'border-[var(--border)]', className)} {...rest}>{children}</select>
      {error && <p className="text-xs text-danger-500 mt-1" role="alert">{error}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer"><span className="text-sm font-medium block">{label}</span>{description && <span className="text-xs text-muted block mt-0.5">{description}</span>}</label>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring disabled:opacity-50', checked ? 'bg-accent-500' : 'bg-black/20 dark:bg-white/20')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  )
}

export function CheckboxGroup({ legend, options, selected, onToggle, max = 8 }: { legend: string; options: { value: string; label?: string; count?: number }[]; selected: string[]; onToggle: (v: string) => void; max?: number }) {
  if (!options.length && !selected.length) return null
  const merged = [...options]; selected.forEach((s) => { if (!merged.some((o) => o.value === s)) merged.push({ value: s, count: 0 }) })
  return (
    <fieldset className="mb-5">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{legend}</legend>
      <div className="space-y-1">
        {merged.slice(0, max).map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer py-1 min-h-[28px]">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} className="h-4 w-4 rounded accent-[var(--color-accent-500)]" />
            <span className="flex-1 min-w-0 truncate">{skillLabel(o.label ?? o.value.replace(/_/g, ' '))}</span>
            {o.count !== undefined && <span className="text-[11px] text-muted tabular-nums">{o.count}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-6">
      <button className="p-2 rounded-lg surface-interactive disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          <button onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={clsx('min-w-9 h-9 px-2 rounded-lg text-sm tabular-nums focus-ring', n === page ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08]')}>{n}</button>
        </span>
      ))}
      <button className="p-2 rounded-lg surface-interactive disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
    </nav>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.id); refs.current[next.id]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el }} role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
          className={clsx('px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px focus-ring', value === t.id ? 'border-accent-500 font-medium' : 'border-transparent text-muted hover:text-[var(--text)]')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] text-muted tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Dialog: labelled, focus-trapped, Escape/backdrop close, focus restored ──────────────────────
export function Dialog({ open, onClose, title, description, children, footer, wide, size }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  const sz = size ?? (wide ? 'lg' : 'md')
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId(); const descId = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])
    // Land on the field the user came to type in (explicit data-autofocus, else the first form control); otherwise the first control.
    const field = ref.current?.querySelector<HTMLElement>('[data-autofocus], .dialog-body input:not([type="checkbox"]):not([type="radio"]), .dialog-body textarea, .dialog-body select')
    ;(field ?? focusables()[0] ?? ref.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables(); if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className={clsx('relative w-full rounded-t-2xl sm:rounded-2xl surface-elevated flex flex-col outline-none min-w-0',
          sz === 'xl' ? 'max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)] sm:max-w-[min(900px,calc(100vw-3rem))]' : 'max-h-[92vh]', sz === 'lg' && 'sm:max-w-2xl', sz === 'md' && 'sm:max-w-md')}>
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="min-w-0"><h2 id={titleId} className="text-base font-semibold">{title}</h2>{description && <p id={descId} className="text-xs text-muted mt-1">{description}</p>}</div>
          <button onClick={onClose} className="p-1.5 -m-1.5 rounded-lg text-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.08] focus-ring" aria-label="Close dialog"><X size={16} /></button>
        </div>
        {/* Bottom padding lives on an inner wrapper, not the scroll container: a sticky footer inside can then sit flush with the dialog edge instead of 20px above it. */}
        <div className="dialog-body min-h-0 min-w-0 px-5 overflow-y-auto overscroll-contain"><div className="pb-5">{children}</div></div>
        {footer && <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>{footer}</div>}
      </div>
    </div>, document.body)
}

export function Notice({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'accent'; title?: ReactNode; children: ReactNode }) {
  const c = { neutral: 'border-[var(--border)]', warning: 'border-warning-500/40 bg-warning-500/5', danger: 'border-danger-500/40 bg-danger-500/5', success: 'border-success-500/40 bg-success-500/5', accent: 'border-accent-500/30 bg-accent-500/5' }[tone]
  return <div role={tone === 'danger' ? 'alert' : 'note'} className={clsx('rounded-lg border p-3 text-sm', c)}>{title && <p className="font-medium mb-0.5">{title}</p>}<div className="text-muted text-[13px] leading-relaxed">{children}</div></div>
}

export function Meter({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="text-muted tabular-nums">{value === null ? 'unknown' : `${Math.round(value * 100)}%`}</span></div>
      <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={value === null ? undefined : Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        {value !== null && <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, background: tone ?? (value >= 0.7 ? 'var(--color-success-500)' : value >= 0.4 ? 'var(--color-warning-500)' : 'var(--color-danger-500)') }} />}
      </div>
    </div>
  )
}
