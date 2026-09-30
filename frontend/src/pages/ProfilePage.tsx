import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge, ErrorState, Skeleton } from '../components/ui/primitives'
import { ChipSelector } from '../components/common/ChipSelector'
import { ResumeImport } from '../components/profile/ResumeImport'
import { Dialog, Notice, PageHeader, Select, Toggle } from '../components/ui/kit'
import { profileService } from '../lib/services'
import type { ApiError } from '../lib/api'
import { skillLabel } from '../lib/format'
import type { Level, Profile, ProfileUpdate } from '../types'

const KIND_LABEL: Record<string, string> = { education: 'Education', project: 'Projects', experience: 'Experience', certification: 'Certifications', achievement: 'Achievements' }

export function ProfilePage() {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['profile'], queryFn: profileService.get })
  const skills = useQuery({ queryKey: ['vocab', 'skills'], queryFn: profileService.skills, staleTime: Infinity })
  const interests = useQuery({ queryKey: ['vocab', 'interests'], queryFn: profileService.interests, staleTime: Infinity })
  const [d, setD] = useState<ProfileUpdate>({})
  const [resumeOpen, setResumeOpen] = useState(false)
  const p = profile.data
  useEffect(() => { if (p) setD({ fullName: p.fullName, branch: p.branch ?? '', year: p.year ?? '', educationLevel: p.educationLevel, location: p.location ?? '', skills: p.skills, interests: p.interests, experienceLevel: p.experienceLevel, availabilityHrs: p.availabilityHrs, participationPref: p.participationPref, preferredFormat: p.preferredFormat, openToTeam: p.openToTeam }) }, [p])
  const refresh = () => { for (const k of ['profile', 'me', 'dashboard', 'opportunities', 'recommendations']) qc.invalidateQueries({ queryKey: [k] }) }
  const save = useMutation({ mutationFn: () => profileService.update({ ...d, branch: d.branch?.trim() || null, year: d.year?.trim() || null, location: d.location?.trim() || null }), onSuccess: () => { toast.success('Profile saved'); refresh() }, onError: (e: ApiError) => toast.error(e.message) })
  const confirm = useMutation({ mutationFn: (n: string) => profileService.confirmSkill(n), onSuccess: () => { toast.success('Skill confirmed'); refresh() }, onError: (e: ApiError) => toast.error(e.message) })
  const dismiss = useMutation({ mutationFn: (n: string) => profileService.removeSkill(n), onSuccess: () => { toast.success('Removed'); refresh() }, onError: (e: ApiError) => toast.error(e.message) })
  const rmItem = useMutation({ mutationFn: (id: string) => profileService.removeItem(id), onSuccess: refresh, onError: (e: ApiError) => toast.error(e.message) })

  if (profile.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
  if (profile.isError || !p) return <ErrorState message={(profile.error as Error)?.message} onRetry={() => profile.refetch()} />
  const set = (patch: ProfileUpdate) => setD((s) => ({ ...s, ...patch }))
  const dirty = JSON.stringify(d) !== JSON.stringify({ fullName: p.fullName, branch: p.branch ?? '', year: p.year ?? '', educationLevel: p.educationLevel, location: p.location ?? '', skills: p.skills, interests: p.interests, experienceLevel: p.experienceLevel, availabilityHrs: p.availabilityHrs, participationPref: p.participationPref, preferredFormat: p.preferredFormat, openToTeam: p.openToTeam })
  const grouped = Object.entries(KIND_LABEL).map(([k, label]) => ({ label, items: p.items.filter((i) => i.kind === k) })).filter((g) => g.items.length)
  const evidenceFor = (n: string) => p.skillEvidence.filter((e) => e.skill === n)

  return (
    <div>
      <PageHeader title="Profile" subtitle="What NIRMAAN knows about you. Fit scores use only what you've confirmed here." actions={<>
        <Button variant="secondary" onClick={() => setResumeOpen(true)}>Import from resume</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>Save changes</Button></>} />

      {!p.completeness.complete && <div className="mb-6"><Notice tone="warning" title={`Profile ${p.completeness.percent}% complete`}>Add your {p.completeness.missing.join(', ')} to unlock personalised recommendations.</Notice></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5"><h2 className="text-sm font-semibold mb-4">Basics</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Full name" value={d.fullName ?? ''} onChange={(e) => set({ fullName: e.target.value })} />
              <Input label="Email" value={p.email} disabled readOnly />
              <Input label="Branch / field" value={d.branch ?? ''} onChange={(e) => set({ branch: e.target.value })} />
              <Input label="Year" value={d.year ?? ''} onChange={(e) => set({ year: e.target.value })} />
              <Select label="Education level" value={d.educationLevel ?? ''} onChange={(e) => set({ educationLevel: (e.target.value || null) as Profile['educationLevel'] })}><option value="">Prefer not to say</option><option value="high_school">High school</option><option value="undergraduate">Undergraduate</option><option value="postgraduate">Postgraduate</option><option value="phd">PhD</option><option value="other">Other</option></Select>
              <Input label="Location" value={d.location ?? ''} onChange={(e) => set({ location: e.target.value })} />
            </div></Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-1">Confirmed skills</h2><p className="text-xs text-muted mb-3">These count towards your fit scores.</p>
            <ChipSelector options={(skills.data ?? []).map((s) => s.name)} selected={d.skills ?? []} onChange={(v) => set({ skills: v })} allowCustom={false} placeholder="Search skills…" />
            {p.inferredSkills.length > 0 && (
              <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1">Suggested skills <Badge tone="warning">unconfirmed</Badge></h3>
                <p className="text-xs text-muted mb-3">Found in your resume. They don't affect scores until you confirm them.</p>
                <ul className="space-y-2">{p.inferredSkills.map((s) => (
                  <li key={s.name} className="flex items-start justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="min-w-0"><p className="text-sm font-medium">{skillLabel(s.name)}</p>{evidenceFor(s.name).slice(0, 2).map((e, i) => <p key={i} className="text-[11px] text-muted truncate" title={e.evidence}>{e.source}: “{e.evidence}”</p>)}</div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="secondary" onClick={() => confirm.mutate(s.name)} loading={confirm.isPending && confirm.variables === s.name} aria-label={`Confirm ${s.name}`}><Check size={14} /> I have this</Button>
                      <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(s.name)} aria-label={`Dismiss ${s.name}`}><X size={14} /></Button>
                    </div></li>))}</ul>
              </div>)}
          </Card>

          <Card className="p-5"><h2 className="text-sm font-semibold mb-3">Interests</h2>
            <ChipSelector options={(interests.data ?? []).map((s) => s.name)} selected={d.interests ?? []} onChange={(v) => set({ interests: v })} allowCustom={false} placeholder="Search interests…" /></Card>

          {grouped.length > 0 && <Card className="p-5"><h2 className="text-sm font-semibold mb-3">From your resume</h2>
            {grouped.map((g) => (<div key={g.label} className="mb-4 last:mb-0"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">{g.label}</h3>
              <ul className="space-y-1">{g.items.map((i) => <li key={i.id} className="flex items-start justify-between gap-2 text-sm"><span>{i.text}</span><button className="text-muted hover:text-danger-500 p-1 focus-ring rounded" onClick={() => rmItem.mutate(i.id)} aria-label={`Remove: ${i.text}`}><X size={14} /></button></li>)}</ul></div>))}
            {Object.keys(p.links).length > 0 && <div className="pt-3 border-t text-sm" style={{ borderColor: 'var(--border)' }}>{Object.entries(p.links).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer nofollow" className="block text-accent-500 truncate focus-ring rounded">{k}: {v}</a>)}</div>}
          </Card>}
        </div>

        <div className="space-y-6">
          <Card className="p-5 space-y-4"><h2 className="text-sm font-semibold">Preferences</h2>
            <Select label="Experience level" value={d.experienceLevel ?? 'beginner'} onChange={(e) => set({ experienceLevel: e.target.value as Level })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>
            <div><label htmlFor="p-hrs" className="block text-xs font-medium text-muted mb-1.5">Hours per week: <strong className="text-[var(--text)]">{d.availabilityHrs ?? 5}</strong></label><input id="p-hrs" type="range" min={0} max={40} value={d.availabilityHrs ?? 5} onChange={(e) => set({ availabilityHrs: Number(e.target.value) })} className="w-full accent-[var(--color-accent-500)]" /></div>
            <Select label="Individual or team" value={d.participationPref ?? 'either'} onChange={(e) => set({ participationPref: e.target.value as Profile['participationPref'] })}><option value="either">Either</option><option value="individual">Individual</option><option value="team">Team</option></Select>
            <Select label="Preferred format" value={d.preferredFormat ?? ''} onChange={(e) => set({ preferredFormat: (e.target.value || null) as Profile['preferredFormat'] })}><option value="">No preference</option><option value="online">Online</option><option value="offline">In person</option><option value="hybrid">Hybrid</option></Select>
          </Card>
          <Card className="p-5"><h2 className="text-sm font-semibold mb-1">Team visibility</h2>
            <Toggle checked={!!d.openToTeam} onChange={(v) => set({ openToTeam: v })} label="Open to team invitations" description="When on, students using Team Builder can see your name, skills, experience level and weekly availability. Your email is never shown." /></Card>
        </div>
      </div>

      <Dialog open={resumeOpen} onClose={() => setResumeOpen(false)} title="Import from resume" description="PDF or DOCX. Review everything before it touches your profile." size="xl">
        <ResumeImport profile={p} onDone={() => setResumeOpen(false)} />
      </Dialog>
    </div>
  )
}
