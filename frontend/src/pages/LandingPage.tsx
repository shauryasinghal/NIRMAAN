import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, Users, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { NirmaanLogo } from '../components/common/NirmaanMark'
import { ScrollReveal, Stagger, StaggerItem, EASE_OUT } from '../components/common/motion'
import { OpportunityMatchVisual } from '../components/common/visuals/OpportunityMatchVisual'
import { TeamNetworkVisual } from '../components/common/visuals/TeamNetworkVisual'
import { OriginalityFieldVisual } from '../components/common/visuals/OriginalityFieldVisual'

const FRICTIONS = [
  { n: '01', label: 'SEARCH', copy: 'Thousands of opportunities. Very few actually fit your skill level.' },
  { n: '02', label: 'TEAM', copy: "Existing friend circles don't guarantee complementary skills." },
  { n: '03', label: 'IDEA', copy: 'Originality is often questioned too late — after weeks of work.' },
]

const STEPS = [
  { n: '01', title: 'Build profile', copy: 'Skills, interests, experience and availability — the signal everything else runs on.' },
  { n: '02', title: 'Discover', copy: 'Opportunities ranked by an explainable fit score — with the reasons and the blockers shown.' },
  { n: '03', title: 'Build', copy: 'A skill-complementary team, not just whoever you already know.' },
  { n: '04', title: 'Validate', copy: 'Your idea screened against prior work before you commit weeks.' },
  { n: '05', title: 'Move forward', copy: 'One dashboard, all three engines, a confident next step.' },
]

const TECH = [
  { label: 'Explainable fit scoring', note: '8 weighted signals — skills, interests, experience, format, deadline, behaviour — every score reproducible and itemised' },
  { label: 'Skill-coverage team builder', note: 'Greedy set-cover on marginal contribution; diversity means skills and roles, never demographics' },
  { label: 'MiniLM embeddings + pgvector', note: '384-dimensional sentence embeddings searched with cosine similarity in Postgres (HNSW)' },
  { label: 'Supabase Auth + Row Level Security', note: 'Email or Google sign-in; every table locked to its owner in the database itself' },
  { label: 'FastAPI + React 19', note: 'Typed API with a single error contract; verified Supabase tokens on every request' },
  { label: 'Human review with an audit trail', note: 'High-similarity ideas go to reviewers; every decision is immutable and logged' },
]

function FloatingNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <motion.header
      className="sticky top-0 z-30 transition-colors duration-300"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--bg) 80%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <NirmaanLogo />
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted">
          <a href="#intelligence" className="hover:text-[var(--text)] transition-colors">Intelligence</a>
          <a href="#how-it-works" className="hover:text-[var(--text)] transition-colors">How it works</a>
          <a href="#technology" className="hover:text-[var(--text)] transition-colors">Technology</a>
        </nav>
        <div className="flex gap-2">
          <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
          <Link to="/register"><Button size="sm">Get started</Button></Link>
        </div>
      </div>
    </motion.header>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper dark:bg-navy-950 overflow-x-hidden">
      <FloatingNav />

      {/* HERO */}
      <section className="relative">
        {/* backdrop lives on its own layer so it can fade into the page instead of ending in a hard edge */}
        <div aria-hidden className="absolute inset-0 bg-grid bg-radial-glow pointer-events-none [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center relative">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
            <p className="text-xs font-medium text-accent-500 tracking-[0.2em] mb-4">THE AI OPERATING SYSTEM FOR STUDENT INNOVATION</p>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: EASE_OUT }}
            className="text-4xl md:text-6xl font-semibold tracking-tight text-navy-900 dark:text-white leading-[1.05]"
          >
            Build what comes next.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: EASE_OUT }}
            className="text-sm md:text-base text-muted mt-5 max-w-lg mx-auto leading-relaxed"
          >
            Find opportunities that fit. Build teams that complement. Validate ideas before you build.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65, ease: EASE_OUT }}
            className="flex items-center justify-center gap-3 mt-8"
          >
            <Link to="/register"><Button size="lg">Start Building <ArrowRight size={16} /></Button></Link>
            <a href="#intelligence"><Button variant="secondary" size="lg">Explore</Button></a>
          </motion.div>

          {/* Hero product composition — three real engine visuals, connected */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.85, ease: EASE_OUT }}
            className="mt-16 grid sm:grid-cols-3 gap-4 items-center"
            role="img" aria-label="Illustration of the three NIRMAAN engines. Example values only."
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }} className="flex justify-center">
              <OpportunityMatchVisual animate={false} />
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }} className="flex justify-center">
              <Card variant="elevated" className="p-4 flex items-center justify-center">
                <TeamNetworkVisual compact />
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="flex justify-center">
              <Card variant="elevated" className="p-4 flex flex-col items-center">
                <div className="text-sm font-semibold text-success-500 text-center">No significant match found</div>
                <div className="text-[10px] text-muted uppercase tracking-wide mt-1">Originality signal</div>
              </Card>
            </motion.div>
          </motion.div>
          <p className="text-[11px] text-muted mt-3">Illustration — example values, not live data.</p>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="max-w-4xl mx-auto px-6 py-24 border-t" style={{ borderColor: 'var(--border)' }}>
        <ScrollReveal>
          <h2 className="text-2xl md:text-3xl font-semibold mb-12 max-w-lg">Student innovation is fragmented.</h2>
        </ScrollReveal>
        <Stagger className="grid md:grid-cols-3 gap-8">
          {FRICTIONS.map((f) => (
            <StaggerItem key={f.n}>
              <div className="text-xs text-muted mb-2">{f.n}</div>
              <h3 className="text-sm font-semibold tracking-wide mb-2">{f.label}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.copy}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* INTELLIGENCE */}
      <section id="intelligence" className="max-w-5xl mx-auto px-6 py-24 border-t" style={{ borderColor: 'var(--border)' }}>
        <ScrollReveal className="text-center mb-16">
          <p className="text-xs font-medium text-accent-500 tracking-[0.2em] mb-3">NIRMAAN INTELLIGENCE</p>
          <h2 className="text-2xl md:text-3xl font-semibold">Three engines. One connected system.</h2>
        </ScrollReveal>

        <div className="space-y-16">
          <EnginePanel
            icon={Compass} tag="DISCOVER" title="Opportunity Intelligence"
            copy="Find the opportunities that fit you — content-based ranking against your actual skill and interest profile, not recency."
            visual={<OpportunityMatchVisual />}
          />
          <EnginePanel
            icon={Users} tag="BUILD" title="Team Intelligence" reverse
            copy="Start from an opportunity's real requirements. NIRMAAN finds teammates who cover what's missing, and explains every pick."
            visual={<Card variant="elevated" className="p-5 flex justify-center"><TeamNetworkVisual /></Card>}
          />
          <EnginePanel
            icon={ShieldCheck} tag="VALIDATE" title="Originality Intelligence"
            copy="Your idea, embedded and searched against a comparison corpus with pgvector — a screening signal, never a verdict, with human review for close matches."
            visual={<Card variant="elevated" className="p-5 flex justify-center"><OriginalityFieldVisual /></Card>}
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="max-w-3xl mx-auto px-6 py-24 border-t" style={{ borderColor: 'var(--border)' }}>
        <ScrollReveal>
          <p className="text-xs font-medium text-accent-500 tracking-[0.2em] mb-10">HOW IT WORKS</p>
        </ScrollReveal>
        <div className="space-y-10">
          {STEPS.map((s) => (
            <ScrollReveal key={s.n}>
              <div className="flex gap-6 items-baseline">
                <span className="text-2xl font-semibold text-muted/50 w-10 shrink-0">{s.n}</span>
                <div>
                  <h3 className="text-base font-medium mb-1">{s.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{s.copy}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* TECHNICAL CREDIBILITY */}
      <section id="technology" className="max-w-4xl mx-auto px-6 py-24 border-t" style={{ borderColor: 'var(--border)' }}>
        <ScrollReveal>
          <p className="text-xs font-medium text-accent-500 tracking-[0.2em] mb-8">UNDER THE HOOD</p>
        </ScrollReveal>
        <Stagger className="grid sm:grid-cols-2 gap-3">
          {TECH.map((t) => (
            <StaggerItem key={t.label}>
              <div className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)' }}>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[11px] text-muted mt-1">{t.note}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-3xl mx-auto px-6 py-28 text-center border-t" style={{ borderColor: 'var(--border)' }}>
        <ScrollReveal>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-8 leading-tight">
            Your next innovation<br />starts with the right signal.
          </h2>
          <Link to="/register"><Button size="lg">Enter NIRMAAN <ArrowRight size={16} /></Button></Link>
        </ScrollReveal>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-10 text-xs text-muted border-t" style={{ borderColor: 'var(--border)' }}>
        NIRMAAN — GLA University B.Tech CSE (AI/ML) mini-project, Team Code Blooded (T-102).
      </footer>
    </div>
  )
}

function EnginePanel({
  icon: Icon, tag, title, copy, visual, reverse = false,
}: {
  icon: typeof Compass; tag: string; title: string; copy: string; visual: React.ReactNode; reverse?: boolean
}) {
  return (
    <div className={`grid md:grid-cols-2 gap-8 items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
      <ScrollReveal>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center mb-4 bg-accent-500/10">
          <Icon size={18} className="text-accent-500" />
        </div>
        <p className="text-[11px] font-medium text-accent-500 tracking-wide mb-1.5">{tag}</p>
        <h3 className="text-xl font-semibold mb-3">{title}</h3>
        <p className="text-sm text-muted leading-relaxed max-w-md">{copy}</p>
      </ScrollReveal>
      <ScrollReveal delay={0.1} className="flex justify-center">
        {visual}
      </ScrollReveal>
    </div>
  )
}
