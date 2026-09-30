import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { profileService } from '../lib/services'
import { ChipSelector } from '../components/common/ChipSelector'
import { SKILL_OPTIONS, INTEREST_OPTIONS } from '../constants'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SkeletonCard } from '../components/ui/primitives'
import { ResumeUploadCard } from '../components/common/ResumeUploadCard'

export function ProfilePage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['profile'], queryFn: profileService.get })
  const [form, setForm] = useState<{ year: string; branch: string; skills: string[]; interests: string[]; experience_level: string; availability_hrs: number } | null>(null)

  useEffect(() => {
    if (data) setForm({ year: data.year ?? '', branch: data.branch ?? '', skills: data.skills, interests: data.interests, experience_level: data.experience_level, availability_hrs: data.availability_hrs })
  }, [data])

  const mutation = useMutation({
    mutationFn: () => profileService.update(form!),
    onSuccess: () => { toast.success('Profile saved'); qc.invalidateQueries({ queryKey: ['profile'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save'),
  })

  if (isLoading || !form || !data) return <SkeletonCard />

  const missing: string[] = []
  if (form.skills.length < 3) missing.push('skills')
  if (form.interests.length === 0) missing.push('interests')
  if (!form.branch) missing.push('branch')

  return (
    <div>
      <h1 className="text-2xl font-semibold">{data.name}</h1>
      <p className="text-muted text-sm mb-6">{data.email}</p>

      {missing.length > 0 && (
        <Card className="p-4 mb-6 text-sm">
          Add {missing.join(' and ')} to improve recommendation quality.
        </Card>
      )}

      <ResumeUploadCard />

      <Card className="p-5 mb-4 space-y-4">
        <h2 className="text-sm font-medium">About</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          <Input label="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-sm font-medium mb-3">Skills</h2>
        <ChipSelector options={SKILL_OPTIONS} selected={form.skills} onChange={(v) => setForm({ ...form, skills: v })} />
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-sm font-medium mb-3">Interests</h2>
        <ChipSelector options={INTEREST_OPTIONS} selected={form.interests} onChange={(v) => setForm({ ...form, interests: v })} />
      </Card>

      <Card className="p-5 mb-6">
        <h2 className="text-sm font-medium mb-3">Availability</h2>
        <input type="range" min={1} max={30} value={form.availability_hrs} onChange={(e) => setForm({ ...form, availability_hrs: Number(e.target.value) })} className="w-full" />
        <div className="text-sm mt-2">{form.availability_hrs} hrs/week</div>
      </Card>

      <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>Save changes</Button>
    </div>
  )
}
