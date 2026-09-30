import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, activeChips, filtersFromParams, filtersToParams } from '../lib/filters'
import { filterParams } from '../lib/services'

describe('opportunity filters ⇄ URL', () => {
  it('round-trips every filter through the query string', () => {
    const f = { ...EMPTY_FILTERS, q: 'ml', category: ['Hackathon', 'Internship'], domain: ['ai-ml'], skill: ['python'], difficulty: ['beginner'], format: ['online'], participation: ['team'],
      workMode: ['remote'], freshness: ['fresh'], teamSize: 3, location: 'Pune', eligibility: 'undergraduate', deadlineWithin: 14, verified: true, includeExpired: true, minFit: 60, sort: 'fit' as const, page: 3 }
    const back = filtersFromParams(filtersToParams(f))
    expect(back).toEqual(f)
  })
  it('omits defaults so clean URLs stay clean', () => { expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('') })
  it('survives garbage: bad sort, bad numbers, negative page', () => {
    const f = filtersFromParams(new URLSearchParams('sort=random&team_size=abc&page=-4&min_fit=x&category=&category=Hackathon'))
    expect(f.sort).toBe('relevance'); expect(f.teamSize).toBeUndefined(); expect(f.page).toBe(1); expect(f.minFit).toBeUndefined(); expect(f.category).toEqual(['Hackathon'])
  })
  it('sends the API its repeated-key / snake_case contract and never page or sort', () => {
    const p = filterParams({ ...EMPTY_FILTERS, category: ['a', 'b'], workMode: ['remote'], teamSize: 2, deadlineWithin: 7, page: 4, sort: 'fit' })
    expect(p.getAll('category')).toEqual(['a', 'b']); expect(p.get('work_mode')).toBe('remote'); expect(p.get('team_size')).toBe('2'); expect(p.get('deadline_within')).toBe('7')
    expect(p.has('page')).toBe(false); expect(p.has('sort')).toBe(false)
  })
  it('builds one removable chip per active filter and removing resets the page', () => {
    const f = { ...EMPTY_FILTERS, category: ['Hackathon'], skill: ['python'], minFit: 60, page: 5 }
    const chips = activeChips(f)
    expect(chips.map((c) => c.label)).toEqual(['Category: Hackathon', 'Skill: Python', 'Fit ≥ 60%'])
    const after = chips[0].remove(f)
    expect(after.category).toEqual([]); expect(after.skill).toEqual(['python']); expect(after.page).toBe(1)
  })
})
