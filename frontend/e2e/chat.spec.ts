import type { Page, Route } from '@playwright/test'
import { test, expect, auth, AxeBuilder } from './support/fixtures'

/**
 * The AI assistant UI against a MOCKED network: the e2e backend runs with chat switched off (no key, no provider), so /api/chat/status and
 * /api/chat are answered here. Incremental delivery is covered by the unit tests (page.route delivers a body in one piece); what this file
 * proves is the real browser behaviour: layout at phone widths, keyboard and focus, axe, what is sent, and that nothing is stored.
 */
test.use({ storageState: auth('onboarded') })

const LAUNCHER = 'Open the NIRMAAN assistant'
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const answer = (text: string) => frame('meta', { requestId: 'req-e2e' }) + frame('delta', { text: text.slice(0, 6) }) + frame('delta', { text: text.slice(6) }) + frame('done', { stopReason: 'end_turn' })
const sse = (route: Route, body: string) => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body })

type Provider = 'anthropic' | 'gemini'
async function enableChat(page: Page, onChat: (route: Route, n: number) => Promise<void> | void = (r) => sse(r, answer('Hello from the assistant.')), provider: Provider = 'anthropic') {
  let n = 0
  await page.route('**/api/chat/status', (r) => r.fulfill({ json: { enabled: true, provider, providerName: provider === 'gemini' ? 'Google Gemini' : 'Anthropic' } }))
  await page.route('**/api/chat', (r) => onChat(r, n++))
}

async function settled(page: Page) {                      // same idea as a11y.spec: axe reads live styles, so wait out entrance animations first
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('body [style*="opacity"]')].every((el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.top >= innerHeight || r.bottom <= 0 || !el.textContent?.trim()) return true
    return getComputedStyle(el).opacity === '1'
  }), undefined, { timeout: 15_000 })
}
async function scan(page: Page, label: string) {
  const run = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  let bad = await run()
  for (let i = 0; i < 10 && bad.length && bad.every((v) => v.id === 'color-contrast'); i++) { await page.waitForTimeout(500); bad = await run() }
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(' ')}`), `axe violations on ${label}`).toEqual([])
}
const open = async (page: Page) => { await page.getByRole('button', { name: LAUNCHER }).click(); const d = page.getByRole('dialog', { name: 'NIRMAAN assistant' }); await expect(d).toBeVisible(); return d }
const ask = async (page: Page, text: string) => { await page.getByLabel('Your message').fill(text); await page.keyboard.press('Enter') }

test('the disclosure names Google Gemini and explains the free-tier data use, and the panel is still accessible', async ({ page }) => {
  await enableChat(page, undefined, 'gemini'); await page.goto('/dashboard'); await settled(page)
  const dialog = await open(page)
  await expect(dialog.getByText(/sent to Google Gemini/)).toBeVisible()
  await expect(dialog.getByText(/free tier.*may be used to improve Google's products.*paid tier it is not.*can't tell which tier/)).toBeVisible()
  await expect(dialog.getByText(/Anthropic/)).toHaveCount(0)
  await scan(page, 'assistant: gemini disclosure')
})

test('the launcher is absent when the API says the assistant is off', async ({ page }) => {
  await page.route('**/api/chat/status', (r) => r.fulfill({ json: { enabled: false } }))
  await page.goto('/dashboard'); await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: LAUNCHER })).toHaveCount(0)
})

test('ask → streamed answer; the request carries the bearer token and only the conversation', async ({ page }) => {
  let seen: { auth?: string; body?: unknown } = {}
  await enableChat(page, (route) => { seen = { auth: route.request().headers()['authorization'], body: route.request().postDataJSON() }; return sse(route, answer('Hello from the assistant.')) })
  await page.goto('/dashboard'); const dialog = await open(page)
  await expect(dialog.getByText(/sent to Anthropic/)).toBeVisible()                    // the AI disclosure is visible
  await ask(page, 'Which hackathons fit me?')
  await expect(dialog.getByRole('log').getByText('Hello from the assistant.')).toBeVisible()
  await expect(dialog.getByRole('log').getByText('Which hackathons fit me?')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Send' })).toBeVisible()
  expect(seen.auth).toMatch(/^Bearer .{20,}/)
  expect(seen.body).toEqual({ messages: [{ role: 'user', content: 'Which hackathons fit me?' }] })
})

test('a server error event and a failed request each show a safe message, and Retry recovers', async ({ page }) => {
  await enableChat(page, (route, n) => {
    if (n === 0) return route.fulfill({ status: 503, json: { error: { code: 'service_unavailable', message: 'The assistant is not available right now.', requestId: 'r-503' } } })
    if (n === 1) return sse(route, frame('delta', { text: 'part' }) + frame('error', { code: 'provider_busy', message: 'The assistant is busy right now. Please try again in a moment.', requestId: 'r-busy' }))
    return sse(route, answer('Recovered answer.'))
  })
  await page.goto('/dashboard'); const dialog = await open(page)
  await ask(page, 'first try')
  await expect(dialog.getByRole('alert')).toContainText('The assistant is not available right now.')
  await dialog.getByRole('button', { name: 'Retry' }).click()
  await expect(dialog.getByRole('alert')).toContainText('busy right now'); await expect(dialog.getByRole('alert')).toContainText('Reference: r-busy')
  await expect(dialog.getByText('part')).toBeVisible()
  await dialog.getByRole('button', { name: 'Retry' }).click()
  await expect(dialog.getByText('Recovered answer.')).toBeVisible(); await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('model output is shown as text, never as HTML', async ({ page }) => {
  const evil = '<img src=x onerror="window.__pwned=1"> **bold** [x](https://evil.example)'
  await enableChat(page, (route) => sse(route, frame('delta', { text: evil }) + frame('done', {})))
  await page.goto('/dashboard'); const dialog = await open(page)
  await ask(page, 'hi')
  await expect(dialog.getByRole('log').getByText(evil, { exact: true })).toBeVisible()
  expect(await dialog.getByRole('log').locator('img, a, strong').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})

test('keyboard: open from the launcher, focus stays in the dialog, Escape closes and returns focus', async ({ page }) => {
  await enableChat(page); await page.goto('/dashboard')
  const launcher = page.getByRole('button', { name: LAUNCHER }); await launcher.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'NIRMAAN assistant' }); await expect(dialog).toBeVisible()
  await expect(page.getByLabel('Your message')).toBeFocused()
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true) }      // focus never leaves the dialog
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(launcher).toBeFocused()
})

test('the conversation lives in memory only: no chat keys or content in storage or cookies, gone after a reload', async ({ page }) => {
  await enableChat(page); await page.goto('/dashboard')
  const dialog = await open(page); await ask(page, 'a private question 4711')
  await expect(dialog.getByText('Hello from the assistant.')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)         // closed, so everything is settled; the app's own keys (auth session, theme, recent pages) may exist
  const stored = await page.evaluate(() => ({
    keys: [...Object.keys(localStorage), ...Object.keys(sessionStorage)],
    all: JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    cookie: document.cookie,
  }))
  expect(stored.keys.some((k) => k.startsWith('sb-')), 'sanity: the auth session is still stored, so this check is looking at real storage').toBe(true)
  expect(stored.keys.filter((k) => /chat|assistant|conversation|message/i.test(k)), 'chat-specific storage keys').toEqual([])
  for (const secret of ['4711', 'private question', 'Hello from the assistant']) {
    expect(stored.all, `"${secret}" must not be in storage`).not.toContain(secret)
    expect(stored.cookie, `"${secret}" must not be in cookies`).not.toContain(secret)
  }
  await page.reload(); await open(page)
  await expect(page.getByText('a private question 4711')).toHaveCount(0); await expect(page.getByText('How can I help?')).toBeVisible()
})

test.describe('accessibility (axe)', () => {
  test('panel: empty, conversation and error states', async ({ page }) => {
    await enableChat(page, (route, n) => (n === 0 ? sse(route, answer('Hello from the assistant.')) : route.fulfill({ status: 503, json: { error: { code: 'service_unavailable', message: 'The assistant is not available right now.' } } })))
    await page.goto('/dashboard'); await expect(page.getByText('Next best action')).toBeVisible(); await settled(page)
    await scan(page, 'launcher on dashboard')
    const dialog = await open(page); await scan(page, 'assistant: empty')
    await ask(page, 'hello'); await expect(dialog.getByText('Hello from the assistant.')).toBeVisible(); await scan(page, 'assistant: conversation')
    await ask(page, 'again'); await expect(dialog.getByRole('alert')).toBeVisible(); await scan(page, 'assistant: error')
  })
  test('panel in dark mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nirmaan_theme', 'dark'))
    await enableChat(page); await page.goto('/dashboard'); await settled(page)
    const dialog = await open(page); await ask(page, 'hello'); await expect(dialog.getByText('Hello from the assistant.')).toBeVisible()
    await scan(page, 'assistant: dark')
  })
})

for (const width of [320, 375, 414, 768]) {
  test.describe(`viewport ${width}px`, () => {
    test.use({ viewport: { width, height: 700 } })
    for (const provider of ['anthropic', 'gemini'] as const) test(`launcher clears the bottom nav, and the panel fits with the composer reachable (${provider})`, async ({ page }) => {
      await enableChat(page, undefined, provider); await page.goto('/dashboard'); await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      const l = (await page.getByRole('button', { name: LAUNCHER }).boundingBox())!
      expect(l.x).toBeGreaterThanOrEqual(0); expect(l.x + l.width).toBeLessThanOrEqual(width); expect(l.width).toBeGreaterThanOrEqual(44); expect(l.height).toBeGreaterThanOrEqual(44)
      if (width < 768) {
        const nav = (await page.getByRole('navigation', { name: 'Primary' }).boundingBox())!
        expect(l.y + l.height, 'launcher overlaps the bottom navigation').toBeLessThanOrEqual(nav.y)
      }
      const dialog = await open(page); await ask(page, 'hello'); await expect(dialog.getByText('Hello from the assistant.')).toBeVisible()
      const d = (await dialog.boundingBox())!
      expect(d.x).toBeGreaterThanOrEqual(-1); expect(d.x + d.width).toBeLessThanOrEqual(width + 1); expect(d.y).toBeGreaterThanOrEqual(-1); expect(d.y + d.height).toBeLessThanOrEqual(700 + 1)
      await expect(page.getByLabel('Your message')).toBeInViewport(); await expect(dialog.getByRole('button', { name: 'Send' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    })
  })
}
