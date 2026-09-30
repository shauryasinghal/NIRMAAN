import { motion } from 'framer-motion'
import { Check, Triangle } from 'lucide-react'
import { EASE_OUT } from '../motion'

const MATCHED = ['Python', 'Machine Learning', 'NLP']
const MISSING = ['Cloud']

export function OpportunityMatchVisual({ animate = true }: { animate?: boolean }) {
  return (
    <div className="rounded-xl surface-elevated p-4 w-full max-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wide text-muted">Opportunity match</span>
        <motion.span
          className="text-lg font-semibold text-accent-500"
          initial={animate ? { opacity: 0 } : false}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          94%
        </motion.span>
      </div>
      <div className="text-sm font-medium mb-2">Smart India Hackathon 2026</div>
      <div className="flex flex-wrap gap-1.5">
        {MATCHED.map((s, i) => (
          <motion.span
            key={s}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success-500/10 text-success-500"
            initial={animate ? { opacity: 0, x: -6 } : false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.08, duration: 0.3, ease: EASE_OUT }}
          >
            <Check size={9} /> {s}
          </motion.span>
        ))}
        {MISSING.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-warning-500/10 text-warning-500">
            <Triangle size={9} /> {s}
          </span>
        ))}
      </div>
    </div>
  )
}
