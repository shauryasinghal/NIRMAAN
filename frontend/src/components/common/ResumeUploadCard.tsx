import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Upload, Check } from 'lucide-react'
import { resumeService } from '../../lib/services'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'

interface Extracted {
  name: string | null
  email: string | null
  github: string | null
  linkedin: string | null
  existingSkills: string[]
  newSkills: string[]
}

export function ResumeUploadCard() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => resumeService.upload(file),
    onSuccess: (res) => {
      setExtracted(res.extracted)
      setSelectedSkills(res.extracted.newSkills)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not read this resume'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => resumeService.confirm({ skillsToAdd: selectedSkills }),
    onSuccess: () => {
      toast.success('Profile updated from resume')
      qc.invalidateQueries({ queryKey: ['profile'] })
      setExtracted(null)
    },
  })

  const handleFile = (file: File | undefined) => {
    if (!file) return
    uploadMutation.mutate(file)
  }

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]))
  }

  return (
    <Card variant="elevated" className="p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={16} className="text-accent-500" />
        <h2 className="text-sm font-medium">Import from resume</h2>
      </div>
      <p className="text-xs text-muted mb-3">
        PDF or DOCX, up to 5MB. Uses keyword matching against a known skill list — not an AI model — and never
        changes your profile until you confirm what to keep.
      </p>

      {!extracted && (
        <>
          <input
            ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button size="sm" variant="secondary" loading={uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Upload resume
          </Button>
        </>
      )}

      {extracted && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted mb-2">We found these details — review before applying:</p>
          <dl className="text-sm space-y-1.5 mb-4">
            {extracted.name && <div><dt className="inline text-xs text-muted">Name: </dt><dd className="inline">{extracted.name}</dd></div>}
            {extracted.email && <div><dt className="inline text-xs text-muted">Email found: </dt><dd className="inline">{extracted.email}</dd></div>}
            {extracted.github && <div><dt className="inline text-xs text-muted">GitHub: </dt><dd className="inline">{extracted.github}</dd></div>}
            {extracted.linkedin && <div><dt className="inline text-xs text-muted">LinkedIn: </dt><dd className="inline">{extracted.linkedin}</dd></div>}
          </dl>

          {extracted.newSkills.length > 0 ? (
            <>
              <p className="text-xs font-medium text-muted mb-2">New skills found (select which to add):</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {extracted.newSkills.map((s) => {
                  const active = selectedSkills.includes(s)
                  return (
                    <button
                      key={s} onClick={() => toggleSkill(s)}
                      className="text-xs px-3 py-1.5 rounded-full border capitalize flex items-center gap-1"
                      style={{ borderColor: active ? 'var(--color-accent-500)' : 'var(--border)', color: active ? 'var(--color-accent-500)' : 'inherit' }}
                    >
                      {active && <Check size={11} />} {s}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted mb-4">No new skills found beyond what's already on your profile.</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" loading={confirmMutation.isPending} disabled={selectedSkills.length === 0} onClick={() => confirmMutation.mutate()}>
              Add {selectedSkills.length} skill{selectedSkills.length === 1 ? '' : 's'} to profile
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExtracted(null)}>Ignore</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
