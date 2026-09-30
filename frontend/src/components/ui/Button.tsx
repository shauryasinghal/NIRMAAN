import { type ButtonHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-white dark:text-navy-900 dark:hover:bg-white/90',
  secondary: 'surface hover:bg-black/[0.03] dark:hover:bg-white/[0.06] text-[var(--text)]',
  ghost: 'text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
  danger: 'bg-danger-500 text-white hover:opacity-90',
}
const sizeClasses: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-lg',
  lg: 'text-sm px-5 py-3 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'font-medium transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
