// NIRMAAN judges' deck — every fact here was checked against the repository / today's runs (see EVIDENCE notes in speaker notes).
const pptxgen = require('pptxgenjs')
const path = require('path')
const { applyTheme } = require(process.env.SKILL_DIR + '/scripts/apply_theme.js')

          // Playwright result from today's run, e.g. "235"
const OUT = process.argv[2] || 'NIRMAAN_Judges_Presentation.pptx'
const IMG = (f) => path.join('/tmp/nirmaan-deck/img', f)

const HEX = { bg: '0A0F1E', card: '111A2E', muted: '9AA8C1', line: '22304D', cyan: '22D3EE', blue: '4F8CFF', violet: 'A78BFA', green: '34D399', amber: 'FBBF24', white: 'FFFFFF' }
const THEME = {
  name: 'NIRMAAN Dark', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.bg, lt1: HEX.white, dk2: HEX.card, lt2: HEX.muted, accent1: HEX.cyan, accent2: HEX.blue, accent3: HEX.violet, accent4: HEX.green, accent5: HEX.amber, accent6: HEX.line, hlink: HEX.cyan, folHlink: HEX.violet },
}

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'                      // 13.333 × 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
pres.title = 'NIRMAAN — The AI Operating System for Student Innovation'
pres.subject = 'Judges presentation'
pres.author = 'NIRMAAN team'
const C = pres.SchemeColor
const COL = { bg: C.text1, white: C.background1, card: C.text2, muted: C.background2, cyan: C.accent1, blue: C.accent2, violet: C.accent3, green: C.accent4, amber: C.accent5, line: C.accent6 }
const S = pres.shapes
const W = 13.333, M = 0.6, CW = W - 2 * M

// ── Layouts ────────────────────────────────────────────────────────────────────────────────────────────────
pres.defineSlideMaster({
  title: 'NIRMAAN_TITLE', background: { color: HEX.bg },
  objects: [{ text: { text: 'Team ID: T-102  |  Shaurya Singhal · Tahaseen Khan · Vedika Agarwal', options: { x: M, y: 6.92, w: 8, h: 0.3, fontSize: 11, color: COL.muted, margin: 0 } } }],
})
pres.defineSlideMaster({
  title: 'NIRMAAN_CONTENT', background: { color: HEX.bg },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: M, y: 0.38, w: 9, h: 0.3, fontSize: 11, bold: true, color: COL.cyan, charSpacing: 2, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.68, w: CW, h: 0.62, fontSize: 30, bold: true, color: COL.white, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
    { text: { text: 'NIRMAAN · The AI Operating System for Student Innovation', options: { x: M, y: 6.98, w: 7, h: 0.28, fontSize: 10, color: COL.muted, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 6.98, w: 0.6, h: 0.28, fontSize: 10, color: HEX.muted, align: 'right' },
})

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────
let n = 0
const name = (s) => `${s}-${++n}`
function T(slide, text, x, y, w, h, o = {}) {
  slide.addText(text, { x, y, w, h, margin: 0, fontSize: 14, color: COL.white, valign: 'top', isTextBox: true, objectName: name(o.objectName || 'text'), ...o })
}
function card(slide, x, y, w, h, o = {}) {
  slide.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: o.r ?? 0.1, fill: { color: o.fill || COL.card }, line: { color: o.line || COL.line, width: o.lw || 0.75, dashType: o.dash || 'solid' }, objectName: name(o.objectName || 'card') })
}
function arrow(slide, x1, y1, x2, y2, color = COL.muted, o = {}) {
  slide.addShape(S.LINE, { x: x1, y: y1, w: Math.max(x2 - x1, 0.001), h: Math.max(y2 - y1, 0.001), line: { color, width: o.width || 1.25, endArrowType: o.noHead ? undefined : 'triangle', dashType: o.dash || 'solid' }, objectName: name('arrow') })
}
function dot(slide, label, x, y, d, color, o = {}) {
  slide.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color: o.fill || COL.bg }, line: { color, width: 1.25 }, objectName: name('dot') })
  T(slide, label, x, y, d, d, { fontSize: o.fs || 12, bold: true, color, align: 'center', valign: 'middle', objectName: 'dot-label' })
}
function shot(slide, file, x, y, w, h) {   // screenshot in a thin rounded frame
  card(slide, x - 0.04, y - 0.04, w + 0.08, h + 0.08, { r: 0.06, fill: COL.line, line: COL.line })
  slide.addImage({ path: IMG(file), x, y, w, h, altText: `Screenshot of the running NIRMAAN app: ${file.replace('.png', '')}`, objectName: name('screenshot') })
}
const head = (slide, kicker, title) => { slide.addText(kicker, { placeholder: 'kicker' }); slide.addText(title, { placeholder: 'title' }) }

// ═════ 1 · PROBLEM & VISION ═══════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Problem' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_TITLE', sectionTitle: 'Problem' })
  s.addImage({ path: IMG('mark.png'), x: M, y: 0.6, w: 0.62, h: 0.62 * 1327 / 1170, altText: 'NIRMAAN logo mark', objectName: 'logo-mark' })
  T(s, 'NIRMAAN', M, 1.45, 6.2, 0.95, { fontSize: 60, bold: true, charSpacing: 6, valign: 'middle', objectName: 'deck-title' })
  T(s, 'The AI Operating System for Student Innovation', M, 2.42, 6.2, 0.45, { fontSize: 20, color: COL.cyan, objectName: 'deck-subtitle' })
  T(s, 'THE PROBLEM', M, 3.2, 6, 0.28, { fontSize: 11, bold: true, color: COL.muted, charSpacing: 2 })
  T(s, 'Students don’t lack listings. They lack help deciding which opportunity fits, who should build with them, and how their idea relates to existing work.', M, 3.5, 6.2, 1.15, { fontSize: 18 })
  T(s, 'Platforms like Unstop, Devpost and HackerEarth catalogue opportunities well; the decisions around them stay manual and disconnected.', M, 4.68, 6.2, 0.5, { fontSize: 12, color: COL.muted })

  const rx = 7.25, rw = W - M - rx
  T(s, 'TODAY · THREE DISCONNECTED DECISIONS', rx, 0.78, rw, 0.28, { fontSize: 11, bold: true, color: COL.muted, charSpacing: 2 })
  const pains = [
    ['Which opportunity fits me?', 'Listings are sorted by recency or popularity, not by fit.'],
    ['Who should I build with?', 'Teams form from friend circles; skill gaps go unnoticed.'],
    ['Has this idea been done?', 'Overlap with existing ideas often surfaces only at judging.'],
  ]
  pains.forEach(([q, d], i) => {
    const y = 1.15 + i * 1.08
    card(s, rx, y, rw, 0.95, { dash: 'dash', fill: COL.bg, line: COL.muted })
    dot(s, String(i + 1), rx + 0.22, y + 0.25, 0.45, COL.muted)
    T(s, q, rx + 0.9, y + 0.14, rw - 1.1, 0.36, { fontSize: 16, bold: true })
    T(s, d, rx + 0.9, y + 0.5, rw - 1.1, 0.34, { fontSize: 12, color: COL.muted })
  })

  T(s, 'WITH NIRMAAN · ONE CONNECTED WORKFLOW', M, 5.3, 8, 0.28, { fontSize: 11, bold: true, color: COL.cyan, charSpacing: 2 })
  const steps = [['DISCOVER', 'Ranked catalog'], ['UNDERSTAND', 'Fit · why / why not'], ['BUILD', 'AI Team Builder'], ['VALIDATE', 'Originality Checker'], ['APPLY', 'Tracker · alerts'], ['IMPROVE', 'Skill gaps · next action']]
  const gap = 0.36, pw = (CW - gap * 5) / 6
  steps.forEach(([k, d], i) => {
    const x = M + i * (pw + gap), core = i >= 1 && i <= 3
    card(s, x, 5.65, pw, 0.55, { r: 0.27, line: core ? COL.cyan : COL.line, lw: core ? 1.25 : 0.75 })
    T(s, k, x, 5.65, pw, 0.55, { fontSize: 14, bold: true, align: 'center', valign: 'middle', charSpacing: 1 })
    T(s, d, x, 6.28, pw, 0.3, { fontSize: 11, color: COL.muted, align: 'center' })
    if (i < 5) arrow(s, x + pw + 0.06, 5.925, x + pw + gap - 0.06, 5.925, COL.cyan)
  })
  s.addNotes(`Judging lens: problem understanding.
Open with the three decisions every student faces around an opportunity: which one fits, who to build with, and whether the idea already exists. These are one workflow, not three inconveniences — the opportunity's requirements drive the team, and the team's idea needs validating against prior work.
Source: problem statement in the final project report (Section 1.2). No market-size claims are made.
The six-stage workflow is what the product implements: discovery + fit explanation (Opportunity Recommender), Team Builder, Originality Checker, application tracker and alerts, skill-gap / next-best-action guidance.`)
}

// ═════ 2 · INNOVATION ═════════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Innovation' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'Innovation' })
  head(s, '02 · INNOVATION & ORIGINALITY', 'Three Intelligence Engines. One Connected Workflow.')
  const engines = [
    ['Opportunity Recommender', COL.cyan, 'Listings ranked by recency, not by fit.', '8 weighted signals (skills, interests, experience, deadline…). Unknown inputs are excluded, never guessed.', '0–100 fit score with reasons, blockers and the points each fix adds.'],
    ['AI Team Builder', COL.blue, 'Teams form from friend circles; skill gaps go unnoticed.', 'Greedy set-cover on each candidate’s marginal skill contribution. Opt-in students only; no demographics.', 'An explained team, skill coverage and a balance score; never padded.'],
    ['Originality Checker', COL.violet, 'Overlap with prior ideas is found late.', 'MiniLM-L6-v2 sentence embeddings, compared by cosine similarity in pgvector.', 'Closest matches with scores; ≥ 0.75 goes to human review. Not proof of plagiarism.'],
  ]
  const gap = 0.3, cw = (CW - 2 * gap) / 3, y0 = 1.5, ch = 4.0
  engines.forEach(([title, color, prob, mech, out], i) => {
    const x = M + i * (cw + gap)
    card(s, x, y0, cw, ch)
    T(s, `ENGINE ${i + 1}`, x + 0.25, y0 + 0.2, cw - 0.5, 0.24, { fontSize: 10, bold: true, color, charSpacing: 2 })
    T(s, title, x + 0.25, y0 + 0.44, cw - 0.5, 0.42, { fontSize: 20, bold: true, color, valign: 'middle' })
    const rows = [['PROBLEM', prob, 1.0, 0.75], ['MECHANISM', mech, 1.9, 1.1], ['OUTCOME', out, 3.0, 0.95]]
    rows.forEach(([k, v, dy, h]) => {
      T(s, k, x + 0.25, y0 + dy, cw - 0.5, 0.24, { fontSize: 10, bold: true, color: COL.muted, charSpacing: 2 })
      T(s, v, x + 0.25, y0 + dy + 0.25, cw - 0.5, h - 0.2, { fontSize: 14 })
    })
    arrow(s, x + cw / 2, y0 + ch, x + cw / 2, 5.7, color, { noHead: true })
  })
  // platform band
  card(s, M, 5.7, CW, 0.78, { line: COL.cyan, lw: 1 })
  T(s, 'One opportunity\ndrives all three', M + 0.25, 5.7, 1.9, 0.78, { fontSize: 14, bold: true, color: COL.cyan, valign: 'middle' })
  const chips = ['Its required skills', 'Build a team for this', 'Validate an idea for this', 'Next best action']
  const cx0 = M + 2.2, cgap = 0.45, chw = (CW - 2.2 - 0.2 - cgap * 3) / 4
  chips.forEach((c, i) => {
    const x = cx0 + i * (chw + cgap)
    card(s, x, 5.84, chw, 0.5, { r: 0.25, fill: COL.bg })
    T(s, c, x, 5.84, chw, 0.5, { fontSize: 14, align: 'center', valign: 'middle' })
    if (i < 3) arrow(s, x + chw + 0.08, 6.09, x + chw + cgap - 0.08, 6.09, COL.cyan)
  })
  T(s, [{ text: 'Our innovation lies in connecting established AI techniques into one explainable student-innovation workflow.', options: { bold: true, color: COL.white } }, { text: '  We do not claim new algorithms.', options: { color: COL.muted } }], M, 6.56, CW, 0.32, { fontSize: 13 })
  s.addNotes(`Judging lens: innovation and originality.
Innovation claim: connecting established techniques into one explainable workflow driven by a single opportunity. The underlying algorithms (content-based scoring, greedy set-cover, sentence embeddings) are established; NIRMAAN does not claim to have invented them (the report says the same).
Recommender (backend/app/engines/recommender.py): weights skill 0.30, behaviour 0.13, interest 0.12, experience 0.12, deadline 0.12, domain 0.10, participation 0.06, format 0.05. Unknown inputs are excluded and weights renormalised; score capped when nothing core is known. "Why not" blockers show counterfactual points.
Team Builder (engines/team_builder.py): greedy set-cover on marginal contribution; balance = 0.40 coverage + 0.25 role diversity + 0.25 complementarity + 0.10 non-redundancy. Only students who opted in appear.
Originality (engines/originality.py): all-MiniLM-L6-v2, 384-d, pgvector cosine. Thresholds: 0.45 "related work", 0.75 human review. Every result carries the disclaimer that similarity is not proof of plagiarism.
The chips are real links on the opportunity page ("Build a team for this", "Validate an idea for this").`)
}

// ═════ 3 · ARCHITECTURE ═══════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Architecture' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'Architecture' })
  head(s, '03 · SOLUTION APPROACH & ARCHITECTURE', 'From Student Profile to Actionable Intelligence')
  const cols = [
    ['FRONTEND', 1.9, 'React 19 + TypeScript', ['Vite · Tailwind CSS', 'TanStack Query', 'Supabase Auth client']],
    ['API', 1.9, 'FastAPI', ['JWT verification', 'Role checks', 'Rate limits']],
    ['SERVICES', 1.9, 'Domain services', ['Catalog & fit', 'Teams & ideas', 'Applications & alerts']],
    ['AI ENGINES', 2.85, null, null],
    ['DATA & VECTOR SEARCH', 2.2, 'Supabase PostgreSQL', ['Row-level security', 'pgvector · 384-d', 'pg_cron jobs']],
  ]
  const total = cols.reduce((a, c) => a + c[1], 0), gap = (CW - total) / 4
  const by = 1.85, bh = 3.05
  let x = M
  cols.forEach(([label, w, primary, items], i) => {
    const eng = i === 3
    T(s, label, x, 1.5, w, 0.28, { fontSize: 11, bold: true, color: eng ? COL.cyan : COL.muted, charSpacing: 2 })
    card(s, x, by, w, bh, eng ? { line: COL.cyan, lw: 1.25 } : {})
    if (!eng) {
      T(s, primary, x + 0.15, by + 0.15, w - 0.3, 0.7, { fontSize: 16, bold: true, align: 'center', valign: 'middle' })
      items.forEach((it, j) => {
        const yy = by + 1.0 + j * 0.62
        card(s, x + 0.15, yy, w - 0.3, 0.48, { r: 0.08, fill: COL.bg })
        T(s, it, x + 0.15, yy, w - 0.3, 0.48, { fontSize: 12, color: COL.muted, align: 'center', valign: 'middle' })
      })
    } else {
      ;[['Opportunity Recommender', '8-signal explainable fit', COL.cyan], ['AI Team Builder', 'Skill-coverage set-cover', COL.blue], ['Originality Checker', 'MiniLM embeddings + cosine', COL.violet]].forEach(([a, b, c], j) => {
        const yy = by + 0.15 + j * 0.86
        card(s, x + 0.15, yy, w - 0.3, 0.74, { r: 0.08, fill: COL.bg, line: c, lw: 1 })
        T(s, a, x + 0.27, yy + 0.08, w - 0.5, 0.32, { fontSize: 13, bold: true, color: c })
        T(s, b, x + 0.3, yy + 0.4, w - 0.6, 0.26, { fontSize: 11, color: COL.muted })
      })
      T(s, 'Pure, deterministic functions', x + 0.15, by + 2.72, w - 0.3, 0.26, { fontSize: 11, color: COL.muted, align: 'center' })
    }
    if (i < 4) arrow(s, x + w + 0.06, by + bh / 2, x + w + gap - 0.06, by + bh / 2, COL.cyan)
    x += w + gap
  })
  const flow = ['Student adds a profile, skills or an idea', 'API checks the token; the database enforces row-level security', 'An engine scores fit, builds a team or embeds the idea', 'Postgres + pgvector return listings, candidates, similar ideas', 'The UI shows results with reasons and limits']
  const fw = (CW - 4 * 0.2) / 5
  T(s, 'REQUEST FLOW', M, 5.12, 4, 0.26, { fontSize: 11, bold: true, color: COL.muted, charSpacing: 2 })
  flow.forEach((f, i) => {
    const fx = M + i * (fw + 0.2)
    dot(s, String(i + 1), fx, 5.5, 0.4, COL.cyan, { fs: 12 })
    T(s, f, fx + 0.5, 5.42, fw - 0.5, 0.62, { fontSize: 12, valign: 'middle' })
  })
  T(s, 'Optional, off by default: AI chat assistant · opportunity ingestion adapters.   Not used: Neo4j, FAISS (pgvector instead).', M, 6.4, CW, 0.3, { fontSize: 11, color: COL.muted })
  s.addNotes(`Judging lens: solution approach and architecture.
Verified against the repository: frontend/ (React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, supabase-js for the Supabase Auth session); backend/app/routers (FastAPI + Pydantic); backend/app/core (JWT verification against Supabase JWKS, role checks, rate limiter, security headers); backend/app/services (catalog, fit, dashboard, teams, ideas, applications, alerts …); backend/app/engines (pure, deterministic functions — no database, no clock); supabase/migrations (21 files: RLS on every table, pgvector HNSW index on 384-d embeddings, pg_cron jobs).
Per request: one transaction with SET LOCAL role + JWT claims, so row-level security applies to API queries too.
MiniLM is loaded once per process; if it cannot load, the originality feature reports itself unavailable instead of inventing a score.
Optional components (chat assistant via Anthropic/Gemini, ingestion adapters incl. a reviewed Unstop manifest) exist but are switched off by default.`)
}

// ═════ 4 · FEASIBILITY ════════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Feasibility' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'Feasibility' })
  head(s, '04 · TECHNICAL FEASIBILITY', 'Built, Tested, and Designed to Evolve')
  const lw = 5.35
  T(s, 'VERIFIED STACK', M, 1.5, lw, 0.28, { fontSize: 10, bold: true, color: COL.muted, charSpacing: 2 })
  card(s, M, 1.82, lw, 4.6)
  const stack = [
    ['Frontend', 'React 19 · TypeScript · Vite · Tailwind 4 · TanStack Query'],
    ['Backend', 'FastAPI · Pydantic 2 · SQLAlchemy 2 · Uvicorn'],
    ['Data', 'Supabase PostgreSQL · pgvector (HNSW) · pg_cron'],
    ['AI / ML', 'sentence-transformers · all-MiniLM-L6-v2 · deterministic scoring engines'],
    ['Security', 'Supabase Auth JWT · row-level security · rate limits · CSP'],
    ['Quality', 'pytest · Vitest · Playwright + axe · oxlint · GitHub Actions'],
  ]
  stack.forEach(([k, v], i) => {
    const y = 1.98 + i * 0.73
    T(s, k, M + 0.25, y, 1.15, 0.6, { fontSize: 13, bold: true, color: COL.cyan, valign: 'middle' })
    T(s, v, M + 1.45, y, lw - 1.65, 0.6, { fontSize: 13, valign: 'middle' })
    if (i < 5) s.addShape(S.LINE, { x: M + 0.25, y: y + 0.665, w: lw - 0.5, h: 0, line: { color: COL.line, width: 0.75 }, objectName: name('rule') })
  })

  const rx = M + lw + 0.35, rw = W - M - rx
  T(s, 'EXECUTED & PASSED · LOCAL RUN, 29 OCT 2026', rx, 1.5, rw, 0.28, { fontSize: 10, bold: true, color: COL.muted, charSpacing: 2 })
  const tiles = [['326', 'backend tests', 'pytest · real Postgres'], ['146', 'frontend tests', 'Vitest unit'], ['248', 'end-to-end tests', 'Playwright, full stack'], ['49', 'DB checks', 'RLS & role script']]
  const tg = 0.15, tw = (rw - 3 * tg) / 4
  tiles.forEach(([v, a, b], i) => {
    const x = rx + i * (tw + tg)
    card(s, x, 1.82, tw, 1.18, i === 3 ? { dash: 'dash' } : {})
    T(s, v, x + 0.15, 1.86, tw - 0.3, 0.55, { fontSize: 30, bold: true, color: COL.green, valign: 'middle' })
    T(s, a, x + 0.15, 2.4, tw - 0.3, 0.28, { fontSize: 12, bold: true })
    T(s, b, x + 0.15, 2.67, tw - 0.3, 0.26, { fontSize: 10, color: COL.muted })
  })
  T(s, [
    { text: 'Every collected test ran and passed: 0 failed, 0 skipped. ', options: { bold: true, color: COL.white } },
    { text: 'Three test suites + one database check script, not summed. Code: commit 6d9a4ae + uncommitted local work (adds 5 backend, 15 frontend tests).', options: { breakLine: true } },
    { text: 'CI (GitHub Actions) on 6d9a4ae, 22 Oct: ', options: { bold: true, color: COL.white } },
    { text: '321 backend · 131 frontend · 248 E2E (+1 CSP) · 49 DB checks, all passed.' },
  ], rx, 3.08, rw, 0.78, { fontSize: 11, color: COL.muted, paraSpaceAfter: 3 })

  const status = [
    ['IMPLEMENTED & TESTED', COL.green, ['Three engines + dashboard', 'Discovery, profile, resume import', 'Applications, alerts, notifications', 'Email auth, roles, reviewer & admin']],
    ['CONFIGURED · NOT VERIFIED LIVE', COL.amber, ['AI chat assistant (off by default; stub-tested)', 'Google sign-in (no full real round trip)', 'Calendar / Gmail connections']],
    ['NOT DEPLOYED', COL.muted, ['Vercel + Render configs only', 'Hosted Supabase: 21 migrations applied (checked 1 Oct)', 'Docker images not built']],
  ]
  const sg = 0.15, sw = (rw - 2 * sg) / 3
  status.forEach(([k, c, items], i) => {
    const x = rx + i * (sw + sg)
    card(s, x, 3.95, sw, 2.47, { line: c, lw: 1 })
    T(s, k, x + 0.18, 4.06, sw - 0.36, 0.42, { fontSize: 11, bold: true, color: c, charSpacing: 1 })
    s.addText(items.map((t, j) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: j < items.length - 1 } })),
      { x: x + 0.12, y: 4.53, w: sw - 0.27, h: 1.85, fontSize: 12, color: COL.white, valign: 'top', paraSpaceAfter: 4, margin: 0, isTextBox: true, objectName: name('status-list') })
  })
  T(s, 'Passing tests show the code behaves as specified in a local environment; they do not establish production readiness.', M, 6.52, CW, 0.3, { fontSize: 11, italic: true, color: COL.muted })
  s.addNotes(`Judging lens: technical feasibility.
VERIFIED TEST EVIDENCE (logs in report/presentation/evidence/):
• Local run, 29 Oct 2026, on commit 6d9a4ae plus the uncommitted local work: pytest 326 passed (0 failed); Vitest 146 passed in 14+2 files; Playwright E2E 248 passed in 10.3 min — 248 collected (npx playwright test --list), 248 executed, retries disabled, nothing skipped; Supabase DB security script 49 passed, 0 failed.
• The 49 are SQL checks run by supabase/tests/run.sh (RLS, grants, role escalation), not a test-framework suite.
• GitHub Actions CI on main 6d9a4ae (22 Oct 2026), committed code only: backend 321 passed, frontend 131 passed, DB 49 passed, E2E 248 passed + 1 CSP test (separate config).
• The local/CI difference is exactly the uncommitted test files: backend/tests/test_devseed_safety.py (5 tests) and frontend/src/test/google-*.test.tsx (15 tests).
• Also clean locally: tsc -b, production build, oxlint (0 errors, 3 warnings), migrations rebuilt from zero.
Deployment: Vercel/Render configs exist but deployment is not verified live (docs/DEPLOYMENT.md). Hosted Supabase migration listing last checked 1 Oct 2026. The chat assistant needs CHAT_ENABLED=true and a key; it is tested only against stubbed providers.`)
}

// ═════ 5 · USER JOURNEY ═══════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'User impact' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'User impact' })
  head(s, '05 · USER NEEDS & POTENTIAL IMPACT', 'Designed Around the Student Journey')
  const journey = [['DISCOVER', 'Catalog ranked by fit', COL.cyan, false], ['SELECT', 'Score, reasons, blockers', COL.cyan, true], ['BUILD A TEAM', 'Skill-coverage team', COL.blue, true], ['CHECK SIMILARITY', 'Closest prior ideas', COL.violet, true], ['PREPARE TO APPLY', 'Dashboard · see slide 7', COL.green, false]]
  const jg = 0.3, jw = (CW - 4 * jg) / 5
  journey.forEach(([k, d, c, shown], i) => {
    const x = M + i * (jw + jg)
    card(s, x, 1.45, jw, 0.46, { r: 0.23, line: shown ? c : COL.line, lw: shown ? 1.25 : 0.75 })
    T(s, `${i + 1}  ${k}`, x, 1.45, jw, 0.46, { fontSize: 12, bold: true, color: shown ? c : COL.white, align: 'center', valign: 'middle', charSpacing: 1 })
    T(s, d, x, 1.97, jw, 0.26, { fontSize: 11, color: COL.muted, align: 'center' })
    if (i < 4) arrow(s, x + jw + 0.06, 1.68, x + jw + jg - 0.06, 1.68, COL.muted)
  })
  const shots = [
    ['2', 'SELECT', COL.cyan, 'z-select.png', 'Why this one, and what’s missing?', 'Fit score with reasons, plus the points each missing skill would add.'],
    ['3', 'BUILD A TEAM', COL.blue, 'z-team.png', 'Who covers my skill gaps?', 'Required-skill coverage before and after; the team stops growing once nothing is added.'],
    ['4', 'CHECK SIMILARITY', COL.violet, 'z-originality.png', 'Has something like this been done?', 'Closest-match score, confidence and human review, not a plagiarism verdict.'],
  ]
  const g = 0.35, w = (CW - 2 * g) / 3, ih = w / 1.45
  shots.forEach(([n0, k, c, img, need, val], i) => {
    const x = M + i * (w + g)
    shot(s, img, x, 2.45, w, ih)
    T(s, [{ text: `${n0} · `, options: { color: c } }, { text: need }], x, 2.45 + ih + 0.14, w, 0.32, { fontSize: 14, bold: true })
    T(s, val, x, 2.45 + ih + 0.48, w, 0.5, { fontSize: 12, color: COL.muted })
  })
  card(s, M, 6.05, CW, 0.5, { line: COL.cyan, lw: 1 })
  T(s, [{ text: 'Intended impact  ', options: { bold: true, color: COL.cyan } }, { text: 'less guesswork in choosing, earlier sight of skill gaps and idea overlap, one place instead of scattered tools. Not yet measured with real users.' }],
    M + 0.25, 6.05, CW - 0.5, 0.5, { fontSize: 13, valign: 'middle' })
  T(s, 'Unedited crops of screens captured 29 Oct 2026 from the running app (local full stack, tablet width, dark theme) · demo data, labelled in the app', M, 6.63, CW, 0.26, { fontSize: 10, color: COL.muted })
  s.addNotes(`Judging lens: user needs and potential impact.
Screenshots are genuine and unedited apart from cropping: captured on 29 Oct 2026 from the running application (React dev server + FastAPI + local Postgres, using the project's Playwright harness with its test-only auth stand-in), signed in as the seeded demo student "Priya Nair", at a 768×1024 viewport (2× pixel density) so text stays legible when enlarged.
2 · Opportunity detail (Flipkart GRiD Campus Challenge, demo listing): fit 37, high confidence, why/watch, blockers with counterfactual points (+14.2 pts for react).
3 · Team Builder for the same opportunity: 0/3 required skills covered alone → 3/3 with one opted-in teammate; balance 100; stops at 2 members.
4 · Originality Checker on a labelled paraphrase of a corpus idea: substantial semantic overlap (97% closest match, another idea on the platform), queued for human review, with the "not proof of plagiarism" disclaimer.
Steps 1 and 5 are shown elsewhere: the fit badge on every catalog card, and the dashboard on slide 7.
Impact is intended, not measured: no user study has been run.`)
}

// ═════ 6 · RESEARCH ═══════════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Research' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'Research' })
  head(s, '06 · RESEARCH & PREPARATION QUALITY', 'Research-Informed Engineering')
  const lw = 7.0, cw3 = (lw - 2 * 0.3) / 3
  ;['RESEARCH AREA', 'ENGINEERING DECISION', 'EVALUATION'].forEach((h, i) => T(s, h, M + i * (cw3 + 0.3), 1.5, cw3, 0.28, { fontSize: 10, bold: true, color: COL.muted, charSpacing: 2 }))
  const rows = [
    [COL.cyan, 'Content-based recommendation [1]; cold-start [2]', 'Profile-to-listing signals; unknown inputs excluded, score capped', 'Ranking quality: NDCG@10, P@10 [3]'],
    [COL.blue, 'Team formation as skill coverage [4]', 'Greedy set-cover on marginal contribution', 'Coverage vs 300 random teams per listing'],
    [COL.violet, 'Sentence embeddings, Sentence-BERT [5]', 'MiniLM 384-d + pgvector cosine; calibrated thresholds', 'Classification: precision, recall, F1'],
  ]
  rows.forEach(([c, ...cells], r) => {
    const y = 1.85 + r * 1.15
    cells.forEach((t, i) => {
      const x = M + i * (cw3 + 0.3)
      card(s, x, y, cw3, 1.0, i === 0 ? { line: c, lw: 1 } : {})
      T(s, t, x + 0.15, y, cw3 - 0.3, 1.0, { fontSize: 13, valign: 'middle', color: i === 0 ? c : COL.white, bold: i === 0 })
      if (i < 2) arrow(s, x + cw3 + 0.05, y + 0.5, x + cw3 + 0.25, y + 0.5, COL.muted)
    })
  })
  T(s, [{ text: 'Demo data only: ', options: { bold: true, color: COL.amber } }, { text: '5 synthetic personas, 64-listing catalog · 34 team-based listings, 24 synthetic candidates · 36 paraphrased + 24 unrelated ideas vs a 50-idea corpus. A consistency check against baselines, not proof of real-world effectiveness.' }],
    M, 5.3, lw, 0.6, { fontSize: 11, color: COL.muted })
  const refs = [
    '[1] Lops, de Gemmis & Semeraro, “Content-based recommender systems,” Recommender Systems Handbook, 2011',
    '[2] Schein et al., “Methods and metrics for cold-start recommendations,” ACM SIGIR, 2002',
    '[3] Järvelin & Kekäläinen, “Cumulated gain-based evaluation of IR techniques,” ACM TOIS, 2002',
    '[4] Lappas, Liu & Terzi, “Finding a team of experts in social networks,” ACM KDD, 2009',
    '[5] Reimers & Gurevych, “Sentence-BERT,” EMNLP-IJCNLP, 2019',
  ]
  T(s, refs.join('\n'), M, 6.0, lw, 0.88, { fontSize: 10, color: COL.muted })

  // three separate comparison panels — each with its own metric type and scale
  const rx = M + lw + 0.35, rw = W - M - rx
  T(s, 'MEASURED VS BASELINE · RERUN 29 OCT 2026', rx, 1.5, rw, 0.28, { fontSize: 10, bold: true, color: COL.muted, charSpacing: 2 })
  const panels = [
    ['Opportunity Recommender', COL.cyan, HEX.cyan, 'RANKING · NDCG@10 (0–1)', ['NIRMAAN', 'Recency ranking'], [0.908, 0.080], '0.000', 'Precision@10: 0.58 vs 0.06 · mean of 5 personas'],
    ['AI Team Builder', COL.blue, HEX.blue, 'COVERAGE · % OF SKILLS', ['NIRMAAN', 'Random teams'], [0.971, 0.686], '0.0%', 'Teams covering every required skill: 91% vs 40%'],
    ['Originality Checker', COL.violet, HEX.violet, 'CLASSIFICATION · F1 (0–1)', ['NIRMAAN (MiniLM)', 'Keyword overlap'], [0.958, 0.857], '0.000', 'Reworded ideas, top-1 retrieval: 83% vs 25%'],
  ]
  const ph = 1.6, pg = 0.1
  panels.forEach(([eng, c, hex, metric, labels, values, fmt, extra], i) => {
    const y = 1.85 + i * (ph + pg)
    card(s, rx, y, rw, ph, { line: c, lw: 1 })
    T(s, eng, rx + 0.2, y + 0.1, 2.3, 0.3, { fontSize: 13, bold: true, color: c, valign: 'middle' })
    T(s, metric, rx + 2.4, y + 0.1, rw - 2.6, 0.3, { fontSize: 10, bold: true, color: COL.muted, align: 'right', valign: 'middle', charSpacing: 1 })
    s.addChart(pres.charts.BAR, [{ name: metric, labels, values }], {
      x: rx + 0.1, y: y + 0.4, w: rw - 1.25, h: 0.88, barDir: 'bar', barGapWidthPct: 45, catAxisOrientation: 'maxMin',
      chartColors: [hex, '56637F'], showValue: false,
      valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 1.0, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      catAxisLabelColor: 'C7D2E5', catAxisLabelFontSize: 11, catAxisLabelFontFace: '+mn-lt', catAxisLineShow: false, showLegend: false,
      objectName: `eval-chart-${i + 1}`, altText: `${eng}: ${labels[0]} ${values[0]} vs ${labels[1]} ${values[1]}`,
    })
    const f = (v) => fmt === '0.0%' ? (v * 100).toFixed(1) + '%' : v.toFixed(3)
    T(s, f(values[0]), rx + rw - 1.1, y + 0.47, 0.9, 0.34, { fontSize: 15, bold: true, color: c, align: 'right', valign: 'middle' })
    T(s, f(values[1]), rx + rw - 1.1, y + 0.87, 0.9, 0.34, { fontSize: 15, bold: true, color: COL.muted, align: 'right', valign: 'middle' })
    T(s, extra, rx + 0.2, y + 1.28, rw - 0.4, 0.26, { fontSize: 11, color: COL.muted })
  })
  s.addNotes(`Judging lens: research and preparation quality.
All values re-run on 29 Oct 2026 from backend/eval on the current code (outputs in report/presentation/evidence/):
• Recommender (eval.engines_eval): mean NDCG@10 0.908 vs recency 0.080 (random 0.069); Precision@10 0.58 vs 0.06 (random 0.08). 5 synthetic personas × 64-item demo catalog. Relevance is defined from the same profile signals the ranker uses, so this is a consistency check (docs/EVALUATION.md).
• Team Builder (eval.engines_eval): required-skill coverage 97.1% vs 68.6% for random teams (300 random draws for each of 34 team-based demo listings; 24 synthetic candidates); teams covering every required skill 91.2% vs 39.8%. Balance score 0.91 vs 0.71.
• Originality (labelled set: 24 paraphrases + 12 hard paraphrases vs 24 unrelated ideas, 50-idea demo corpus): MiniLM at the shipped 0.45 threshold — TP 34, FP 1, FN 2 → precision 0.971, recall 0.944, F1 0.958. Keyword-overlap baseline at the threshold chosen by the project's own sweep (0.10, stored as 0.10000000000000002): precision 1.000, recall 0.750, F1 0.857 — this reproduces the report. Two items score exactly 0.10; counting them as matches gives F1 0.862. Hard paraphrases (vocabulary avoided): top-1 retrieval 83% vs 25%.
References are from the project report's bibliography; they inform the design and evaluation, none is claimed to be implemented verbatim.`)
}

// ═════ 7 · CLOSE ══════════════════════════════════════════════════════════════════════════════════════════
pres.addSection({ title: 'Close' })
{
  const s = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: 'Close' })
  head(s, '07 · ACHIEVED & NEXT', 'One Platform. Three Engines. A Clearer Path to Innovation.')
  const chain = [['Opportunity discovery', COL.cyan], ['Team formation', COL.blue], ['Idea-similarity screening', COL.violet]]
  const cw = 3.4, cg = (CW - 3 * cw) / 2
  chain.forEach(([t, c], i) => {
    const x = M + i * (cw + cg)
    card(s, x, 1.55, cw, 0.6, { r: 0.3, line: c, lw: 1.25 })
    T(s, t, x, 1.55, cw, 0.6, { fontSize: 16, bold: true, color: c, align: 'center', valign: 'middle' })
    if (i < 2) arrow(s, x + cw + 0.1, 1.85, x + cw + cg - 0.1, 1.85, COL.white)
  })

  const pw = 3.75, py = 2.5, ph = 3.2
  const panels = [
    ['WORKING NOW · VERIFIED LOCALLY', COL.green, ['Explainable fit ranking over a 64-listing demo catalog', 'Consent-gated Team Builder with coverage and balance score', 'MiniLM + pgvector screening with a human-review queue', 'Dashboard, applications, alerts, reviewer and admin flows']],
    ['NEXT', COL.blue, ['Production deployment (configs ready)', 'Usability study with real students', 'Relevance measured from real saves and applications', 'Larger labelled originality and team datasets', 'Verified opportunity sources, used within their terms']],
  ]
  panels.forEach(([k, c, items], i) => {
    const x = M + i * (pw + 0.3)
    card(s, x, py, pw, ph, { line: c, lw: 1 })
    T(s, k, x + 0.22, py + 0.18, pw - 0.44, 0.3, { fontSize: 11, bold: true, color: c, charSpacing: 1 })
    s.addText(items.map((t, j) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: j < items.length - 1 } })),
      { x: x + 0.15, y: py + 0.6, w: pw - 0.35, h: ph - 0.75, fontSize: 13, color: COL.white, valign: 'top', paraSpaceAfter: 6, margin: 0, isTextBox: true, objectName: name('panel-list') })
  })
  const sw = 4.0, sh = 3.0, sx = W - M - 0.04 - sw
  shot(s, 'z-apply.png', sx, py + 0.04, sw, sh)
  T(s, 'Dashboard · next best action · demo data', sx, py + sh + 0.12, sw, 0.26, { fontSize: 10, color: COL.muted })

  card(s, M, 5.95, CW, 0.8, { line: COL.cyan, lw: 1.25 })
  s.addImage({ path: IMG('mark.png'), x: M + 0.3, y: 6.08, w: 0.48, h: 0.48 * 1327 / 1170, altText: 'NIRMAAN logo mark', objectName: 'logo-mark-close' })
  T(s, 'NIRMAAN connects opportunity discovery, team formation\nand idea validation in one student innovation workflow.', M + 1.0, 5.95, CW - 1.25, 0.8, { fontSize: 17, bold: true, valign: 'middle' })
  s.addNotes(`Judging lens: what has been achieved and what comes next.
Working now = implemented and covered by automated tests run locally today. Not claimed: live deployment, real users, live external opportunity feeds, live verification of the optional chat assistant or Google integrations.
Next steps are listed as future work only.
Close on the one-sentence summary; it describes the implemented product exactly.`)
}

;(async () => {
  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log('wrote', OUT)
})()
