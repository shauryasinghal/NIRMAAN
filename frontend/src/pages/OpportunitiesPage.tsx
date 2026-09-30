import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Compass, Scale, X } from 'lucide-react'
import { opportunityService } from '../lib/services'
import { OpportunityCard } from '../components/opportunities/OpportunityCard'
import { SkeletonCard, EmptyState } from '../components/ui/primitives'
import { Button } from '../components/ui/Button'
import type { RecommendedOpportunity } from '../types'

type SortKey = 'match' | 'deadline'

export function OpportunitiesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['recommend', 50], queryFn: () => opportunityService.recommend(50) })
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const query = params.get('q') || ''
  const domain = params.get('domain') || 'all'
  const category = params.get('category') || 'all'
  const sort = (params.get('sort') as SortKey) || 'match'

  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const items = data?.items ?? []
  const domains = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.domain)))], [items])
  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))] as string[], [items])

  const filtered = useMemo(() => {
    let out = items.filter((o) =>
      (domain === 'all' || o.domain === domain) &&
      (category === 'all' || o.category === category) &&
      (o.title.toLowerCase().includes(query.toLowerCase()) || o.organization.toLowerCase().includes(query.toLowerCase())),
    )
    out = [...out].sort((a: RecommendedOpportunity, b: RecommendedOpportunity) =>
      sort === 'match' ? b.fitScore - a.fitScore : (a.deadline || '').localeCompare(b.deadline || ''),
    )
    return out
  }, [items, query, domain, category, sort])

  const toggleCompare = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev))
  }

  return (
    <div className="pb-16">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Discover opportunities built for you.</h1>
        <Button
          size="sm" variant={compareMode ? 'primary' : 'secondary'}
          onClick={() => { setCompareMode((c) => !c); setSelected([]) }}
        >
          <Scale size={14} /> {compareMode ? 'Cancel compare' : 'Compare'}
        </Button>
      </div>
      <p className="text-muted text-sm mb-6">
        {compareMode ? 'Select 2–4 opportunities to compare side by side.' : 'Ranked by content-based fit to your profile — not recency.'}
      </p>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query} onChange={(e) => setParam('q', e.target.value)} placeholder="Search title or organization…"
            className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm bg-transparent focus-ring" style={{ borderColor: 'var(--border)' }}
          />
        </div>
        <select value={category} onChange={(e) => setParam('category', e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-transparent" style={{ borderColor: 'var(--border)' }}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
        </select>
        <select value={domain} onChange={(e) => setParam('domain', e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-transparent" style={{ borderColor: 'var(--border)' }}>
          {domains.map((d) => <option key={d} value={d}>{d === 'all' ? 'All domains' : d}</option>)}
        </select>
        <select value={sort} onChange={(e) => setParam('sort', e.target.value)} className="rounded-lg border px-3 py-2 text-sm bg-transparent" style={{ borderColor: 'var(--border)' }}>
          <option value="match">Sort: Best match</option>
          <option value="deadline">Sort: Deadline</option>
        </select>
      </div>

      {isLoading && <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {!isLoading && filtered.length === 0 && (
        <EmptyState icon={Compass} title="No opportunities found" description="Try a different search term or filter." />
      )}
      {!isLoading && (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OpportunityCard key={o.id} opp={o} compareMode={compareMode} selected={selected.includes(o.id)} onToggleCompare={toggleCompare} />
          ))}
        </div>
      )}

      {compareMode && selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 surface-elevated rounded-full px-4 py-2.5">
          <span className="text-sm">{selected.length} selected</span>
          <Button size="sm" disabled={selected.length < 2} onClick={() => navigate(`/compare?ids=${selected.join(',')}`)}>
            Compare
          </Button>
          <button onClick={() => setSelected([])} className="text-muted" aria-label="Clear selection"><X size={16} /></button>
        </div>
      )}
    </div>
  )
}
