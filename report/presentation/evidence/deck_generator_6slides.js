// NIRMAAN — 6-slide project review deck. Every number is from report/presentation/evidence (engines.json, orig.json,
// orig_combined.json, test logs of 29 Oct 2026) and was re-checked against the repository before this build.
const pptxgen = require('pptxgenjs')
const sharp = require('sharp')
const fs = require('fs')
const SKILL = process.env.SKILL_DIR
const { applyTheme } = require(SKILL + '/scripts/apply_theme.js')
const OUT = process.argv[2]

const HEX = { bg: '0A0F1E', card: '111A2E', muted: '9AA8C1', line: '24324F', cyan: '22D3EE', blue: '4F8CFF', violet: 'A78BFA', green: '34D399', amber: 'FBBF24', white: 'FFFFFF', base: '55657F', head: '18233D' }
const THEME = {
  name: 'NIRMAAN Dark', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.bg, lt1: HEX.white, dk2: HEX.card, lt2: HEX.muted, accent1: HEX.cyan, accent2: HEX.blue, accent3: HEX.violet, accent4: HEX.green, accent5: HEX.amber, accent6: HEX.line, hlink: HEX.cyan, folHlink: HEX.violet },
}

;(async () => {
  const logo = 'image/png;base64,' + (await sharp(process.env.LOGO_SVG, { density: 600 }).resize({ height: 512 }).png().toBuffer()).toString('base64')
  const meta = await sharp(Buffer.from(logo.split(',')[1], 'base64')).metadata()
  const LR = meta.width / meta.height

  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
  pres.title = 'NIRMAAN — The AI Operating System for Student Innovation'
  pres.subject = 'Project review presentation · Team T-102'
  pres.author = 'Shaurya Singhal, Tahaseen Khan, Vedika Agarwal'
  const C = pres.SchemeColor
  const COL = { white: C.background1, card: C.text2, muted: C.background2, cyan: C.accent1, blue: C.accent2, violet: C.accent3, green: C.accent4, amber: C.accent5, line: C.accent6 }
  const S = pres.shapes
  const W = 13.333, M = 0.6, CW = W - 2 * M

  pres.defineSlideMaster({ title: 'NIRMAAN_TITLE', background: { color: HEX.bg }, objects: [] })
  pres.defineSlideMaster({
    title: 'NIRMAAN_CONTENT', background: { color: HEX.bg },
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: M, y: 0.42, w: 10, h: 0.28, fontSize: 12, bold: true, color: COL.cyan, charSpacing: 3, margin: 0, valign: 'middle' }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.72, w: CW, h: 0.62, fontSize: 32, bold: true, color: COL.white, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
      { text: { text: 'NIRMAAN  ·  Project Review  ·  Team T-102', options: { x: M, y: 7.0, w: 7, h: 0.26, fontSize: 10, color: COL.muted, margin: 0, valign: 'middle' } } },
    ],
    slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.26, fontSize: 10, color: HEX.muted, align: 'right', margin: 0 },
  })

  let n = 0
  const nm = (s) => `${s}-${++n}`
  const T = (sl, text, x, y, w, h, o = {}) => sl.addText(text, { x, y, w, h, margin: 0, fontSize: 14, color: COL.white, valign: 'top', isTextBox: true, ...o, objectName: nm(o.objectName || 'text') })
  const card = (sl, x, y, w, h, o = {}) => sl.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: o.r ?? 0.12, fill: { color: o.fill || COL.card }, line: { color: o.line || COL.line, width: o.lw || 1 }, objectName: nm(o.name || 'card') })
  const arrow = (sl, x1, y, x2, color) => sl.addShape(S.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color, width: 1.5, endArrowType: 'triangle' }, objectName: nm('arrow') })
  const dot = (sl, label, x, y, d, color, fs = 13) => {
    sl.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color: COL.card }, line: { color, width: 1.5 }, objectName: nm('dot') })
    T(sl, label, x, y, d, d, { fontSize: fs, bold: true, color, align: 'center', valign: 'middle', objectName: 'dot-label' })
  }
  const label = (sl, text, x, y, w, color = COL.muted, o = {}) => T(sl, text, x, y, w, 0.24, { fontSize: 11, bold: true, color, charSpacing: 2, valign: 'middle', ...o, objectName: 'label' })
  const bullets = (sl, items, x, y, w, h, fs = 14) => T(sl, items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 7 } })), x, y, w, h, { fontSize: fs, color: COL.white, objectName: 'bullets' })
  const content = (kicker, title, section) => {
    const sl = pres.addSlide({ masterName: 'NIRMAAN_CONTENT', sectionTitle: section })
    sl.addText(kicker, { placeholder: 'kicker' })
    sl.addText(title, { placeholder: 'title' })
    return sl
  }

  // ── 1 · Title ───────────────────────────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Introduction' })
  {
    const s = pres.addSlide({ masterName: 'NIRMAAN_TITLE', sectionTitle: 'Introduction' })
    s.addImage({ data: logo, x: M, y: 0.8, w: 0.9 * LR, h: 0.9, altText: 'NIRMAAN logo', objectName: 'logo' })
    T(s, 'NIRMAAN', M, 1.9, 7.6, 1.15, { fontSize: 76, bold: true, charSpacing: 8, valign: 'middle', objectName: 'project-title' })
    T(s, 'The AI Operating System for Student Innovation', M, 3.1, 7.8, 0.5, { fontSize: 24, color: COL.cyan, valign: 'middle', objectName: 'subtitle' })
    label(s, 'PROJECT REVIEW PRESENTATION', M, 3.85, 7, COL.muted, { fontSize: 13, charSpacing: 4 })
    const rows = [['TEAM ID', 'T-102'], ['TEAM MEMBERS', 'Shaurya Singhal  ·  Tahaseen Khan  ·  Vedika Agarwal'], ['INSTITUTION', 'GLA University, Mathura']]
    rows.forEach(([k, v], i) => {
      const y = 4.75 + i * 0.62
      label(s, k, M, y + 0.06, 2.0)
      T(s, v, 2.65, y, 5.85, 0.36, { fontSize: 18, bold: i === 1, valign: 'middle', objectName: 'detail' })
    })
    // compact agenda
    const ax = 8.55, aw = W - M - ax
    card(s, ax, 1.0, aw, 5.5, { r: 0.14, name: 'agenda' })
    label(s, 'CONTENTS', ax + 0.35, 1.3, 3, COL.cyan)
    const agenda = [['02', 'Problem, Objectives & Scope', COL.cyan], ['03', 'Literature & Research Gap', COL.blue], ['04', 'Methodology & Workflow', COL.violet], ['05', 'Dataset & Results', COL.cyan], ['06', 'Conclusion & Future Scope', COL.green]]
    agenda.forEach(([num, t, c], i) => {
      const y = 1.85 + i * 0.88
      dot(s, num, ax + 0.35, y, 0.56, c, 13)
      T(s, t, ax + 1.1, y, aw - 1.3, 0.56, { fontSize: 15.5, bold: true, valign: 'middle', objectName: 'agenda-item' })
    })
    s.addNotes('Opening: NIRMAAN, Team T-102, GLA University, Mathura. One line: NIRMAAN helps students decide what to apply for, who to build with, and whether their idea is new — in one workflow.')
  }

  // ── 2 · Problem, objectives, scope ──────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Problem' })
  {
    const s = content('02  ·  PROBLEM, OBJECTIVES & SCOPE', 'Students Face Three Disconnected Decisions', 'Problem')
    T(s, 'Listings are plentiful. Students lack help deciding what fits, who to build with, and whether their idea is new.', M, 1.5, CW, 0.5, { fontSize: 17, color: COL.muted, valign: 'middle', objectName: 'problem-statement' })
    const cw = (CW - 0.6) / 3
    const probs = [
      ['1', 'Which opportunity fits me?', 'Listings are sorted by date or popularity, not by fit.', 'Opportunity Recommender', COL.cyan],
      ['2', 'Who should I build with?', 'Teams form from friend circles; skill gaps go unnoticed.', 'AI Team Builder', COL.blue],
      ['3', 'Has this idea been done before?', 'Overlap with existing work often surfaces only at judging.', 'Originality Checker', COL.violet],
    ]
    probs.forEach(([num, q, why, engine, c], i) => {
      const x = M + i * (cw + 0.3), y = 2.2
      card(s, x, y, cw, 2.15, { name: 'problem' })
      dot(s, num, x + 0.28, y + 0.28, 0.5, c, 14)
      T(s, q, x + 0.95, y + 0.28, cw - 1.15, 0.5, { fontSize: 18, bold: true, valign: 'middle', objectName: 'question' })
      T(s, why, x + 0.28, y + 0.95, cw - 0.56, 0.55, { fontSize: 14, color: COL.muted, objectName: 'why' })
      T(s, [{ text: '→  ', options: { color: COL.muted, bold: true } }, { text: engine, options: { color: c, bold: true } }], x + 0.28, y + 1.6, cw - 0.56, 0.32, { fontSize: 14, valign: 'middle', objectName: 'answer' })
    })
    const hw = (CW - 0.3) / 2, by = 4.6, bh = 2.18
    card(s, M, by, hw, bh, { name: 'objectives' })
    label(s, 'OBJECTIVES', M + 0.3, by + 0.25, 4, COL.cyan)
    bullets(s, ['Rank opportunities with an explainable 0–100 fit score, reasons and blockers', 'Form opt-in teams that cover an opportunity’s required skills', 'Flag overlap with existing ideas early; send close matches to human review'], M + 0.3, by + 0.62, hw - 0.6, bh - 0.75)
    const sx = M + hw + 0.3
    card(s, sx, by, hw, bh, { name: 'scope' })
    label(s, 'SCOPE', sx + 0.3, by + 0.25, 4, COL.violet)
    bullets(s, ['One web platform: discover → team → validate → apply', 'Combines established AI techniques; no new algorithm is claimed', 'Verified locally on demo data; not yet tested with real users'], sx + 0.3, by + 0.62, hw - 0.6, bh - 0.75)
    s.addNotes('Problem: three decisions that are currently made separately and without support. Each maps to one NIRMAAN engine. Objectives say what each engine must do; scope states the limits honestly (demo data, no new algorithm).')
  }

  // ── 3 · Literature review ───────────────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Literature' })
  {
    const s = content('03  ·  LITERATURE REVIEW & RESEARCH GAP', 'Prior Work Solves Each Problem in Isolation', 'Literature')
    const hd = (t, c = HEX.white) => ({ text: t, options: { bold: true, color: c, fill: { color: HEX.head }, fontSize: 13 } })
    const cell = (t, o = {}) => ({ text: t, options: { color: HEX.white, fill: { color: HEX.card }, fontSize: 12.5, ...o } })
    const work = (num, who, what, c) => ({ text: [{ text: `[${num}] ${who}`, options: { bold: true, color: c, breakLine: true } }, { text: what, options: { color: HEX.muted } }], options: { fill: { color: HEX.card }, fontSize: 12.5 } })
    const rows = [
      [hd('Work'), hd('Existing method'), hd('Key finding'), hd('Research gap', HEX.amber), hd('NIRMAAN’s contribution', HEX.cyan)],
      [work(1, 'Lops et al., 2011', 'Content-based recommender systems', HEX.cyan), cell('Match item features to a user profile'), cell('Transparent and handles new items; over-specialisation and cold start remain'), cell('No actionable fit score that shows blockers', { color: HEX.amber }), cell('0–100 fit score with reasons, blockers and points gained per fix')],
      [work(2, 'Lappas et al., 2009', 'Team of experts in social networks', HEX.blue), cell('Cover required skills at minimum communication cost'), cell('Problem is NP-hard; approximation algorithms proposed'), cell('Assumes a social network; no consent, explanation or balance', { color: HEX.amber }), cell('Opt-in greedy skill cover with an explanation and balance score')],
      [work(3, 'Reimers & Gurevych, 2019', 'Sentence-BERT', HEX.violet), cell('Siamese BERT embeddings compared by cosine similarity'), cell('Meaningful sentence embeddings; ~65 h (BERT) → ~5 s for 10,000 sentences'), cell('General-purpose; no originality screen with thresholds or review', { color: HEX.amber }), cell('MiniLM + pgvector screen; matches ≥ 0.75 go to human review')],
    ]
    s.addTable(rows, { x: M, y: 1.55, w: CW, colW: [2.35, 2.3, 2.6, 2.4, 2.483], rowH: [0.42, 0.88, 0.88, 0.88], border: { type: 'solid', pt: 0.75, color: HEX.line }, margin: [0.07, 0.12, 0.07, 0.12], valign: 'middle', fontFace: 'Calibri', objectName: 'lit-table' })
    // research gap → contribution
    const gy = 5.0, gh = 1.15
    card(s, M, gy, CW, gh, { line: COL.amber, lw: 1.25, name: 'gap' })
    label(s, 'RESEARCH GAP', M + 0.3, gy + 0.2, 3, COL.amber)
    T(s, 'Studied separately, never as one student workflow', M + 0.3, gy + 0.48, 2.9, 0.5, { fontSize: 14, bold: true, objectName: 'gap-text' })
    const chips = [['Recommendation [1]', COL.cyan], ['Team formation [2]', COL.blue], ['Semantic similarity [3]', COL.violet]]
    const chipW = 1.78, cy = gy + 0.32, chH = 0.5
    chips.forEach(([t, c], i) => {
      const x = 3.75 + i * (chipW + 0.12)
      card(s, x, cy, chipW, chH, { line: c, r: 0.25, name: 'chip' })
      T(s, t, x, cy, chipW, chH, { fontSize: 12, bold: true, color: c, align: 'center', valign: 'middle', objectName: 'chip-label' })
    })
    const ax = 3.75 + 3 * chipW + 0.24 + 0.12
    arrow(s, ax, cy + chH / 2, ax + 0.4, COL.cyan)
    const nx = ax + 0.52, nw = W - M - 0.22 - nx
    card(s, nx, gy + 0.18, nw, gh - 0.36, { line: COL.cyan, fill: COL.card, r: 0.1, name: 'contribution' })
    T(s, [{ text: 'NIRMAAN connects all three', options: { bold: true, color: COL.cyan, breakLine: true } }, { text: 'one workflow · no new algorithm', options: { color: COL.muted, fontSize: 11 } }], nx + 0.15, gy + 0.18, nw - 0.3, gh - 0.36, { fontSize: 13.5, valign: 'middle', objectName: 'contribution-text' })
    T(s, [
      { text: '[1] P. Lops, M. de Gemmis, G. Semeraro, “Content-based recommender systems: State of the art and trends,” Recommender Systems Handbook, Springer, 2011.   ', options: {} },
      { text: '[2] T. Lappas, K. Liu, E. Terzi, “Finding a team of experts in social networks,” ACM SIGKDD (KDD ’09), 2009.   ', options: {} },
      { text: '[3] N. Reimers, I. Gurevych, “Sentence-BERT: Sentence embeddings using Siamese BERT-networks,” EMNLP-IJCNLP, 2019.', options: {} },
    ], M, 6.3, CW, 0.5, { fontSize: 9.5, color: COL.muted, objectName: 'references' })
    s.addNotes('References are numbered [1]–[3] for this deck; in the project report they are [2], [6] and [7]. Full details (pages, editors) are in the report bibliography. The research gap is integration, not a new algorithm.')
  }

  // ── 4 · Methodology ─────────────────────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Methodology' })
  {
    const s = content('04  ·  METHODOLOGY & WORKFLOW', 'Three Engines, One Connected Workflow', 'Methodology')
    const lw = 2.35, gap = 0.3, sx = M + lw + 0.25
    const colW = (W - M - sx - 4 * gap) / 5
    const heads = ['INPUT', 'PROCESSING', 'ALGORITHM', 'DATA', 'OUTPUT']
    heads.forEach((h, j) => label(s, h, sx + j * (colW + gap), 1.52, colW, j === 2 ? COL.white : COL.muted, { align: 'center' }))
    const engines = [
      ['Opportunity Recommender', COL.cyan, ['Student profile + opportunity catalog', 'Missing fields excluded, never guessed', '8 weighted signals → explainable score', 'PostgreSQL: listings and profiles', '0–100 fit score, reasons, blockers']],
      ['AI Team Builder', COL.blue, ['Required skills + opt-in candidates', 'Consent filter; no demographic data', 'Greedy set cover on marginal skill gain', 'PostgreSQL: candidates and teams', 'Team, skill coverage, balance score']],
      ['Originality Checker', COL.violet, ['Idea title + description', 'MiniLM-L6-v2 → 384-d embedding', 'Cosine similarity, nearest matches', 'pgvector HNSW index of ideas', 'Similar ideas; ≥ 0.75 → human review']],
    ]
    const rh = 0.95, rg = 0.18
    engines.forEach(([name, c, steps], i) => {
      const y = 1.88 + i * (rh + rg)
      card(s, M, y, lw, rh, { line: c, lw: 1.25, name: 'engine' })
      dot(s, String(i + 1), M + 0.18, y + (rh - 0.42) / 2, 0.42, c, 12)
      T(s, name, M + 0.72, y, lw - 0.8, rh, { fontSize: 14.5, bold: true, color: c, valign: 'middle', objectName: 'engine-name' })
      arrow(s, M + lw + 0.04, y + rh / 2, sx - 0.04, c)
      steps.forEach((t, j) => {
        const x = sx + j * (colW + gap)
        card(s, x, y, colW, rh, { line: j === 2 ? c : COL.line, lw: j === 2 ? 1.5 : 1, name: 'step' })
        T(s, t, x + 0.12, y, colW - 0.24, rh, { fontSize: 13, valign: 'middle', align: 'center', objectName: 'step-text' })
        if (j < 4) arrow(s, x + colW + 0.04, y + rh / 2, x + colW + gap - 0.04, c)
      })
    })
    // architecture band
    const ay = 5.7, ah = 1.02
    label(s, 'ARCHITECTURE  ·  EVERY REQUEST', M, 5.36, 6, COL.cyan)
    const layers = [
      [['FRONTEND', 'user interface'], 'React 19 · TypeScript · Vite · Tailwind 4'],
      [['API', 'JWT, role checks, rate limits'], 'FastAPI · Pydantic · SQLAlchemy · sentence-transformers'],
      [['DATABASE', 'row-level security'], 'Supabase PostgreSQL · pgvector'],
    ]
    const bw = (CW - 2 * 0.45) / 3
    layers.forEach(([h, t], i) => {
      const x = M + i * (bw + 0.45)
      card(s, x, ay, bw, ah, { name: 'layer' })
      T(s, [{ text: h[0], options: { bold: true, charSpacing: 2, color: COL.muted } }, { text: '   ' + h[1], options: { color: COL.muted } }], x + 0.25, ay + 0.15, bw - 0.5, 0.26, { fontSize: 11, valign: 'middle', objectName: 'layer-label' })
      T(s, t, x + 0.25, ay + 0.43, bw - 0.5, 0.52, { fontSize: 14, bold: true, valign: 'middle', objectName: 'layer-stack' })
      if (i < 2) arrow(s, x + bw + 0.06, ay + ah / 2, x + bw + 0.39, COL.cyan)
    })
    s.addNotes('Read each row left to right. Algorithm boxes are highlighted. Recommender: 8 signals (skill, interest, domain, experience, participation, format, deadline, behaviour); unknown inputs are dropped and the remaining weights renormalised. Originality: cosine ≥ 0.45 is flagged as related, ≥ 0.75 is queued for human review. The API verifies Supabase JWTs and runs queries under row-level security.')
  }

  // ── 5 · Results ─────────────────────────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Results' })
  {
    const s = content('05  ·  DATASET & RESULTS', 'Each Engine Outperforms Its Baseline on Demo Data', 'Results')
    const cw = (CW - 0.6) / 3, y0 = 1.52, ch = 4.55
    const E = [
      { name: 'Opportunity Recommender', c: COL.cyan, hex: HEX.cyan, data: '5 synthetic personas · 64-listing demo catalog', base: 'Recency ranking (newest first)', metric: ['NDCG@10', 'ranking quality, 0–1'], cats: ['NIRMAAN', 'Recency'], vals: [0.908, 0.08], max: 1, fmt: '0.000', big: '0.58', vs: 'vs 0.06', sub: 'Precision@10 · mean of 5 personas' },
      { name: 'AI Team Builder', c: COL.blue, hex: HEX.blue, data: '34 team-based listings · 24 synthetic candidates', base: 'Random teams (300 per listing)', metric: ['SKILL COVERAGE', '% of required skills'], cats: ['NIRMAAN', 'Random'], vals: [97.1, 68.6], max: 100, fmt: '0.0', big: '91%', vs: 'vs 40%', sub: 'Teams covering every required skill' },
      { name: 'Originality Checker', c: COL.violet, hex: HEX.violet, data: '36 reworded + 24 unrelated ideas vs a 50-idea corpus', base: 'Keyword-overlap matching', metric: ['F1 SCORE', 'related vs unrelated, 0–1'], cats: ['NIRMAAN', 'Keyword'], vals: [0.958, 0.857], max: 1, fmt: '0.000', big: '83%', vs: 'vs 25%', sub: 'Top-1 retrieval · 12 hard rewordings' },
    ]
    E.forEach((e, i) => {
      const x = M + i * (cw + 0.3), px = x + 0.28, pw = cw - 0.56
      card(s, x, y0, cw, ch, { line: e.c, lw: 1.25, name: 'result' })
      T(s, e.name, px, y0 + 0.2, pw, 0.4, { fontSize: 19, bold: true, color: e.c, valign: 'middle', objectName: 'engine' })
      label(s, 'DATA', px, y0 + 0.72, 1, COL.muted, { fontSize: 10 })
      T(s, e.data, px + 0.95, y0 + 0.68, pw - 0.95, 0.5, { fontSize: 12.5, objectName: 'data' })
      label(s, 'BASELINE', px, y0 + 1.22, 1, COL.muted, { fontSize: 10 })
      T(s, e.base, px + 0.95, y0 + 1.18, pw - 0.95, 0.3, { fontSize: 12.5, objectName: 'baseline' })
      T(s, [{ text: e.metric[0], options: { bold: true, charSpacing: 2 } }, { text: '   ' + e.metric[1], options: { color: COL.muted } }], px, y0 + 1.66, pw, 0.26, { fontSize: 11.5, valign: 'middle', objectName: 'metric' })
      s.addChart(pres.charts.BAR, [{ name: e.metric.join(' — '), labels: e.cats, values: e.vals }], {
        x: px - 0.05, y: y0 + 1.95, w: pw + 0.1, h: 1.3, barDir: 'bar', barGapWidthPct: 45,
        chartColors: [e.hex, HEX.base], valAxisMinVal: 0, valAxisMaxVal: e.max * 1.18, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
        catAxisOrientation: 'maxMin', catAxisLabelColor: 'C7D2E5', catAxisLabelFontSize: 12, catAxisLabelFontFace: '+mn-lt', catAxisLineShow: false,
        showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: HEX.white, dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelFontFace: '+mn-lt', dataLabelFormatCode: e.fmt,
        showLegend: false, showTitle: false, altText: `${e.name}: ${e.metric.join(', ')} — NIRMAAN ${e.vals[0]} vs ${e.cats[1]} ${e.vals[1]}`, objectName: nm('chart'),
      })
      T(s, [{ text: e.big + '  ', options: { fontSize: 30, bold: true, color: e.c } }, { text: e.vs, options: { fontSize: 17, color: COL.muted, bold: true } }], px, y0 + 3.4, pw, 0.55, { valign: 'middle', objectName: 'secondary' })
      T(s, e.sub, px, y0 + 3.95, pw, 0.3, { fontSize: 12.5, color: COL.muted, valign: 'middle', objectName: 'secondary-label' })
    })
    const dy = 6.27
    card(s, M, dy, CW, 0.5, { line: COL.amber, lw: 1.25, name: 'limitation' })
    T(s, [{ text: 'Demo data only.  ', options: { bold: true, color: COL.amber } }, { text: 'Results are a consistency check against baselines, not proof of real-world effectiveness. Not yet measured with real users.' }], M + 0.3, dy, CW - 0.6, 0.5, { fontSize: 14, valign: 'middle', objectName: 'limitation-text' })
    s.addNotes('Sources: report/presentation/evidence — engines.json (recommender, team builder), orig_combined.json (F1 on 36 reworded = 24 + 12 hard, vs 24 unrelated; MiniLM threshold 0.45; keyword baseline at its swept threshold), orig.json (top-1 retrieval on the 12 hard rewordings). Re-run 29 Oct 2026. Synthetic/demo data: a consistency check, not real-world validation.')
  }

  // ── 6 · Conclusion ──────────────────────────────────────────────────────────────────────────────────
  pres.addSection({ title: 'Conclusion' })
  {
    const s = content('06  ·  CONCLUSION & FUTURE SCOPE', 'One Platform. Three Engines. A Clearer Path', 'Conclusion')
    const cw = (CW - 0.6) / 3, y0 = 1.5, ch = 2.92
    const cols = [
      ['IMPLEMENTED  ·  VERIFIED LOCALLY', COL.green, ['Explainable ranking over a 64-listing demo catalog', 'Opt-in team builder with coverage and balance scores', 'MiniLM + pgvector screening with human review', 'Dashboard, applications, alerts, reviewer and admin flows']],
      ['KEY CONTRIBUTIONS', COL.cyan, ['Discovery, teaming and idea validation in one workflow', 'Explainable, human-in-the-loop decisions', 'Evaluated against baselines, with limits stated', 'Built on established techniques; no new algorithm claimed']],
      ['FUTURE SCOPE', COL.blue, ['Production deployment', 'Usability testing with real students', 'Recommendations improved by real user activity', 'Larger labelled datasets', 'Verified opportunity sources']],
    ]
    cols.forEach(([h, c, items], i) => {
      const x = M + i * (cw + 0.3)
      card(s, x, y0, cw, ch, { line: c, lw: 1.25, name: 'conclusion' })
      label(s, h, x + 0.28, y0 + 0.22, cw - 0.56, c)
      bullets(s, items, x + 0.28, y0 + 0.58, cw - 0.56, ch - 0.68, 14)
    })
    // test evidence
    const ty = 4.93, th = 0.86, tw = (CW - 3 * 0.3) / 4
    label(s, 'AUTOMATED TESTS  ·  LOCAL RUN, 29 OCT 2026  ·  ALL PASSED, 0 FAILED, 0 SKIPPED', M, 4.6, 3 * tw + 0.6, COL.green, { fontSize: 10.5 })
    label(s, 'DATABASE SECURITY', M + 3 * (tw + 0.3), 4.6, tw, COL.violet, { fontSize: 10.5 })
    const tiles = [['326', 'backend tests', 'pytest · real PostgreSQL', COL.green], ['146', 'frontend tests', 'Vitest unit & component', COL.green], ['248', 'end-to-end tests', 'Playwright · full stack', COL.green], ['49', 'database checks', 'RLS, role & access rules', COL.violet]]
    tiles.forEach(([num, t, sub, c], i) => {
      const x = M + i * (tw + 0.3)
      card(s, x, ty, tw, th, { name: 'tile' })
      T(s, num, x + 0.22, ty, 1.05, th, { fontSize: 32, bold: true, color: c, valign: 'middle', objectName: 'tile-num' })
      T(s, [{ text: t, options: { bold: true, breakLine: true } }, { text: sub, options: { color: COL.muted, fontSize: 11.5 } }], x + 1.3, ty, tw - 1.45, th, { fontSize: 14, valign: 'middle', objectName: 'tile-label' })
    })
    const cy = 6.0, chh = 0.8
    card(s, M, cy, CW, chh, { line: COL.cyan, lw: 1.5, name: 'closing' })
    s.addImage({ data: logo, x: M + 0.3, y: cy + 0.16, w: 0.5 * LR, h: 0.5, altText: 'NIRMAAN logo', objectName: 'logo-close' })
    T(s, 'NIRMAAN turns three disconnected decisions — what to pursue, who to build with, and whether an idea is new — into one explainable workflow.', M + 1.0, cy, CW - 1.3, chh, { fontSize: 16.5, bold: true, valign: 'middle', objectName: 'closing-text' })
    s.addNotes('Test counts from logs dated 29 Oct 2026: backend_pytest.txt (326 passed), frontend_vitest.txt (146 passed), e2e_summary.txt (248 passed), db_security.txt (49 passed, 0 failed). Database checks are a separate category and are not added to the test total.')
  }

  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log('wrote', OUT)
})()
