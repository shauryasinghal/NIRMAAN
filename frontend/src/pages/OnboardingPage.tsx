import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ChipSelector } from '../components/common/ChipSelector'
import { SKILL_OPTIONS, INTEREST_OPTIONS, EXPERIENCE_LEVELS } from '../constants'
import { profileService } from '../lib/services'

const STEPS = ['About you', 'Skills', 'Interests', 'Experience', 'Availability', 'Review']

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    year: '3', branch: 'CSE (AI/ML)', skills: [] as string[], interests: [] as string[],
    experience_level: 'beginner', availability_hrs: 8,
  })

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const canProceed = () => {
    if (step === 1) return data.skills.length > 0
    if (step === 2) return data.interests.length > 0
    return true
  }

  const finish = async () => {
    setSaving(true)
    try {
      await profileService.update(data)
      toast.success('Your NIRMAAN profile is ready.')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-accent-500">STEP {step + 1} OF {STEPS.length}</span>
          <span className="text-xs text-muted">{STEPS[step]}</span>
        </div>
        <div className="h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] mb-8 overflow-hidden">
          <div className="h-full bg-accent-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="surface rounded-xl p-6 min-h-[320px] flex flex-col">
          <div className="flex-1">
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold mb-1">Tell us about you</h2>
                <Input label="Year" value={data.year} onChange={(e) => setData({ ...data, year: e.target.value })} />
                <Input label="Branch" value={data.branch} onChange={(e) => setData({ ...data, branch: e.target.value })} />
              </div>
            )}
            {step === 1 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">What are your skills?</h2>
                <p className="text-sm text-muted mb-4">Pick as many as apply — this drives your opportunity matches.</p>
                <ChipSelector options={SKILL_OPTIONS} selected={data.skills} onChange={(v) => setData({ ...data, skills: v })} />
              </div>
            )}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">What are you interested in?</h2>
                <p className="text-sm text-muted mb-4">Domains you'd like to work in.</p>
                <ChipSelector options={INTEREST_OPTIONS} selected={data.interests} onChange={(v) => setData({ ...data, interests: v })} />
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Experience level</h2>
                <div className="flex gap-2">
                  {EXPERIENCE_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setData({ ...data, experience_level: lvl })}
                      className="flex-1 capitalize text-sm py-3 rounded-lg border transition-colors"
                      style={{
                        borderColor: data.experience_level === lvl ? 'var(--color-accent-500)' : 'var(--border)',
                        color: data.experience_level === lvl ? 'var(--color-accent-500)' : 'inherit',
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 4 && (
              <div>
                <h2 className="text-lg font-semibold mb-1">Weekly availability</h2>
                <p className="text-sm text-muted mb-4">Roughly how many hours a week can you commit?</p>
                <input
                  type="range" min={1} max={30} value={data.availability_hrs}
                  onChange={(e) => setData({ ...data, availability_hrs: Number(e.target.value) })}
                  className="w-full"
                />
                <div className="text-center text-2xl font-semibold mt-3">{data.availability_hrs} <span className="text-sm text-muted font-normal">hrs/week</span></div>
              </div>
            )}
            {step === 5 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Review your profile</h2>
                <dl className="text-sm space-y-2">
                  <Row label="Year / Branch" value={`${data.year} · ${data.branch}`} />
                  <Row label="Skills" value={data.skills.join(', ') || '—'} />
                  <Row label="Interests" value={data.interests.join(', ') || '—'} />
                  <Row label="Experience" value={data.experience_level} />
                  <Row label="Availability" value={`${data.availability_hrs} hrs/week`} />
                </dl>
              </div>
            )}
          </div>

          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={back} disabled={step === 0}><ChevronLeft size={16} /> Back</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={!canProceed()}>Next <ChevronRight size={16} /></Button>
            ) : (
              <Button onClick={finish} loading={saving}><Check size={16} /> Finish</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2" style={{ borderColor: 'var(--border)' }}>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right capitalize max-w-[60%]">{value}</dd>
    </div>
  )
}
