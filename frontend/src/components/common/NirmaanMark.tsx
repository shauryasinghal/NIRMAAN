export function NirmaanMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 17V7l10 10V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function NirmaanLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ''}`}>
      <NirmaanMark />
      NIRMAAN
    </span>
  )
}
