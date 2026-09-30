import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, FileUp, Lightbulb, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { Notice } from '../ui/kit'
import { profileService } from '../../lib/services'
import { skillLabel } from '../../lib/format'
import type { ApiError } from '../../lib/api'
import type { Profile, ResumeExtraction } from '../../types'

type Choice = 'add' | 'suggest' | 'skip'
const GROUPS: [keyof ResumeExtraction['extracted']['items'], string][] = [['education', 'Education'], ['projects', 'Projects'], ['experience', 'Experience'], ['certifications', 'Certifications'], ['achievements', 'Achievements']]

/** What each choice means, and how the active one looks. State is never colour-only: every state has an icon, a caption and a card treatment. */
const CHOICES: { v: Choice; label: string; icon: typeof Check; badge: string; caption: string; active: string; card: string }[] = [
  { v: 'add', label: 'I have this', icon: Check, badge: 'Confirmed', caption: 'Saved as a confirmed skill — counts towards your fit scores.',
    active: 'bg-success-500/15 text-[var(--success-text)] font-semibold ring-1 ring-inset ring-success-500/50', card: 'border-success-500/50 bg-success-500/[0.04]' },
  { v: 'suggest', label: 'Suggest only', icon: Lightbulb, badge: 'Suggestion', caption: 'Saved as an unconfirmed suggestion with its evidence.',
    active: 'bg-navy-900 text-white font-semibold dark:bg-white dark:text-navy-900', card: '' },
  { v: 'skip', label: 'Skip', icon: X, badge: 'Skipped', caption: "Won't be saved.",
    active: 'bg-black/10 text-[var(--text)] font-semibold dark:bg-white/15', card: 'opacity-70' },
]
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Upload → review everything that was found → apply ONLY what you tick. Nothing is written before the last button. */
export function ResumeImport({ profile, onDone }: { profile: Profile; onDone?: (p: Profile) => void }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [data, setData] = useState<ResumeExtraction | null>(null)
  const [skillChoice, setSkillChoice] = useState<Record<string, Choice>>({})
  const [items, setItems] = useState<Record<string, boolean>>({})
  const [links, setLinks] = useState<Record<string, boolean>>({})
  const [useName, setUseName] = useState(false)

  const extract = useMutation({
    mutationFn: (f: File) => profileService.extractResume(f),
    onSuccess: (d) => {
      setData(d)
      setSkillChoice(Object.fromEntries(d.diff.newSkills.map((s) => [s.name, 'suggest' as Choice])))
      setItems({}); setLinks({}); setUseName(false)
    },
    onError: (e: ApiError) => toast.error(e.message),
  })
  const confirm = useMutation({
    mutationFn: () => {
      const d = data!
      const pick = (g: string) => d.extracted.items[g].filter((t) => items[`${g}:${t}`])
      const linkMap: Record<string, string> = {}
      d.extracted.links.filter((l) => links[l]).forEach((l) => { linkMap[l.includes('github') ? 'github' : l.includes('linkedin') ? 'linkedin' : 'portfolio'] = l })
      return profileService.confirmResume({
        confirmSkills: d.diff.newSkills.filter((s) => skillChoice[s.name] === 'add').map((s) => s.name),
        suggestSkills: d.diff.newSkills.filter((s) => skillChoice[s.name] === 'suggest'),
        updateName: useName ? d.extracted.name : null, links: linkMap,
        items: Object.fromEntries(GROUPS.map(([g]) => [g, pick(g)]).filter(([, v]) => (v as string[]).length)),
      })
    },
    onSuccess: (r) => { toast.success('Profile updated from your resume'); setData(null); qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['me'] }); onDone?.(r.profile) },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const take = (files: FileList | null) => { const f = files?.[0]; if (f) extract.mutate(f); if (input.current) input.current.value = '' }

  if (!data) {
    return (
      <div>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files) }}
          className={clsx('rounded-xl border-2 border-dashed p-6 text-center transition-colors', drag ? 'border-accent-500 bg-accent-500/5' : 'border-[var(--border-strong)]')}>
          {extract.isPending ? <p className="text-sm text-muted inline-flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin" /> Reading your resume…</p> : (
            <>
              <FileUp size={22} className="mx-auto text-muted mb-2" aria-hidden />
              <p className="text-sm font-medium">Drop a PDF or DOCX resume here</p>
              <p className="text-xs text-muted mt-1">Max 5 MB. It's read in memory and never stored. You review everything before anything changes.</p>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => input.current?.click()}>Choose file</Button>
            </>
          )}
          <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Upload resume" onChange={(e) => take(e.target.files)} />
        </div>
        {extract.isError && <p className="text-sm text-danger-500 mt-2" role="alert">{(extract.error as ApiError).message}</p>}
      </div>
    )
  }

  const ex = data.extracted
  const tally = (c: Choice) => data.diff.newSkills.filter((s) => skillChoice[s.name] === c).length
  const confirmedN = tally('add'), suggestedN = tally('suggest'), skippedN = tally('skip')
  const otherN = Object.values(items).filter(Boolean).length + Object.values(links).filter(Boolean).length + (useName ? 1 : 0)
  const selectedCount = Object.values(skillChoice).filter((c) => c !== 'skip').length + Object.values(items).filter(Boolean).length + Object.values(links).filter(Boolean).length + (useName ? 1 : 0)
  return (
    <div className="@container space-y-5 min-w-0">
      <Notice tone="accent" title="Review before anything changes">{data.method}. Nothing has been saved yet.</Notice>
      {ex.name && data.diff.nameDiffers && (
        <label className="flex items-start gap-2 text-sm min-w-0"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent-500)]" checked={useName} onChange={(e) => setUseName(e.target.checked)} />
          <span className="min-w-0 break-words">Change my name from <strong>{data.diff.currentName || '(empty)'}</strong> to <strong>{ex.name}</strong></span></label>
      )}
      {/* NB: a <fieldset> defaults to `min-width: min-content`, so one long unbreakable line used to widen the whole section past its container. */}
      <fieldset className="min-w-0">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Skills found ({ex.skills.length})</legend>
        <p className="text-xs text-muted mb-3 break-words">
          {plural(data.diff.newSkills.length, 'new skill')} to review{data.diff.alreadyConfirmed.length > 0 && <> · Already on your profile: {data.diff.alreadyConfirmed.join(', ')}</>}
        </p>
        {data.diff.newSkills.length === 0 ? <p className="text-sm text-muted">No new skills found.</p> : (
          <ul className="space-y-2">{data.diff.newSkills.map((s) => {
            const cur = CHOICES.find((c) => c.v === skillChoice[s.name]) ?? CHOICES[1]
            return (
              <li key={s.name} data-choice={cur.v} className={clsx('min-w-0 rounded-lg border p-3 grid gap-3 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-center transition-colors', cur.card)} style={cur.card ? undefined : { borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium break-words">{skillLabel(s.name)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted" style={{ borderColor: 'var(--border)' }}><cur.icon size={11} aria-hidden /> {cur.badge}</span>
                  </div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed break-words [overflow-wrap:anywhere]">Found in: “{s.evidence}”</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{cur.caption}</p>
                </div>
                <div role="radiogroup" aria-label={`What to do with ${s.name}`} className="grid grid-cols-3 @xl:grid-cols-[repeat(3,auto)] gap-1 rounded-lg border p-1 text-xs w-full @xl:w-auto" style={{ borderColor: 'var(--border)' }}>
                  {CHOICES.map((c) => (
                    <button key={c.v} type="button" role="radio" aria-checked={skillChoice[s.name] === c.v} onClick={() => setSkillChoice((st) => ({ ...st, [s.name]: c.v }))}
                      className={clsx('min-w-0 min-h-9 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-center leading-tight focus-ring @xl:whitespace-nowrap', skillChoice[s.name] === c.v ? c.active : 'text-muted hover:bg-black/[0.05] hover:text-[var(--text)] dark:hover:bg-white/[0.08]')}>
                      <c.icon size={12} aria-hidden className="shrink-0" />{c.label}</button>))}
                </div>
              </li>)
          })}</ul>
        )}
        <p className="text-xs text-muted mt-3">“Suggest only” keeps it as an unconfirmed suggestion with its evidence — it won't count towards your fit scores until you confirm it.</p>
      </fieldset>
      {ex.links.length > 0 && <fieldset className="min-w-0"><legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Links</legend>{ex.links.map((l) => (
        <label key={l} className="flex items-start gap-2 text-sm py-1 min-w-0"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-500)]" checked={!!links[l]} onChange={(e) => setLinks((s) => ({ ...s, [l]: e.target.checked }))} /> <span className="min-w-0 break-words [overflow-wrap:anywhere]">{l}</span></label>))}</fieldset>}
      {GROUPS.map(([g, label]) => ex.items[g].length > 0 && (
        <fieldset key={g} className="min-w-0"><legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{label}</legend>
          {ex.items[g].map((t) => (<label key={t} className="flex items-start gap-2 text-sm py-1 min-w-0"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-500)]" checked={!!items[`${g}:${t}`]} onChange={(e) => setItems((s) => ({ ...s, [`${g}:${t}`]: e.target.checked }))} /> <span className="min-w-0 break-words">{t}</span></label>))}
        </fieldset>
      ))}
      {profile.skills.length > 0 && <p className="text-xs text-muted">Your existing skills are never removed by an import.</p>}
      {/* Sticky: stays reachable whichever surface scrolls (dialog body or the page) */}
      <div className="sticky bottom-0 z-10 -mb-px flex flex-col gap-2 border-t bg-[var(--surface)] py-3 shadow-[0_-8px_12px_-8px_rgba(0,0,0,0.25)] @md:flex-row @md:items-center @md:justify-between @md:gap-4" style={{ borderColor: 'var(--border)' }}>
        <p data-testid="resume-summary" aria-live="polite" className="min-w-0 text-xs text-muted">
          <span className="font-medium text-[var(--text)]">Will save:</span> {confirmedN} confirmed · {plural(suggestedN, 'suggestion')}{otherN > 0 && <> · {plural(otherN, 'other item')}</>}{skippedN > 0 && <> · {skippedN} skipped</>}
        </p>
        <div className="flex items-center justify-between gap-3 @md:justify-end">
          <Button variant="ghost" onClick={() => setData(null)}>Cancel</Button>
          <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={selectedCount === 0}>Apply {selectedCount} selected</Button>
        </div>
      </div>
    </div>
  )
}
