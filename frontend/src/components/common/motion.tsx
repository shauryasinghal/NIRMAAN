import { motion, type Variants, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Fades + rises into view once, when scrolled into the viewport. */
export function ScrollReveal({
  children, delay = 0, y = 16, className,
}: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/** Parent for staggered children — pair with <StaggerItem>. */
export function Stagger({ children, className, gap = 0.08 }: { children: ReactNode; className?: string; gap?: number }) {
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: gap } },
  }
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={container}>
      {children}
    </motion.div>
  )
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={itemVariants}>{children}</motion.div>
}

/** Lifts a surface on hover — for cards that represent a clickable/interactive object. */
export function HoverLift({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Simple fade+rise entrance, for content that should appear once mounted (not scroll-gated). */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}
