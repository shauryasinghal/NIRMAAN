import { motion } from 'framer-motion'

// Illustrative scatter representing "your idea" against a prior-idea corpus in
// embedding space — a concept visual, not a plot of real embeddings.
const NEIGHBORS = [
  { x: 60, y: 40 }, { x: 200, y: 35 }, { x: 40, y: 130 }, { x: 220, y: 120 },
  { x: 90, y: 150 }, { x: 170, y: 150 }, { x: 30, y: 80 }, { x: 230, y: 75 },
]

export function OriginalityFieldVisual() {
  return (
    <div className="w-full max-w-[280px]">
      <svg viewBox="0 0 260 170" className="w-full h-auto">
        {NEIGHBORS.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x} cy={p.y} r="4"
            fill="var(--text-muted)" fillOpacity="0.4"
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 0.4, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          />
        ))}
        <motion.line
          x1={130} y1={90} x2={200} y2={35}
          stroke="var(--color-warning-500)" strokeWidth="1.5" strokeDasharray="3 3"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
        />
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4, type: 'spring', stiffness: 260, damping: 18 }}
        >
          <path
            d="M130 82 l4 8 9 1 -6.5 6.5 1.5 9 -8-4.5 -8 4.5 1.5-9 -6.5-6.5 9-1z"
            fill="var(--color-accent-500)"
          />
        </motion.g>
        <text x="130" y="112" textAnchor="middle" fontSize="9" fill="var(--text-muted)">your idea</text>
      </svg>
    </div>
  )
}
