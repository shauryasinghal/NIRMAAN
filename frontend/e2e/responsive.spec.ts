import { test, expect, auth } from './support/fixtures'

const WIDTHS = [320, 375, 414, 768, 1024, 1280, 1440, 1920]
const PUBLIC = ['/', '/login', '/register']
const AUTHED = ['/dashboard', '/opportunities', '/team-builder', '/applications', '/originality', '/smart-alerts', '/profile', '/settings', '/notifications', '/organizations']

async function noOverflow(page: import('@playwright/test').Page, label: string) {
  await page.waitForLoadState('networkidle')
  const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth,
    wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 0 && !e.closest('[class*="overflow-x-auto"],[class*="snap-x"],table,.sr-only,[aria-hidden="true"]') && getComputedStyle(e).position !== 'fixed' }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`) }))
  expect(o.doc, `${label}: page scrolls horizontally (${o.doc} > ${o.win}); offenders: ${o.wide.join(', ')}`).toBeLessThanOrEqual(o.win + 1)
}

for (const w of WIDTHS) {
  test.describe(`viewport ${w}px`, () => {
    test.use({ viewport: { width: w, height: w < 768 ? 800 : 900 } })
    for (const p of PUBLIC) test(`public ${p}`, async ({ page }) => { await page.goto(p); await noOverflow(page, `${p} @${w}`); await expect(page.locator('h1').first()).toBeVisible() })
    test.describe('signed in', () => {
      test.use({ storageState: auth('onboarded') })
      for (const p of AUTHED) test(p, async ({ page }) => { await page.goto(p); await expect(page.locator('h1').first()).toBeVisible(); await noOverflow(page, `${p} @${w}`) })
      test('detail + compare + dialogs fit', async ({ page }) => {
        await page.goto('/opportunities?sort=fit'); await expect(page.getByRole('article').first()).toBeVisible()
        const hrefs = await page.getByRole('article').evaluateAll((els) => els.slice(0, 3).map((e) => e.querySelector('a')!.getAttribute('href')!))
        await page.goto(hrefs[0]); await expect(page.getByText('NIRMAAN fit')).toBeVisible(); await noOverflow(page, `detail @${w}`)
        await page.goto(`/compare?ids=${hrefs.map((h) => h.split('/').pop()).join(',')}`); await expect(page.getByRole('table')).toBeVisible(); await noOverflow(page, `compare @${w}`)   // the table scrolls inside its own container
        await page.goto('/smart-alerts'); await page.getByRole('button', { name: /New alert/ }).first().click()
        const box = await page.getByRole('dialog').boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(-1); expect(box!.x + box!.width).toBeLessThanOrEqual(w + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(900)
      })
      if (w < 768) test('mobile navigation reaches every area and targets are ≥ 44px', async ({ page }) => {
        await page.goto('/dashboard'); const nav = page.getByRole('navigation', { name: 'Primary' }); await expect(nav).toBeVisible()
        for (const b of await nav.getByRole('link').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await nav.getByRole('button', { name: 'Menu' }).click()
        for (const name of ['Team Builder', 'Originality', 'Smart Alerts', 'Profile', 'Settings', 'Organizations']) await expect(page.getByRole('dialog').getByRole('link', { name })).toBeVisible()
        await page.getByRole('dialog').getByRole('link', { name: 'Team Builder' }).click(); await expect(page).toHaveURL(/team-builder/)
      })
      if (w >= 1024) test('desktop shows the sidebar and filters', async ({ page }) => { await page.goto('/opportunities'); await expect(page.getByRole('complementary').first()).toBeVisible(); await expect(page.getByRole('form', { name: 'Filters' })).toBeVisible() })
      if (w < 1024) test('mobile filters open in a dialog and apply', async ({ page }) => {
        await page.goto('/opportunities'); await page.getByRole('button', { name: /Filters/ }).click(); const d = page.getByRole('dialog', { name: 'Filters' })
        await d.getByRole('checkbox', { name: /^Hackathon/ }).check(); await d.getByRole('button', { name: /Show .* results/ }).click(); await expect(page).toHaveURL(/category=Hackathon/)
      })
    })
  })
}
