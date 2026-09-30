import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Button } from '../ui/Button'
import { Notice } from '../ui/kit'
import { profileService } from '../../lib/services'
import type { ApiError } from '../../lib/api'
import type { Profile, ResumeExtraction } from '../../types'

type Choice = 'add' | 'suggest' | 'skip'
const GROUPS: [keyof ResumeExtraction['extracted']['items'], string][] = [['education', 'Education'], ['projects', 'Projects'], ['experience', 'Experience'], ['certifications', 'Certifications'], ['achievements', 'Achievements']]

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
  const selectedCount = Object.values(skillChoice).filter((c) => c !== 'skip').length + Object.values(items).filter(Boolean).length + Object.values(links).filter(Boolean).length + (useName ? 1 : 0)
  return (
    <div className="space-y-5">
      <Notice tone="accent" title="Review before anything changes">{data.method}. Nothing has been saved yet.</Notice>
      {ex.name && data.diff.nameDiffers && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-accent-500)]" checked={useName} onChange={(e) => setUseName(e.target.checked)} />
          <span>Change my name from <strong>{data.diff.currentName || '(empty)'}</strong> to <strong>{ex.name}</strong></span></label>
      )}
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Skills found ({ex.skills.length})</legend>
        {data.diff.alreadyConfirmed.length > 0 && <p className="text-xs text-muted mb-2">Already on your profile: {data.diff.alreadyConfirmed.join(', ')}</p>}
        {data.diff.newSkills.length === 0 ? <p className="text-sm text-muted">No new skills found.</p> : (
          <ul className="space-y-2">{data.diff.newSkills.map((s) => (
            <li key={s.name} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium capitalize">{s.name}</span>
                <div role="radiogroup" aria-label={`What to do with ${s.name}`} className="inline-flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--border)' }}>
                  {([['add', 'I have this'], ['suggest', 'Suggest only'], ['skip', 'Skip']] as [Choice, string][]).map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={skillChoice[s.name] === v} onClick={() => setSkillChoice((c) => ({ ...c, [s.name]: v }))}
                      className={clsx('px-2.5 py-1.5 focus-ring', skillChoice[s.name] === v ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]')}>{l}</button>))}
                </div>
              </div>
              <p className="text-[11px] text-muted mt-1.5 truncate" title={s.evidence}>Found in: “{s.evidence}”</p>
            </li>))}</ul>
        )}
        <p className="text-[11px] text-muted mt-2">“Suggest only” keeps it as an unconfirmed suggestion with its evidence — it won't count towards your fit scores until you confirm it.</p>
      </fieldset>
      {ex.links.length > 0 && <fieldset><legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Links</legend>{ex.links.map((l) => (
        <label key={l} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="h-4 w-4 accent-[var(--color-accent-500)]" checked={!!links[l]} onChange={(e) => setLinks((s) => ({ ...s, [l]: e.target.checked }))} /> <span className="truncate">{l}</span></label>))}</fieldset>}
      {GROUPS.map(([g, label]) => ex.items[g].length > 0 && (
        <fieldset key={g}><legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{label}</legend>
          {ex.items[g].map((t) => (<label key={t} className="flex items-start gap-2 text-sm py-1"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent-500)]" checked={!!items[`${g}:${t}`]} onChange={(e) => setItems((s) => ({ ...s, [`${g}:${t}`]: e.target.checked }))} /> <span>{t}</span></label>))}
        </fieldset>
      ))}
      <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <Button variant="ghost" onClick={() => setData(null)}>Cancel</Button>
        <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={selectedCount === 0}>Apply {selectedCount} selected</Button>
      </div>
      {profile.skills.length > 0 && <p className="text-[11px] text-muted">Your existing skills are never removed by an import.</p>}
    </div>
  )
}
