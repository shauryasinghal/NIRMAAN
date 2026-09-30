import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './utils'
import type { Profile, ResumeExtraction } from '../types'

const extract = vi.fn(); const confirm = vi.fn()
vi.mock('../lib/services', () => ({ profileService: { extractResume: (f: File) => extract(f), confirmResume: (b: unknown) => confirm(b) } }))
import { ResumeImport } from '../components/profile/ResumeImport'

const profile = { skills: ['sql'], fullName: 'Old' } as unknown as Profile
const extraction: ResumeExtraction = {
  method: 'rule-based extraction — not an AI model', willChange: 'Nothing yet.',
  extracted: { name: 'Priya Nair', email: null, links: ['https://github.com/priya'], education: ['B.Tech CSE'], projects: ['Smart Attendance'], certifications: [], experience: [], achievements: [], skills: [{ name: 'python', evidence: 'Python, React' }, { name: 'sql', evidence: 'SQL' }], sectionsFound: [], charactersRead: 100,
    items: { education: ['B.Tech CSE'], projects: ['Smart Attendance'], certifications: [], experience: [], achievements: [] } },
  diff: { newSkills: [{ name: 'python', evidence: 'Python, React' }], alreadyConfirmed: ['sql'], nameDiffers: true, currentName: 'Old', newLinks: [] },
}
beforeEach(() => { extract.mockReset().mockResolvedValue(extraction); confirm.mockReset().mockResolvedValue({ changed: {}, profile }) })

async function upload() {
  renderApp(<ResumeImport profile={profile} />)
  await userEvent.upload(screen.getByLabelText('Upload resume'), new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }))
  await screen.findByText(/review before anything changes/i)
}

describe('ResumeImport', () => {
  it('shows what was found and writes NOTHING until you confirm', async () => {
    await upload()
    expect(extract).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText(/nothing has been saved yet/i)).toBeInTheDocument(); expect(screen.getByText('Python, React', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/never removed by an import/i)).toBeInTheDocument()
  })
  it('defaults new skills to "suggest only" — inferred skills are never silently confirmed', async () => {
    await upload()
    expect(screen.getByRole('radio', { name: 'Suggest only' })).toHaveAttribute('aria-checked', 'true'); expect(screen.getByRole('radio', { name: 'I have this' })).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('button', { name: /apply 1 selected/i }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toMatchObject({ confirmSkills: [], suggestSkills: [{ name: 'python' }], updateName: null, links: {}, items: {} })
  })
  it('sends only what was ticked: confirmed skill, name change, a link and one item', async () => {
    await upload()
    await userEvent.click(screen.getByRole('radio', { name: 'I have this' })); await userEvent.click(screen.getByLabelText(/change my name/i)); await userEvent.click(screen.getByLabelText('https://github.com/priya')); await userEvent.click(screen.getByLabelText('Smart Attendance'))
    await userEvent.click(screen.getByRole('button', { name: /apply 4 selected/i }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toEqual({ confirmSkills: ['python'], suggestSkills: [], updateName: 'Priya Nair', links: { github: 'https://github.com/priya' }, items: { projects: ['Smart Attendance'] } })
  })
  it('lets you skip a skill and cancel without any write', async () => {
    await upload(); await userEvent.click(screen.getByRole('radio', { name: 'Skip' })); expect(screen.getByRole('button', { name: /apply 0 selected/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.getByText(/drop a pdf or docx/i)).toBeInTheDocument(); expect(confirm).not.toHaveBeenCalled()
  })
  it('surfaces a rejected file clearly', async () => {
    extract.mockRejectedValue(Object.assign(new Error('The file type does not match its extension.'), { status: 422 }))
    renderApp(<ResumeImport profile={profile} />)
    await userEvent.upload(screen.getByLabelText('Upload resume'), new File(['MZ'], 'cv.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match its extension/i)
  })
})
