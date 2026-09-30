import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { Users, Sparkles, Target } from 'lucide-react'
import { ChipSelector } from '../components/common/ChipSelector'
import { SKILL_OPTIONS } from '../constants'
import { teamService } from '../lib/services'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState, ProcessingState } from '../components/ui/primitives'
import type { TeamResult } from '../types'

export function TeamBuilderPage() {
  const [params] = useSearchParams()
  const opportunityId = params.get('opportunityId')
  const paramSkills = params.get('skills')
  const paramTeamSize = params.get('teamSize')

  const [skills, setSkills] = useState<string[]>(
    paramSkills ? paramSkills.split(',').filter(Boolean) : ['react', 'python', 'machine learning', 'ui/ux'],
  )
  const [teamSize, setTeamSize] = useState(paramTeamSize ? Number(paramTeamSize) : 4)
  const mutation = useMutation({
    mutationFn: () => teamService.suggest({ target_skills: skills, team_size: teamSize }),
  })

  const chartData = mutation.data
    ? Object.entries(mutation.data.coverage).map(([skill, covered]) => ({ skill, value: covered ? 100 : 0 }))
    : []

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Build the right team.</h1>
      <p className="text-muted text-sm mb-6">Skill-complementarity graph matching — not just who shares the most skills with you.</p>

      {opportunityId && (
        <Card variant="highlight" className="p-4 mb-6 flex items-start gap-3">
          <Target size={16} className="text-accent-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Building for a specific opportunity</p>
            <p className="text-xs text-muted mt-0.5">
              Target skills and team size below were pre-filled from{' '}
              <Link to={`/opportunities/${opportunityId}`} className="text-accent-500 hover:underline">that opportunity's requirements</Link>.
            </p>
          </div>
        </Card>
      )}

      <Card variant="elevated" className="p-5 mb-6">
        <h2 className="text-sm font-medium mb-3">1. What skills does this need?</h2>
        <ChipSelector options={SKILL_OPTIONS} selected={skills} onChange={setSkills} />

        <h2 className="text-sm font-medium mt-5 mb-2">2. Team size</h2>
        <div className="flex gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n} onClick={() => setTeamSize(n)}
              className="w-10 h-10 rounded-lg border text-sm transition-colors"
              style={{ borderColor: teamSize === n ? 'var(--color-accent-500)' : 'var(--border)', color: teamSize === n ? 'var(--color-accent-500)' : 'inherit' }}
            >{n}</button>
          ))}
        </div>

        <Button className="mt-5" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={skills.length === 0}>
          <Users size={16} /> Generate team
        </Button>
      </Card>

      {mutation.isPending && <ProcessingState label="Mapping complementary skills across the candidate pool…" />}
      {mutation.isError && <p className="text-sm text-danger-500">{(mutation.error as Error).message}</p>}

      {mutation.data && <TeamResultView result={mutation.data} chartData={chartData} />}
      {!mutation.data && !mutation.isPending && (
        <EmptyState icon={Sparkles} title="No team generated yet" description="Choose target skills above and generate a team." />
      )}
    </div>
  )
}

function TeamResultView({ result, chartData }: { result: TeamResult; chartData: { skill: string; value: number }[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
    <Card variant="elevated" className="p-5">
      <div className="flex gap-8 mb-5">
        <Stat label="Diversity score" value={result.diversityScore.toFixed(2)} />
        <Stat label="Coverage score" value={`${Math.round(result.coverageScore * 100)}%`} />
      </div>

      <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Required skills</h3>
      <div className="h-[140px] mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.value === 100 ? 'var(--color-success-500)' : 'var(--color-danger-500)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted mb-4">{result.reason}</p>

      <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Team members</h3>
      <div className="space-y-2">
        {result.members.map((m) => (
          <div key={m.id} className="border rounded-lg p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="font-medium text-sm">{m.name}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {m.matchedSkills.map((s) => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-success-500/10 text-success-500 capitalize">{s}</span>
              ))}
              {m.complementarySkills.map((s) => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-500 capitalize">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold text-accent-500">{value}</div>
    </div>
  )
}
