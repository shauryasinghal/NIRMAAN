import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AiAnalysisView } from '../components/originality/AiAnalysisView'
import { IdeaResultView } from '../components/originality/IdeaResultView'
import type { AiAnalysis, AiReport, IdeaResult } from '../types'

const DISCLAIMER = 'The AI assessment is a qualitative reading of the texts by a language model. It has not verified anything, it can be wrong, and it is not a plagiarism finding.'
const dim = (level: 'low' | 'moderate' | 'high', explanation: string) => ({ level, explanation })
const report: AiReport = {
  overallSummary: 'Both ideas address lab bookings; yours adds a waitlist and reminders.',
  matches: [{
    id: 'm1', title: 'Lab equipment booking system', similarity: 81.2, relationship: 'similar_problem_different_solution', relationshipLabel: 'Similar problem, different solution',
    problemSimilarity: dim('high', 'Both target idle lab equipment.'), solutionSimilarity: dim('moderate', 'Both book slots; yours queues.'), functionalSimilarity: dim('moderate', 'Booking flows overlap.'),
    targetUserSimilarity: dim('high', 'Both serve students.'), technicalApproachSimilarity: dim('low', 'The existing idea does not state a stack.'),
    commonFeatures: ['slot booking'], uniqueToSubmission: ['waitlist', 'SMS reminders'], meaningfulDifferences: ['queueing when full'], potentiallyReusedConcepts: [], summary: 'Same problem, a different approach to scarcity.',
  }],
  uniqueContributions: ['waitlist'], potentialOverlapAreas: ['slot booking'], missingDifferentiators: ['who administers the equipment'],
  suggestions: [{ kind: 'new_feature', suggestion: 'Add fairness rules for repeat bookers.', rationale: 'No existing idea mentions fairness.' }],
  confidence: 'medium', limitations: ['Only short descriptions were available.'], matchesNotAssessed: ['m2'],
}
const completed: AiAnalysis = {
  status: 'completed', provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER, generatedAt: '2026-11-14T10:00:00Z', attempts: 1, durationMs: 1200, report,
  embedding: { topSimilarity: 81.2, band: { band: 'high', label: 'High semantic similarity', similarity: 0.812 }, thresholds: { review: 0.75, related: 0.45 }, method: 'all-MiniLM-L6-v2' },
  inputs: { matchesSent: 2, matchIds: ['m1', 'm2'], sections: ['technologies'], peerSubmissionsSent: 0 },
}
const mine = { title: 'Lab equipment waitlist', description: 'Students reserve equipment and join a waitlist.', sections: { technologies: 'Django' } }
const show = (a: AiAnalysis, extra: Partial<Parameters<typeof AiAnalysisView>[0]> = {}) => render(<MemoryRouter><AiAnalysisView a={a} mine={mine} {...extra} /></MemoryRouter>)

describe('AiAnalysisView', () => {
  it('renders the completed report with the measured similarity kept apart from the AI assessment', () => {
    show(completed)
    expect(screen.getByRole('region', { name: 'AI deep analysis' })).toBeTruthy()
    expect(screen.getByText(/yours adds a waitlist/)).toBeTruthy()
    expect(screen.getByText('Measured embedding similarity')).toBeTruthy(); expect(screen.getByText('AI qualitative assessment')).toBeTruthy()
    expect(screen.getAllByText('81%').length).toBeGreaterThan(0); expect(screen.getByText('High semantic similarity')).toBeTruthy()
    expect(screen.getByText(/below 45% low, 45–75% moderate, 75%\+ high/)).toBeTruthy()
    expect(screen.getByText('Similar problem, different solution')).toBeTruthy(); expect(screen.getByText(/Solving the same problem is not plagiarism/)).toBeTruthy()
    expect(screen.getAllByText('high similarity', { selector: 'span', exact: false }).length).toBe(2)
    expect(screen.getAllByText('waitlist', { selector: 'li' }).length).toBe(2); expect(screen.getByText('SMS reminders')).toBeTruthy(); expect(screen.getAllByText('slot booking', { selector: 'li' }).length).toBe(2)
    expect(screen.getByText('Add fairness rules for repeat bookers.')).toBeTruthy(); expect(screen.getByText('Only short descriptions were available.')).toBeTruthy()
    expect(screen.getByText(/1 match was not assessed by the AI stage/)).toBeTruthy()
    expect(screen.getByText(/not a plagiarism finding/)).toBeTruthy(); expect(screen.getByText(/no other student’s submission was sent/)).toBeTruthy()
    expect(screen.getByText(/Your submitted idea has not been changed/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/100%/)
  })

  it('opens a side-by-side view with the student’s own text and sections', () => {
    show(completed)
    fireEvent.click(screen.getByRole('button', { name: 'Show side-by-side text' }))
    expect(screen.getByText('Your idea')).toBeTruthy(); expect(screen.getByText('Existing idea')).toBeTruthy()
    expect(screen.getByText('Students reserve equipment and join a waitlist.')).toBeTruthy(); expect(screen.getByText('Django')).toBeTruthy()
  })

  it('says plainly when the AI stage could not be completed, and offers a retry', () => {
    const onRun = vi.fn()
    show({ status: 'unavailable', provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER, error: { code: 'timeout', message: 'The AI analysis took too long and was stopped.' } }, { onRun })
    expect(screen.getByText('AI deep analysis could not be completed')).toBeTruthy()
    expect(screen.getByText(/took too long and was stopped/)).toBeTruthy(); expect(screen.getByText(/semantic similarity result above is complete and unaffected/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRun).toHaveBeenCalledWith(true)
  })

  it('offers to run a pending analysis and renders nothing when the stage is disabled', () => {
    const onRun = vi.fn()
    const { unmount } = show({ status: 'pending', provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER }, { onRun })
    fireEvent.click(screen.getByRole('button', { name: 'Run AI deep analysis' }))
    expect(onRun).toHaveBeenCalledWith(false); unmount()
    const { container } = show({ status: 'disabled', provider: 'Google Gemini', model: null, disclaimer: DISCLAIMER, error: { code: 'not_configured', message: 'off' } })
    expect(container.textContent).toBe('')
  })

  it('hides suggestions and contribution cards in compact (reviewer) mode but keeps the comparison and limitations', () => {
    show(completed, { compact: true })
    expect(screen.queryByText('Ways to make your idea more distinctive')).toBeNull(); expect(screen.queryByText('Your unique contributions')).toBeNull()
    expect(screen.getByText('Comparison with each closest match')).toBeTruthy(); expect(screen.getByText('Confidence and limitations')).toBeTruthy()
  })
})

const base: IdeaResult = {
  id: 'i1', title: 'My idea', description: 'desc', domain: null, status: 'novel', createdAt: '2026-10-01T10:00:00Z', topSimilarity: 62, confidence: 'medium',
  verdict: { level: 'related_work', label: 'Related prior work found', message: 'Related ideas exist.', needsReview: false },
  method: { description: 'MiniLM', model: 'm', search: 's', corpusSize: 50, thresholds: { review: 0.75, related: 0.45 } },
  disclaimer: 'Semantic similarity is a screening signal, not proof of plagiarism.', peerOverlapsExist: false, opportunity: null, review: null,
  matches: [{ id: 'm1', title: 'Existing idea', description: 'text', source: null, similarity: 62, overlap: { semantic: 0.62, title: 0.4, sameDomain: null, sharedTerms: [] } }],
}

describe('IdeaResultView – AI stage and structured sections', () => {
  it('shows provided sections and the AI report, labelling the measured side', () => {
    render(<MemoryRouter><IdeaResultView r={{ ...base, sections: { problem_statement: 'Equipment sits idle.', technologies: 'Django' }, aiAnalysis: completed }} /></MemoryRouter>)
    expect(screen.getByText('Structured detail you provided')).toBeTruthy(); expect(screen.getByText('Equipment sits idle.')).toBeTruthy()
    expect(screen.getByText(/semantic similarity \(measured\)/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'AI deep analysis' })).toBeTruthy()
    expect(screen.getByText(/Google Gemini \(gemini-3.5-flash-lite\), qualitative only/)).toBeTruthy()
  })

  it('stays compatible with responses that lack the new fields', () => {
    render(<MemoryRouter><IdeaResultView r={base} /></MemoryRouter>)
    expect(screen.queryByText('AI deep analysis')).toBeNull(); expect(screen.queryByText('Structured detail you provided')).toBeNull()
  })
})
