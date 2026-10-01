import type { Page } from '@playwright/test'
import { test, expect, auth, AxeBuilder } from './support/fixtures'

async function scan(page: Page, label: string) {
  const run = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  let bad = await run()
  // Colour contrast is computed from live styles, so a page still mid-transition (route fade-in, slow CI runner) reports false violations.
  // Re-scan for a few seconds while contrast is the ONLY problem; a real, persistent violation still fails, and any other rule fails at once.
  for (let i = 0; i < 10 && bad.length && bad.every((v) => v.id === 'color-contrast'); i++) { await page.waitForTimeout(500); bad = await run() }
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(' ')}`), `axe violations on ${label}`).toEqual([])
}
// Scan the SETTLED page. `networkidle` can fire while entrance animations (e.g. the landing hero's ~1.3s fade-in) are still running, and a
// half-transparent button genuinely has low computed contrast. The animation library marks what it animates with an inline `opacity` style,
// so wait until every such element in the first viewport has finished fading in (scroll-reveals below the fold stay hidden by design).
const ready = async (page: Page) => {
  await page.waitForLoadState('networkidle'); await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('body [style*="opacity"]')].every((el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.top >= innerHeight || r.bottom <= 0) return true
    if (!el.textContent?.trim()) return true                                  // contrast only concerns text; empty decorative layers (hover highlights) rest at opacity 0 by design
    return getComputedStyle(el).opacity === '1'
  }), undefined, { timeout: 15_000 })
}

test.describe('public pages', () => {
  for (const path of ['/', '/login', '/register', '/forgot-password']) test(`axe: ${path}`, async ({ page }) => { await page.goto(path); await ready(page); await scan(page, path) })
  test('axe: landing in dark mode', async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nirmaan_theme', 'dark')); await page.goto('/'); await ready(page); await scan(page, '/ (dark)') })
  test('keyboard: skip link is reachable and login is operable without a mouse', async ({ page }) => {
    await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    for (let i = 0; i < 8 && !(await page.getByLabel('Email').evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab')   // Email is reachable by keyboard alone
    await expect(page.getByLabel('Email')).toBeFocused()
    const ring = await page.getByLabel('Email').evaluate((e) => getComputedStyle(e).outlineStyle); expect(ring).not.toBe('none')   // visible focus indicator
    await page.getByLabel('Email').focus(); await page.keyboard.type('nobody@nirmaan.test'); await page.keyboard.press('Tab'); await page.keyboard.type('x'); await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toBeVisible()
  })
})

test.describe('student pages', () => {
  test.use({ storageState: auth('onboarded') })
  const pages = ['/dashboard', '/opportunities', '/saved', '/organizations', '/applications', '/smart-alerts', '/notifications', '/activity', '/team-builder', '/originality', '/originality/history', '/profile', '/settings']
  for (const path of pages) {
    test(`axe: ${path}`, async ({ page }) => { await page.goto(path); await ready(page); await scan(page, path) })
  }
  test('axe: opportunity detail, compare, organization', async ({ page }) => {
    await page.goto('/opportunities?sort=fit'); await ready(page)
    const href = await page.getByRole('article').first().getByRole('link').first().getAttribute('href')
    await page.goto(href!); await ready(page); await scan(page, 'opportunity detail')
    await page.goto('/opportunities?sort=fit'); await ready(page)
    const ids = await page.getByRole('article').evaluateAll((els) => els.slice(0, 3).map((e) => e.querySelector('a')!.getAttribute('href')!.split('/').pop()))
    await page.goto(`/compare?ids=${ids.join(',')}`); await ready(page); await scan(page, 'compare')
    await page.goto('/organizations/razorpay'); await ready(page); await scan(page, 'organization')
  })
  test('axe: open dialogs (new alert, command palette, mobile menu)', async ({ page }) => {
    await page.goto('/smart-alerts'); await page.getByRole('button', { name: /New alert/ }).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); await scan(page, 'alert dialog'); await page.keyboard.press('Escape')
    await page.goto('/dashboard'); await expect(page.getByText('Next best action')).toBeVisible(); await page.keyboard.press('Control+k'); await expect(page.getByRole('dialog', { name: 'Search NIRMAAN' })).toBeVisible(); await scan(page, 'command palette')
    await page.keyboard.type('saved'); await expect(page.getByRole('option').first()).toHaveText(/Saved opportunities/); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\/saved/)
  })
  test('axe: dark mode dashboard and opportunities', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nirmaan_theme', 'dark'))
    for (const p of ['/dashboard', '/opportunities']) { await page.goto(p); await ready(page); await scan(page, `${p} (dark)`) }
  })
})

test.describe('staff pages', () => {
  test('axe: reviewer queue, review detail', async ({ browser }) => {
    const c = await browser.newContext({ storageState: auth('reviewer') }); const page = await c.newPage()
    await page.goto('/review'); await ready(page); await scan(page, '/review')
    await page.getByRole('link', { name: /Teammate matcher/ }).first().click()
    await expect(page).toHaveURL(/\/review\/.+/); await expect(page.getByRole('heading', { level: 1 })).toBeVisible()   // the route change has really happened, so `ready` cannot pass against the outgoing page's settled opacity
    await ready(page); await scan(page, 'review detail'); await c.close()
  })
  test('axe: admin', async ({ browser }) => {
    const c = await browser.newContext({ storageState: auth('admin') }); const page = await c.newPage()
    await page.goto('/admin'); await ready(page); await scan(page, '/admin users')
    for (const t of ['Audit log', 'Ingestion']) { await page.getByRole('tab', { name: t }).click(); await ready(page); await scan(page, `/admin ${t}`) }
    await c.close()
  })
})
