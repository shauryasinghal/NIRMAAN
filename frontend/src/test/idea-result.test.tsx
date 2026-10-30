import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IdeaResultView } from '../components/originality/IdeaResultView'
import type { IdeaResult } from '../types'

const base: IdeaResult = {
  id: 'i1', title: 'My idea', description: 'desc', domain: null, status: 'novel', createdAt: '2026-10-01T10:00:00Z', topSimilarity: 62, confidence: 'medium',
  verdict: { level: 'related_work', label: 'Related prior work found', message: 'Related ideas exist.', needsReview: false },
  method: { description: 'MiniLM', model: 'm', search: 's', corpusSize: 50, thresholds: { review: 0.75, related: 0.45 } },
  disclaimer: 'Semantic similarity is a screening signal, not proof of plagiarism.', peerOverlapsExist: false, opportunity: null, review: null,
  matches: [{ id: 'm1', title: 'Existing idea', description: 'text', source: null, similarity: 62,
    overlap: { semantic: 0.62, title: 0.4, sameDomain: null, sharedTerms: ['irrigation'], sharedPhrases: ['soil moisture sensors'], wording: { jaccard: 0.55, containment: 0.7, signal: 'near_duplicate', scope: 'description' } } }],
}
const show = (r: Partial<IdeaResult>) => render(<MemoryRouter><IdeaResultView r={{ ...base, ...r }} /></MemoryRouter>)

describe('IdeaResultView – explainability additions', () => {
  it('shows the wording signal with an explicit "not proof" caveat, plus shared phrases and terms', () => {
    show({})
    expect(screen.getByText('Very similar wording')).toBeTruthy()
    expect(screen.getByText(/55% of 3-word sequences are shared \(description\)/)).toBeTruthy()
    expect(screen.getByText(/not proof of copying/)).toBeTruthy()
    expect(screen.getByText('“soil moisture sensors”')).toBeTruthy(); expect(screen.getByText('irrigation')).toBeTruthy()
  })

  it('shows no wording claim when there is no signal, and stays compatible with responses that lack the new fields', () => {
    const m = { ...base.matches[0], overlap: { semantic: 0.5, title: null, sameDomain: null, sharedTerms: [] } }
    show({ matches: [m] })
    expect(screen.queryByText(/wording/i)).toBeNull(); expect(screen.queryByText(/earlier check/i)).toBeNull(); expect(screen.queryByText(/Long idea/)).toBeNull()
  })

  it('explains sectioned analysis when coverage is verified complete', () => {
    show({ coverage: { words: 420, sections: 4, complete: true, verified: 'tokenizer' } })
    expect(screen.getByText('Long idea analysed in sections')).toBeTruthy(); expect(screen.getByText(/compared in 4 overlapping sections/)).toBeTruthy()
    expect(screen.getByText(/Every part of your text was checked to fit the model/)).toBeTruthy(); expect(screen.queryByText(/may not have been compared/)).toBeNull()
  })

  it('warns honestly when coverage is incomplete, and says why', () => {
    const { unmount } = show({ coverage: { words: 900, sections: 10, complete: false, verified: 'tokenizer', sectionsNeeded: 14 } })
    expect(screen.getByText('Part of your idea may not have been compared')).toBeTruthy(); expect(screen.getByText(/needs 14 sections and only the first 10/)).toBeTruthy(); unmount()
    show({ coverage: { words: 90, sections: 1, complete: false, verified: 'estimate' } })     // a short idea, but the length could not be verified
    expect(screen.getByText(/coverage could not be verified/)).toBeTruthy()
  })

  it('lists the owner\'s earlier checks as links that open the preserved result', () => {
    show({ previousChecks: [{ id: 'p1', title: 'Earlier version', status: 'needs_review', checkedAt: '2026-09-01T10:00:00Z', similarity: 97, wording: 'exact' }] })
    expect(screen.getByRole('link', { name: 'Earlier version' }).getAttribute('href')).toBe('/originality/history/p1')
    expect(screen.getByText('Identical wording')).toBeTruthy(); expect(screen.getByText(/Only you can see this/)).toBeTruthy()
  })

  it('says how many weak matches are not shown and why', () => {
    show({ display: { floor: 0.3, hiddenWeakMatches: 3 } })
    expect(screen.getByText(/3 weaker matches \(below 30% similarity\) are not shown/)).toBeTruthy()
  })
})
