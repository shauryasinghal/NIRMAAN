import { motion } from 'framer-motion'

// A small fixed layout representing 4 candidates covering 4 complementary skills —
// illustrative of the real graph-matching concept, not a live data render.
const NODES = [
  { id: 'ml', label: 'ML', x: 130, y: 18 },
  { id: 'react', label: 'React', x: 30, y: 90 },
  { id: 'ux', label: 'UX', x: 230, y: 90 },
  { id: 'backend', label: 'Backend', x: 130, y: 150 },
]
const EDGES: [string, string][] = [['ml', 'react'], ['ml', 'ux'], ['react', 'backend'], ['ux', 'backend']]

export function TeamNetworkVisual({ compact = false }: { compact?: boolean }) {
  const find = (id: string) => NODES.find((n) => n.id === id)!
  return (
    <div className={compact ? 'w-[200px]' : 'w-full max-w-[280px]'}>
      <svg viewBox="0 0 260 170" className="w-full h-auto">
        {EDGES.map(([a, b], i) => {
          const pa = find(a), pb = find(b)
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke="var(--color-accent-500)" strokeWidth="1.5" strokeOpacity="0.35"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
            />
          )
        })}
        {NODES.map((n, i) => (
          <g key={n.id}>
            <motion.circle
              cx={n.x} cy={n.y} r="16"
              fill="var(--surface)" stroke="var(--color-accent-500)" strokeWidth="1.5"
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.1, type: 'spring', stiffness: 300, damping: 20 }}
            />
            <text x={n.x} y={n.y + 26} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
