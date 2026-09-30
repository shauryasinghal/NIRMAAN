import { useState } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

export function ChipSelector({
  options, selected, onChange, allowCustom = true, placeholder = 'Search or add…',
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  allowCustom?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const filtered = options.filter(
    (o) => o.toLowerCase().includes(query.toLowerCase()) && !selected.includes(o),
  )

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  const addCustom = () => {
    const v = query.trim().toLowerCase()
    if (v && !selected.includes(v)) onChange([...selected, v])
    setQuery('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {selected.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 pill bg-accent-500/10 text-accent-500 rounded-full px-3 py-1 text-xs capitalize">
            {s}
            <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        {selected.length === 0 && <span className="text-xs text-muted">Nothing selected yet</span>}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && allowCustom) { e.preventDefault(); addCustom() } }}
          placeholder={placeholder}
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-ring"
          style={{ borderColor: 'var(--border)' }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {filtered.slice(0, 14).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={clsx('text-xs px-3 py-1.5 rounded-full border capitalize transition-colors', 'hover:border-accent-500 hover:text-accent-500')}
            style={{ borderColor: 'var(--border)' }}
          >
            {opt}
          </button>
        ))}
        {allowCustom && query.trim() && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase()) && (
          <button type="button" onClick={addCustom} className="text-xs px-3 py-1.5 rounded-full border border-dashed text-accent-500" style={{ borderColor: 'var(--color-accent-500)' }}>
            Add "{query.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
