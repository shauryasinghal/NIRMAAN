import type { OpportunityFilters } from '../types'

export const EMPTY_FILTERS: OpportunityFilters = { category: [], domain: [], skill: [], difficulty: [], format: [], participation: [], workMode: [], freshness: [], sort: 'relevance', page: 1 }
const SORTS = new Set(['relevance', 'deadline', 'newest', 'fit'])

/** URL query string ⇄ filter state. The URL is the single source of truth, so every view is shareable and survives refresh / back. */
export function filtersFromParams(sp: URLSearchParams): OpportunityFilters {
  const all = (k: string) => sp.getAll(k).filter(Boolean)
  const num = (k: string) => { const v = Number(sp.get(k)); return sp.get(k) && Number.isFinite(v) ? v : undefined }
  const sort = sp.get('sort') ?? 'relevance'
  return {
    q: sp.get('q') || undefined, category: all('category'), domain: all('domain'), skill: all('skill'), difficulty: all('difficulty'), format: all('format'),
    participation: all('participation'), workMode: all('work_mode'), freshness: all('freshness'), teamSize: num('team_size'), location: sp.get('location') || undefined,
    eligibility: sp.get('eligibility') || undefined, deadlineWithin: num('deadline_within'), verified: sp.get('verified') === 'true' ? true : undefined,
    includeExpired: sp.get('include_expired') === 'true' ? true : undefined, minFit: num('min_fit'),
    sort: (SORTS.has(sort) ? sort : 'relevance') as OpportunityFilters['sort'], page: Math.max(1, num('page') ?? 1),
  }
}

export function filtersToParams(f: OpportunityFilters): URLSearchParams {
  const p = new URLSearchParams()
  const add = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '' && v !== false) p.append(k, String(v)) }
  add('q', f.q)
  ;(['category', 'domain', 'skill', 'difficulty', 'format', 'participation', 'freshness'] as const).forEach((k) => f[k].forEach((v) => add(k, v)))
  f.workMode.forEach((v) => add('work_mode', v))
  add('team_size', f.teamSize); add('location', f.location); add('eligibility', f.eligibility); add('deadline_within', f.deadlineWithin)
  add('verified', f.verified); add('include_expired', f.includeExpired); add('min_fit', f.minFit)
  if (f.sort !== 'relevance') p.set('sort', f.sort)
  if (f.page > 1) p.set('page', String(f.page))
  return p
}

export interface FilterChip { key: string; label: string; remove: (f: OpportunityFilters) => OpportunityFilters }

export function activeChips(f: OpportunityFilters): FilterChip[] {
  const chips: FilterChip[] = []
  const list = (key: 'category' | 'domain' | 'skill' | 'difficulty' | 'format' | 'participation' | 'freshness' | 'workMode', prefix: string) =>
    f[key].forEach((v) => chips.push({ key: `${key}:${v}`, label: `${prefix}: ${v}`, remove: (s) => ({ ...s, [key]: s[key].filter((x) => x !== v), page: 1 }) }))
  list('category', 'Category'); list('domain', 'Domain'); list('skill', 'Skill'); list('difficulty', 'Difficulty'); list('format', 'Format')
  list('participation', 'Participation'); list('workMode', 'Work mode'); list('freshness', 'Freshness')
  if (f.q) chips.push({ key: 'q', label: `Search: “${f.q}”`, remove: (s) => ({ ...s, q: undefined, page: 1 }) })
  if (f.teamSize) chips.push({ key: 'ts', label: `Team of ${f.teamSize}`, remove: (s) => ({ ...s, teamSize: undefined, page: 1 }) })
  if (f.location) chips.push({ key: 'loc', label: `Location: ${f.location}`, remove: (s) => ({ ...s, location: undefined, page: 1 }) })
  if (f.eligibility) chips.push({ key: 'el', label: `Eligibility: ${f.eligibility}`, remove: (s) => ({ ...s, eligibility: undefined, page: 1 }) })
  if (f.deadlineWithin) chips.push({ key: 'dw', label: `Closes within ${f.deadlineWithin} days`, remove: (s) => ({ ...s, deadlineWithin: undefined, page: 1 }) })
  if (f.verified) chips.push({ key: 'ver', label: 'Verified only', remove: (s) => ({ ...s, verified: undefined, page: 1 }) })
  if (f.includeExpired) chips.push({ key: 'exp', label: 'Including closed', remove: (s) => ({ ...s, includeExpired: undefined, page: 1 }) })
  if (f.minFit) chips.push({ key: 'fit', label: `Fit ≥ ${f.minFit}%`, remove: (s) => ({ ...s, minFit: undefined, page: 1 }) })
  return chips
}
