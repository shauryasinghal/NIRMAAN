import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { Bell, Plus, Trash2, Info, PlayCircle } from 'lucide-react'
import { savedSearchService, alertEvaluationService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { EmptyState, SkeletonCard } from '../components/ui/primitives'
import type { RecommendedOpportunity } from '../types'

export function SmartAlertsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['saved-searches'], queryFn: savedSearchService.list })
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [skill, setSkill] = useState('')
  const [results, setResults] = useState<Record<string, { matchCount: number; items: RecommendedOpportunity[] }>>({})

  const createMutation = useMutation({
    mutationFn: () => savedSearchService.create({ name, domain: domain || undefined, skill: skill || undefined }),
    onSuccess: () => {
      toast.success('Alert saved')
      setName(''); setDomain(''); setSkill('')
      qc.invalidateQueries({ queryKey: ['saved-searches'] })
    },
  })
  const toggleMutation = useMutation({
    mutationFn: (s: { id: string; name: string; domain?: string | null; skill?: string | null; enabled: boolean }) =>
      savedSearchService.update(s.id, { name: s.name, domain: s.domain ?? undefined, skill: s.skill ?? undefined, enabled: !s.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => savedSearchService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  })
  const evaluateMutation = useMutation({
    mutationFn: (id: string) => alertEvaluationService.evaluate(id),
    onSuccess: (res, id) => setResults((prev) => ({ ...prev, [id]: res })),
  })

  const items = data?.items ?? []

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Smart Alerts</h1>
      <p className="text-muted text-sm mb-4">Define what you want NIRMAAN to watch for.</p>

      <Card variant="highlight" className="p-4 mb-6 flex gap-3 items-start">
        <Info size={16} className="text-accent-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted leading-relaxed">
          Alerts are saved for real. What's not built yet: a background job that evaluates them automatically and
          sends a notification without you asking — that needs a scheduler this environment doesn't run. What
          <span className="font-medium"> is</span> real: hit "Check now" on any alert below to evaluate it against
          your current recommendations right now.
        </p>
      </Card>

      <Card variant="elevated" className="p-5 mb-6 space-y-3">
        <Input label="Alert name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Remote AI hackathons" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="AI/ML" />
          <Input label="Skill (optional)" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="python" />
        </div>
        <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!name.trim()}>
          <Plus size={14} /> Create alert
        </Button>
      </Card>

      {isLoading && <SkeletonCard />}
      {!isLoading && items.length === 0 && <EmptyState icon={Bell} title="No alerts yet" description="Create one above to get started." />}

      <div className="space-y-2">
        {items.map((s) => (
          <Card key={s.id} variant="interactive" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted mt-0.5">
                  {[s.domain, s.skill].filter(Boolean).join(' · ') || 'No filters set'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" loading={evaluateMutation.isPending && evaluateMutation.variables === s.id} onClick={() => evaluateMutation.mutate(s.id)}>
                  <PlayCircle size={13} /> Check now
                </Button>
                <button
                  onClick={() => toggleMutation.mutate(s)}
                  className={`text-xs px-2.5 py-1 rounded-full ${s.enabled ? 'bg-success-500/10 text-success-500' : 'bg-black/[0.05] dark:bg-white/[0.08] text-muted'}`}
                >
                  {s.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button onClick={() => removeMutation.mutate(s.id)} className="p-1.5 rounded-lg text-muted hover:text-danger-500" aria-label="Delete alert">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {results[s.id] && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs text-muted mb-2">{results[s.id].matchCount} match{results[s.id].matchCount === 1 ? '' : 'es'} right now</p>
                <div className="space-y-1.5">
                  {results[s.id].items.slice(0, 3).map((o) => (
                    <Link key={o.id} to={`/opportunities/${o.id}`} className="flex justify-between text-xs hover:text-accent-500">
                      <span className="truncate">{o.title}</span>
                      <span className="text-accent-500 shrink-0 ml-2">{o.fitScore}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
