import { Input } from '../ui/Input'
import { CheckboxGroup, Select, Toggle } from '../ui/kit'
import type { Facets, OpportunityFilters } from '../../types'

type ListKey = 'category' | 'domain' | 'skill' | 'difficulty' | 'format' | 'participation' | 'workMode' | 'freshness'
const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function FilterPanel({ filters, facets, onChange }: { filters: OpportunityFilters; facets?: Facets; onChange: (f: OpportunityFilters) => void }) {
  const set = (patch: Partial<OpportunityFilters>) => onChange({ ...filters, ...patch, page: 1 })
  const group = (legend: string, key: ListKey, options: { value: string; label?: string; count?: number }[] | undefined, max = 8) => (
    <CheckboxGroup legend={legend} options={options ?? []} selected={filters[key]} onToggle={(v) => set({ [key]: toggle(filters[key], v) } as Partial<OpportunityFilters>)} max={max} />
  )
  return (
    <form className="text-sm" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
      {group('Category', 'category', facets?.category)}
      {group('Domain', 'domain', facets?.domain.map((d) => ({ value: d.value, label: d.label ?? d.value, count: d.count })))}
      {group('Difficulty', 'difficulty', facets?.difficulty)}
      {group('Format', 'format', facets?.format)}
      {group('Work mode', 'workMode', facets?.workMode)}
      {group('Participation', 'participation', facets?.participation)}
      {group('Skills', 'skill', facets?.skills, 10)}
      <div className="grid gap-3 mb-5">
        <Select label="Team size" value={filters.teamSize ?? ''} onChange={(e) => set({ teamSize: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any</option>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 1 ? 'Solo' : `Team of ${n}`}</option>)}</Select>
        <Select label="Closes within" value={filters.deadlineWithin ?? ''} onChange={(e) => set({ deadlineWithin: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any time</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></Select>
        <Select label="Minimum fit" value={filters.minFit ?? ''} onChange={(e) => set({ minFit: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Any fit</option><option value="40">40%+</option><option value="60">60%+</option><option value="75">75%+</option><option value="90">90%+</option></Select>
        <DebouncedText label="Location" value={filters.location ?? ''} onCommit={(v) => set({ location: v || undefined })} placeholder="City or region" />
        <DebouncedText label="Eligibility" value={filters.eligibility ?? ''} onCommit={(v) => set({ eligibility: v || undefined })} placeholder="e.g. undergraduate" />
      </div>
      {facets && group('Freshness', 'freshness', facets.freshness)}
      <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Toggle checked={!!filters.verified} onChange={(v) => set({ verified: v || undefined })} label="Verified sources only" description={facets ? `${facets.verified} match right now` : undefined} />
        <Toggle checked={!!filters.includeExpired} onChange={(v) => set({ includeExpired: v || undefined })} label="Include closed" />
      </div>
    </form>
  )
}

import { useEffect, useState } from 'react'
function DebouncedText({ label, value, onCommit, placeholder }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  useEffect(() => { if (v === value) return; const t = setTimeout(() => onCommit(v.trim()), 400); return () => clearTimeout(t) }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Input label={label} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
}
