import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { ChipSelector } from '../components/common/ChipSelector'
import { ResumeImport } from '../components/profile/ResumeImport'
import { Notice, Select, Toggle } from '../components/ui/kit'
import { ErrorState, Skeleton } from '../components/ui/primitives'
import { NirmaanLogo } from '../components/common/NirmaanMark'
import { useAuth } from '../context/AuthContext'
import { profileService } from '../lib/services'
import type { ApiError } from '../lib/api'
import type { Level, Profile, ProfileUpdate } from '../types'

const STEPS = ['About you', 'Skills', 'Interests', 'Preferences', 'Resume'] as const

export function OnboardingPage() {
  const nav = useNavigate(); const qc = useQueryClient(); const { me, refreshMe } = useAuth()
  const [step, setStep] = useState(0)
  const [d, setD] = useState<ProfileUpdate | null>(null)
  const [touched, setTouched] = useState(false)
  const profile = useQuery({ queryKey: ['profile'], queryFn: profileService.get })
  const skills = useQuery({ queryKey: ['vocab', 'skills'], queryFn: profileService.skills, staleTime: Infinity })
  const interests = useQuery({ queryKey: ['vocab', 'interests'], queryFn: profileService.interests, staleTime: Infinity })
  const draft: ProfileUpdate = d ?? (profile.data ? { fullName: profile.data.fullName || me?.fullName || '', branch: profile.data.branch ?? '', year: profile.data.year ?? '', educationLevel: profile.data.educationLevel, location: profile.data.location ?? '',
    skills: profile.data.skills, interests: profile.data.interests, experienceLevel: profile.data.experienceLevel, availabilityHrs: profile.data.availabilityHrs, participationPref: profile.data.participationPref, preferredFormat: profile.data.preferredFormat, openToTeam: profile.data.openToTeam } : {})
  const set = (patch: ProfileUpdate) => setD({ ...draft, ...patch })

  const save = useMutation({
    mutationFn: (finish: boolean) => profileService.update({ ...draft, branch: draft.branch?.trim() || null, year: draft.year?.trim() || null, location: draft.location?.trim() || null, ...(finish ? { onboardingCompleted: true } : {}) }),
    onSuccess: async (_p, finish) => { qc.invalidateQueries({ queryKey: ['profile'] }); if (finish) { await refreshMe(); toast.success('You are all set'); nav('/dashboard', { replace: true }) } },
    onError: (e: ApiError) => toast.error(e.message),
  })

  if (profile.isLoading || skills.isLoading || interests.isLoading) return <div className="max-w-xl mx-auto p-6 space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>
  if (profile.isError || skills.isError || interests.isError) return <ErrorState message="We couldn't load your profile." onRetry={() => { void profile.refetch(); void skills.refetch(); void interests.refetch() }} />

  const problems: (string | null)[] = [
    !draft.fullName?.trim() ? 'Enter your name.' : !draft.branch?.trim() ? 'Enter your branch or field of study.' : null,
    !draft.skills?.length ? 'Pick at least one skill you genuinely have.' : null,
    !draft.interests?.length ? 'Pick at least one interest.' : null, null, null,
  ]
  const problem = problems[step]
  const next = async () => { setTouched(true); if (problem) return; setTouched(false); await save.mutateAsync(false); setStep((s) => s + 1) }

  return (
    <div className="min-h-screen bg-grid bg-radial-glow px-4 py-8">
      <div className={step === 4 ? 'max-w-3xl mx-auto' : 'max-w-xl mx-auto'}>   {/* the resume review needs room for evidence text beside its controls */}
        <div className="flex justify-center mb-6"><NirmaanLogo className="text-lg" /></div>
        <ol className="flex items-center gap-1.5 mb-6" aria-label="Progress">{STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? 'step' : undefined}><div className={`h-1.5 rounded-full ${i <= step ? 'bg-accent-500' : 'bg-black/10 dark:bg-white/10'}`} /><span className={`text-[10px] mt-1 block ${i === step ? 'font-medium' : 'text-muted'}`}>{s}</span></li>))}
        </ol>
        <Card variant="elevated" className="p-6">
          {step === 0 && (<div className="space-y-4"><h1 className="text-lg font-semibold">Tell us about you</h1>
            <Input label="Full name" value={draft.fullName ?? ''} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" />
            <Input label="Branch / field of study" placeholder="e.g. CSE (AI/ML)" value={draft.branch ?? ''} onChange={(e) => set({ branch: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Year (optional)" placeholder="e.g. 3" value={draft.year ?? ''} onChange={(e) => set({ year: e.target.value })} />
              <Select label="Education level (optional)" value={draft.educationLevel ?? ''} onChange={(e) => set({ educationLevel: (e.target.value || null) as Profile['educationLevel'] })}>
                <option value="">Prefer not to say</option><option value="high_school">High school</option><option value="undergraduate">Undergraduate</option><option value="postgraduate">Postgraduate</option><option value="phd">PhD</option><option value="other">Other</option></Select>
            </div>
            <Input label="City / location (optional)" placeholder="Used only to judge in-person events" value={draft.location ?? ''} onChange={(e) => set({ location: e.target.value })} autoComplete="address-level2" />
          </div>)}
          {step === 1 && (<div><h1 className="text-lg font-semibold mb-1">Your skills</h1><p className="text-sm text-muted mb-4">Only pick skills you can honestly vouch for — they drive your fit scores. You can also import them from a resume later.</p>
            <ChipSelector options={(skills.data ?? []).map((s) => s.name)} selected={draft.skills ?? []} onChange={(v) => set({ skills: v })} allowCustom={false} placeholder="Search skills…" /></div>)}
          {step === 2 && (<div><h1 className="text-lg font-semibold mb-1">What excites you?</h1><p className="text-sm text-muted mb-4">Domains you'd like opportunities in.</p>
            <ChipSelector options={(interests.data ?? []).map((s) => s.name)} selected={draft.interests ?? []} onChange={(v) => set({ interests: v })} allowCustom={false} placeholder="Search interests…" /></div>)}
          {step === 3 && (<div className="space-y-4"><h1 className="text-lg font-semibold">How do you like to work?</h1>
            <Select label="Experience level" value={draft.experienceLevel ?? 'beginner'} onChange={(e) => set({ experienceLevel: e.target.value as Level })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>
            <div><label htmlFor="hrs" className="block text-xs font-medium text-muted mb-1.5">Hours per week you can commit: <strong className="text-[var(--text)]">{draft.availabilityHrs ?? 5}</strong></label>
              <input id="hrs" type="range" min={1} max={40} value={draft.availabilityHrs ?? 5} onChange={(e) => set({ availabilityHrs: Number(e.target.value) })} className="w-full accent-[var(--color-accent-500)]" /></div>
            <Select label="Individual or team?" value={draft.participationPref ?? 'either'} onChange={(e) => set({ participationPref: e.target.value as Profile['participationPref'] })}><option value="either">Either</option><option value="individual">Individual</option><option value="team">Team</option></Select>
            <Select label="Preferred format (optional)" value={draft.preferredFormat ?? ''} onChange={(e) => set({ preferredFormat: (e.target.value || null) as Profile['preferredFormat'] })}><option value="">No preference</option><option value="online">Online</option><option value="offline">In person</option><option value="hybrid">Hybrid</option></Select>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <Toggle checked={!!draft.openToTeam} onChange={(v) => set({ openToTeam: v })} label="Let other students find me for teams" description="Off by default. When on, students building a team can see your name, skills and availability in Team Builder — never your email." />
            </div></div>)}
          {step === 4 && (<div><h1 className="text-lg font-semibold mb-1">Have a resume? <span className="text-muted font-normal text-sm">(optional)</span></h1><p className="text-sm text-muted mb-4">We'll pull out skills, projects and more — you choose what to keep.</p>
            {profile.data && <ResumeImport profile={profile.data} />}</div>)}

          {touched && problem && <p className="text-sm text-danger-500 mt-4" role="alert">{problem}</p>}
          <div className="flex items-center justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            {step < STEPS.length - 1 ? <Button onClick={next} loading={save.isPending}>Continue</Button> : <Button onClick={() => save.mutate(true)} loading={save.isPending}>Finish</Button>}
          </div>
        </Card>
        {step === 4 && <div className="mt-4"><Notice>You can import a resume or edit any of this later from your profile.</Notice></div>}
      </div>
    </div>
  )
}
