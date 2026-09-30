import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Compass, GitCompare, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/primitives'
import { Dialog, Notice, PageHeader, Pagination, Select } from '../components/ui/kit'
import { OpportunityCard } from '../components/opportunities/OpportunityCard'
import { FilterPanel } from '../components/opportunities/FilterPanel'
import { opportunityService } from '../lib/services'
import { EMPTY_FILTERS, activeChips, filtersFromParams, filtersToParams } from '../lib/filters'
import type { OpportunityFilters } from '../types'

const PAGE_SIZE = 12

export function OpportunitiesPage() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const urlFilters = useMemo(() => filtersFromParams(sp), [sp])
  // Optimistic copy: controls respond instantly while the URL (the source of truth) catches up asynchronously.
  const [filters, setLocal] = useState<OpportunityFilters>(urlFilters)
  useEffect(() => setLocal(urlFilters), [urlFilters])
  const [q, setQ] = useState(urlFilters.q ?? '')
  const [sheet, setSheet] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const setFilters = (f: OpportunityFilters) => { setLocal(f); setSp(filtersToParams(f), { replace: true }) }

  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  useEffect(() => { if (q.trim() === (filters.q ?? '')) return; const t = setTimeout(() => setFilters({ ...filters, q: q.trim() || undefined, page: 1, sort: filters.sort === 'relevance' || q.trim() ? filters.sort : filters.sort }), 350); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = useQuery({ queryKey: ['opportunities', sp.toString()], queryFn: () => opportunityService.search(filters, PAGE_SIZE), placeholderData: keepPreviousData })
  const facets = useQuery({ queryKey: ['facets', filtersToParams({ ...filters, page: 1, sort: 'relevance' }).toString()], queryFn: () => opportunityService.facets(filters), placeholderData: keepPreviousData })
  const chips = activeChips(filters)
  const d = results.data
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p))

  return (
    <div>
      <PageHeader title="Discover opportunities" subtitle="Search and filter the catalog. Every card shows how well it fits you, and why." />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" aria-label="Search opportunities" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, organization, skill or tag…"
            className="w-full rounded-lg border bg-[var(--surface)] pl-9 pr-3 py-2.5 text-sm focus-ring" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div className="w-44"><Select aria-label="Sort by" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as OpportunityFilters['sort'], page: 1 })}>
          <option value="relevance">{filters.q ? 'Most relevant' : 'Newest first'}</option><option value="fit">Best fit for me</option><option value="deadline">Closing soonest</option><option value="newest">Recently added</option></Select></div>
        <Button variant="secondary" className="lg:hidden" onClick={() => setSheet(true)}><SlidersHorizontal size={15} /> Filters{chips.length ? ` (${chips.length})` : ''}</Button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Active filters">
          {chips.map((c) => (
            <button key={c.key} onClick={() => setFilters(c.remove(filters))} className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 text-accent-500 pl-3 pr-2 py-1 text-xs focus-ring" aria-label={`Remove filter ${c.label}`}>{c.label}<X size={12} /></button>
          ))}
          <button onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} className="text-xs text-muted underline focus-ring rounded">Clear all</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-8">
        <aside className="hidden lg:block sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-2" aria-label="Filters"><FilterPanel filters={filters} facets={facets.data} onChange={setFilters} /></aside>

        <div className="min-w-0">
          <p className="text-sm text-muted mb-3" role="status" aria-live="polite">
            {results.isLoading ? 'Searching…' : d ? `${d.total.toLocaleString()} ${d.total === 1 ? 'opportunity' : 'opportunities'}${results.isFetching ? ' · updating…' : ''}` : ''}
          </p>
          {d?.fitScanTruncated && <div className="mb-3"><Notice tone="warning">Fit filtering looked at the first 1,000 matches. Narrow your search for exact results.</Notice></div>}
          {d?.items.some((o) => o.isDemo) && <div className="mb-4"><Notice title="Demo listings">Listings marked “Demo data” are sample entries used to demonstrate NIRMAAN. They aren't live or verified postings.</Notice></div>}

          {results.isLoading ? <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
            : results.isError ? <ErrorState message={(results.error as Error).message} onRetry={() => results.refetch()} />
            : d && d.items.length === 0 ? <EmptyState icon={Compass} title="No opportunities match" description={chips.length ? 'Try removing a filter or two.' : 'The catalog is empty right now.'} action={chips.length ? <Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear all filters</Button> : undefined} />
            : (<>
              <div className={`grid md:grid-cols-2 gap-4 transition-opacity ${results.isFetching ? 'opacity-70' : ''}`}>
                {d!.items.map((o) => <OpportunityCard key={o.id} o={o} compare={picked.includes(o.id)} onCompare={togglePick} compareDisabled={picked.length >= 4} />)}
              </div>
              <Pagination page={d!.page} pages={d!.pages} onPage={(p) => { setFilters({ ...filters, page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
            </>)}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 surface-elevated rounded-full pl-5 pr-2 py-2 flex items-center gap-3" role="region" aria-label="Comparison">
          <span className="text-sm"><strong>{picked.length}</strong> selected {picked.length < 2 && <span className="text-muted">· pick at least 2</span>}</span>
          <Button size="sm" disabled={picked.length < 2} onClick={() => nav(`/compare?ids=${picked.join(',')}`)}><GitCompare size={14} /> Compare</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked([])} aria-label="Clear comparison"><X size={14} /></Button>
        </div>
      )}

      <Dialog open={sheet} onClose={() => setSheet(false)} title="Filters" footer={<><Button variant="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>Clear all</Button><Button onClick={() => setSheet(false)}>Show {d ? d.total : ''} results</Button></>}>
        <FilterPanel filters={filters} facets={facets.data} onChange={setFilters} />
      </Dialog>
    </div>
  )
}
