import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './utils'
import { ApiError } from '../lib/api'
import type { AiAnalysis, IdeaResult } from '../types'

const h = vi.hoisted(() => ({ status: vi.fn(), check: vi.fn(), ai: vi.fn() }))
vi.mock('../lib/services', () => ({
  ideaService: { status: h.status, check: h.check, aiAnalysis: h.ai },
  opportunityService: { detail: vi.fn() },
  profileService: { interests: vi.fn().mockResolvedValue([]) },
}))
import { OriginalityPage } from '../pages/OriginalityPage'

const DISCLAIMER = 'The AI assessment is a qualitative reading of the texts by a language model. It has not verified anything, it can be wrong, and it is not a plagiarism finding.'
const result: IdeaResult = {
  id: 'i1', title: 'Lab equipment waitlist', description: 'Students reserve shared lab equipment and join a waitlist when slots are full.', domain: null, status: 'worth_reviewing', createdAt: '2026-11-14T10:00:00Z', topSimilarity: 68, confidence: 'medium',
  verdict: { level: 'related_work', label: 'Related prior work found', message: 'Related ideas exist in the corpus.', needsReview: false },
  method: { description: 'MiniLM-L6-v2 (384-d) embeddings · pgvector HNSW cosine similarity', model: 'all-MiniLM-L6-v2', search: 'pgvector-hnsw-cosine', corpusSize: 50, thresholds: { review: 0.75, related: 0.45 } },
  disclaimer: 'Semantic similarity is a screening signal, not proof of plagiarism.', peerOverlapsExist: false, opportunity: null, review: null,
  matches: [{ id: 'r1', title: 'Lab equipment booking system', description: 'A scheduling system.', source: 'demo', similarity: 68, overlap: { semantic: 0.68, title: 0.7, sameDomain: null, sharedTerms: ['lab'] } }],
  aiAnalysis: { status: 'pending', provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER },
}
const completed: AiAnalysis = {
  status: 'completed', provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER, generatedAt: '2026-11-14T10:00:05Z',
  report: { overallSummary: 'Both address lab bookings; yours adds a waitlist.', matches: [], uniqueContributions: [], potentialOverlapAreas: [], missingDifferentiators: [], suggestions: [], confidence: 'low', limitations: ['Short texts.'], matchesNotAssessed: [] },
}

async function submit(withDetail = false) {
  const user = userEvent.setup()
  renderApp(<OriginalityPage />)
  await user.type(screen.getByLabelText('Idea title'), result.title)
  await user.type(screen.getByLabelText('Describe the idea'), result.description)
  if (withDetail) {
    await user.click(screen.getByRole('button', { name: 'Add detail' }))
    await user.type(screen.getByLabelText('Technologies used'), 'Django, Twilio')
    await user.type(screen.getByLabelText('Proposed solution'), 'A booking calendar with a waitlist.')
  }
  await user.click(screen.getByRole('button', { name: /Check originality/ }))
  return user
}

beforeEach(() => {
  h.status.mockReset().mockResolvedValue({ semantic: { enabled: true, model: 'all-MiniLM-L6-v2', search: 'pgvector-hnsw-cosine', thresholds: { review: 0.75, related: 0.45 } }, ai: { enabled: true, provider: 'Google Gemini', model: 'gemini-3.5-flash-lite', disclaimer: DISCLAIMER } })
  h.check.mockReset().mockResolvedValue(result)
  h.ai.mockReset().mockResolvedValue(completed)
})

describe('OriginalityPage – multi-stage flow', () => {
  it('runs the semantic check, then automatically runs the AI stage and shows both results', async () => {
    await submit()
    await waitFor(() => expect(h.check).toHaveBeenCalledTimes(1))
    expect(h.check.mock.calls[0][0]).toMatchObject({ title: result.title, description: result.description, technologies: null, proposedSolution: null })
    await waitFor(() => expect(h.ai).toHaveBeenCalledWith('i1', false))
    expect(await screen.findByText('Related prior work found')).toBeTruthy()
    expect(await screen.findByText(/yours adds a waitlist/)).toBeTruthy()
    const steps = screen.getByRole('list', { name: 'Analysis progress' })
    expect(steps.textContent).toContain('Understanding your idea'); expect(steps.textContent).toContain('AI deep analysis')
    await waitFor(() => expect(steps.textContent?.match(/done/g)?.length).toBe(3))
  })

  it('sends the structured sections when the student adds detail', async () => {
    await submit(true)
    await waitFor(() => expect(h.check).toHaveBeenCalledTimes(1))
    expect(h.check.mock.calls[0][0]).toMatchObject({ technologies: 'Django, Twilio', proposedSolution: 'A booking calendar with a waitlist.', problemStatement: null })
  })

  it('keeps the semantic result and reports the AI stage honestly when it fails, with a retry', async () => {
    h.ai.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'You have run a lot of AI analyses. Please wait a bit and try again.'))
    const user = await submit()
    expect(await screen.findByText('Related prior work found')).toBeTruthy()
    expect(await screen.findByText('AI deep analysis could not be completed')).toBeTruthy()
    expect(screen.getByText(/You have run a lot of AI analyses/)).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Analysis progress' }).textContent).toContain('could not be completed')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(h.ai).toHaveBeenLastCalledWith('i1', true))
    expect(await screen.findByText(/yours adds a waitlist/)).toBeTruthy()
  })

  it('does not call the AI stage when the server has it disabled, and says so in the progress steps', async () => {
    h.status.mockResolvedValue({ semantic: { enabled: true, model: 'm', search: 's', thresholds: { review: 0.75, related: 0.45 } }, ai: { enabled: false, provider: 'Google Gemini', model: null, disclaimer: DISCLAIMER } })
    h.check.mockResolvedValue({ ...result, aiAnalysis: { status: 'disabled', provider: 'Google Gemini', model: null, disclaimer: DISCLAIMER, error: { code: 'not_configured', message: 'off' } } })
    await submit()
    expect(await screen.findByText('Related prior work found')).toBeTruthy()
    expect(h.ai).not.toHaveBeenCalled()
    expect(screen.getByRole('list', { name: 'Analysis progress' }).textContent).toContain('not enabled on this server')
    expect(screen.queryByText(/sent to Google Gemini/)).toBeNull()
  })
})
