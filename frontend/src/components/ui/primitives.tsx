import clsx from 'clsx'

// ---- Badge ----
type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent'
const badgeTones: Record<BadgeTone, string> = {
  success: 'bg-success-500/10 text-success-500',
  warning: 'bg-warning-500/10 text-warning-500',
  danger: 'bg-danger-500/10 text-danger-500',
  neutral: 'bg-black/[0.04] dark:bg-white/[0.08] text-muted',
  accent: 'bg-accent-500/10 text-accent-500',
}
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium', badgeTones[tone])}>
      {children}
    </span>
  )
}

// ---- ScoreRing ----
export function ScoreRing({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference
  const color = value >= 65 ? 'var(--color-success-500)' : value >= 35 ? 'var(--color-warning-500)' : 'var(--color-danger-500)'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="ring"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold">{Math.round(value)}</span>
        {label && <span className="text-[10px] text-muted">{label}</span>}
      </div>
    </div>
  )
}

// ---- CoverageBar ----
export function CoverageBar({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 80 ? 'var(--color-success-500)' : percent >= 40 ? 'var(--color-warning-500)' : 'var(--color-danger-500)'
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="capitalize">{label}</span>
        <span className="text-muted">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  )
}

// ---- Skeletons ----
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-black/[0.06] dark:bg-white/[0.08]', className)} />
}
export function SkeletonCard() {
  return (
    <div className="surface rounded-xl p-4 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

// ---- EmptyState ----
export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {Icon && <Icon size={28} className="text-muted mb-3" />}
      <p className="font-medium text-sm">{title}</p>
      {description && <p className="text-xs text-muted mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---- ErrorState ----
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="h-9 w-9 rounded-full flex items-center justify-center mb-3 bg-danger-500/10 text-danger-500 text-lg">!</div>
      <p className="font-medium text-sm">Something went wrong</p>
      <p className="text-xs text-muted mt-1 max-w-xs">{message || "We couldn't complete that request."}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-xs font-medium px-3 py-1.5 rounded-lg surface-interactive">
          Retry
        </button>
      )}
    </div>
  )
}

// ---- ProcessingState — tied to real pending mutation state, never a fake timer ----
export function ProcessingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted py-2">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500" />
      </span>
      {label}
    </div>
  )
}
