// node render_svg.mjs in.svg out.png [widthPx] [bgColor|transparent]
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const [, , inp, out, w = '1200', bg = '#0a0f1c'] = process.argv
const svg = readFileSync(inp, 'utf8')
const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 })
await p.setViewportSize({ width: Number(w), height: 1200 })
await p.setContent(`<body style="margin:0;background:${bg === 'transparent' ? 'transparent' : bg}"><div id=x style="width:${w}px">${svg.replace('<svg ', '<svg style="display:block;width:100%;height:auto" ')}</div></body>`)
const el = await p.$('#x'); await el.screenshot({ path: out, omitBackground: bg === 'transparent' }); await b.close()
