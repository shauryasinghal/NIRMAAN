// node brand-src/render_icons.mjs   (run from frontend/)  — PNG assets rendered from the SAME SVG geometry as everything else.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(f, 'utf8')
const mark = read('public/favicon.svg')                 // square viewBox, mark centred with breathing room
const logo = read('public/brand/nirmaan-logo.svg')      // full lockup, white wordmark (for the dark navy card)
const NAVY = '#0a0f1c'
const fit = (svg, css) => svg.replace('<svg ', `<svg style="${css}" `)

const b = await chromium.launch()
async function shot(html, w, h, out, transparent = false) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.setContent(`<body style="margin:0;background:${transparent ? 'transparent' : NAVY}">${html}</body>`)
  await p.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } }); await p.close()
  console.log('  ', out)
}
// favicon fallback: mark only, transparent, 32px (+16 for old tab strips)
await shot(`<div style="width:32px;height:32px">${fit(mark, 'display:block;width:100%;height:100%')}</div>`, 32, 32, 'public/favicon-32.png', true)
await shot(`<div style="width:16px;height:16px">${fit(mark, 'display:block;width:100%;height:100%')}</div>`, 16, 16, 'public/favicon-16.png', true)
// app icons: dark navy tile, mark at ~62% (keeps a safe margin so maskable crops never clip it)
const tile = (s, pct) => `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:${NAVY}"><div style="width:${pct}%;height:${pct}%">${fit(mark, 'display:block;width:100%;height:100%')}</div></div>`
await shot(tile(180, 66), 180, 180, 'public/apple-touch-icon.png')
await shot(tile(192, 62), 192, 192, 'public/icon-192.png')
await shot(tile(512, 62), 512, 512, 'public/icon-512.png')
// social preview 1200x630: the full lockup on the brand navy, generous margins
await shot(`<div style="width:1200px;height:630px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 42%, #101a33 0%, ${NAVY} 62%)"><div style="width:800px">${fit(logo, 'display:block;width:100%;height:auto')}</div></div>`, 1200, 630, 'public/brand/og-image.png')
await b.close()
