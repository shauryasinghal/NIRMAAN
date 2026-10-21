import { useRef } from 'react'
import clsx from 'clsx'

interface Option<T extends string> { id: T; label: string }

/** A segmented switch following the WAI-ARIA radio-group pattern: one tab stop (the selected option), arrow keys / Home / End move
 *  and select, Space/Enter on a focused option selects it. Native `Tabs` in the kit is an underline tablist bound to panels, which this is not. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const go = (i: number) => { const o = options[(i + options.length) % options.length]; onChange(o.id); refs.current[o.id]?.focus() }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const keys: Record<string, number | undefined> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }
    if (keys[e.key] === undefined) return
    e.preventDefault(); go(keys[e.key]!)
  }
  return (
    <div role="radiogroup" aria-label={label} className={clsx('inline-flex gap-1 rounded-xl p-1 surface', className)}>
      {options.map((o, i) => {
        const on = value === o.id
        return (
          <button key={o.id} ref={(el) => { refs.current[o.id] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)} onKeyDown={(e) => onKey(e, i)}
            className={clsx('px-4 py-2 text-sm rounded-lg font-medium transition-colors focus-ring whitespace-nowrap',
              on ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'text-muted hover:text-[var(--text)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]')}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
