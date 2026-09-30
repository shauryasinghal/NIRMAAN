import { test, expect, auth } from './support/fixtures'
import type { Locator, Page } from '@playwright/test'

/**
 * Brand identity: the traced NIRMAAN logo is the only brand anywhere. Real browser, real geometry.
 * (frontend/brand-src/ turns the supplied reference into one geometry; everything below is checked against what actually renders.)
 */
const WIDTHS: [number, number][] = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [375, 812]]
const RATIO = { full: 3.8546, compact: 3.7491, mark: 0.8754 }

const SVG = ['/favicon.svg', '/brand/nirmaan-logo.svg', '/brand/nirmaan-logo-light.svg', '/brand/nirmaan-logo-compact.svg', '/brand/nirmaan-logo-compact-light.svg', '/brand/nirmaan-mark.svg']
const PNG: [string, number, number][] = [['/favicon-16.png', 16, 16], ['/favicon-32.png', 32, 32], ['/apple-touch-icon.png', 180, 180], ['/icon-192.png', 192, 192], ['/icon-512.png', 512, 512], ['/brand/og-image.png', 1200, 630]]

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Every brand SVG on screen: undistorted (rendered box matches its viewBox ratio) and fully inside the viewport. */
async function checkLogos(page: Page, min = 1) {
  const logos = page.locator('svg[viewBox]:visible').filter({ has: page.locator('linearGradient') })
  expect(await logos.count(), 'brand logos on screen').toBeGreaterThanOrEqual(min)
  const vw = page.viewportSize()!.width
  for (let i = 0; i < await logos.count(); i++) {
    const l = logos.nth(i); const b = (await l.boundingBox())!; const [, , w, h] = (await l.getAttribute('viewBox'))!.split(' ').map(Number)
    expect(Math.abs(b.width / b.height - w / h) / (w / h), `logo ${i} aspect ratio (box ${b.width.toFixed(1)}x${b.height.toFixed(1)})`).toBeLessThan(0.015)
    expect(b.x, `logo ${i} left edge`).toBeGreaterThanOrEqual(-0.5); expect(b.x + b.width, `logo ${i} right edge`).toBeLessThanOrEqual(vw + 0.5)
    expect(b.width, `logo ${i} is big enough to read`).toBeGreaterThan(14)
  }
}

/** WCAG contrast between a logo's text colour and the first opaque background behind it. */
async function contrast(logo: Locator) {
  return logo.evaluate((el) => {
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
    let bg = [255, 255, 255]; for (let n: Element | null = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length === 3 || c[3] > 0.9)) { bg = c; break } }
    const fg = parse(getComputedStyle(el).color); const [a, b] = [lum(fg), lum(bg)]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

test.describe('assets & metadata', () => {
  for (const url of SVG) test(`${url} is served as a valid SVG`, async ({ request }) => {
    const r = await request.get(url); expect(r.status()).toBe(200); expect(r.headers()['content-type']).toContain('image/svg+xml')
    const body = await r.text(); expect(body).toMatch(/^<svg[^>]+viewBox="[\d. -]+"/); expect(body).toContain('</svg>'); expect(body).not.toMatch(/<image|data:image|base64/i)   // vector only, never an embedded screenshot
  })
  for (const [url, w, h] of PNG) test(`${url} is a ${w}x${h} PNG`, async ({ request }) => {
    const r = await request.get(url); expect(r.status()).toBe(200); expect(r.headers()['content-type']).toContain('image/png')
    const b = await r.body(); expect(b.subarray(1, 4).toString()).toBe('PNG'); expect(b.readUInt32BE(16)).toBe(w); expect(b.readUInt32BE(20)).toBe(h)
  })
  test('the web manifest names the app and points at real icons', async ({ request }) => {
    const r = await request.get('/site.webmanifest'); expect(r.status()).toBe(200); const m = await r.json()
    expect(m.name).toBe('NIRMAAN'); expect(m.icons.length).toBeGreaterThanOrEqual(2)
    for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200)
  })
  test('title, description, icons and social tags all say NIRMAAN — Discover, Validate, Build', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('NIRMAAN — Discover, Validate, Build')
    const meta = (sel: string, attr = 'content') => page.locator(sel).first().getAttribute(attr)
    expect(await meta('meta[name="description"]')).toMatch(/discover.*validate.*build|discover opportunities/i)
    expect(await meta('link[rel="icon"][type="image/svg+xml"]', 'href')).toBe('/favicon.svg')
    expect(await meta('link[rel="icon"][sizes="32x32"]', 'href')).toBe('/favicon-32.png')
    expect(await meta('link[rel="apple-touch-icon"]', 'href')).toBe('/apple-touch-icon.png')
    expect(await meta('link[rel="manifest"]', 'href')).toBe('/site.webmanifest')
    expect(await meta('meta[property="og:title"]')).toBe('NIRMAAN — Discover, Validate, Build'); expect(await meta('meta[property="og:image"]')).toContain('/brand/og-image.png')
    expect(await meta('meta[property="og:image:alt"]')).toContain('NIRMAAN'); expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(await meta('meta[name="theme-color"]')).toBe('#0a0f1c')
  })
  test('no old branding survives: no competing tagline, no Vite starter icon', async ({ page }) => {
    await page.goto('/'); await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByText(/AI Operating System/i)).toHaveCount(0)
    expect(await page.content()).not.toMatch(/AI Operating System|vite\.svg|icons\.svg/i)
  })
})

test.describe('public pages', () => {
  for (const [w, h] of WIDTHS) {
    test(`landing + login + register at ${w}px: logos undistorted, inside the viewport, no horizontal scroll`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/'); await expect(page.getByRole('heading', { name: 'Build what comes next.' })).toBeVisible(); await page.waitForTimeout(1300)   // hero fade-in
      await checkLogos(page, 2); expect(await overflow(page)).toBeLessThanOrEqual(0)
      const hero = (await page.locator('section svg[viewBox]').first().boundingBox())!; expect(hero.width, 'hero lockup is bounded').toBeLessThanOrEqual(340)
      await expect(page.getByRole('link', { name: 'NIRMAAN — home' })).toBeVisible()                                   // navbar brand is a link home
      await page.screenshot({ path: info.outputPath(`landing-${w}.png`) })
      for (const path of ['/login', '/register']) {
        await page.goto(path); await expect(page.locator('main h1')).toBeVisible(); await checkLogos(page, 1); expect(await overflow(page)).toBeLessThanOrEqual(0)
        const box = (await page.locator('main svg[viewBox]').first().boundingBox())!
        if (w >= 768) { expect(box.width, 'auth lockup is prominent on desktop').toBeGreaterThan(260); expect(box.width, 'but not oversized').toBeLessThanOrEqual(310) }
        if (w < 768) expect(box.width, 'fits a phone with margin').toBeLessThanOrEqual(w - 32 + 0.5)
        if (path === '/login') await page.screenshot({ path: info.outputPath(`login-${w}.png`) })
      }
    })
  }
  test('the landing navbar shows the compact lockup and the footer the full one', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/'); await expect(page.getByRole('heading', { name: 'Build what comes next.' })).toBeVisible()
    const nav = page.getByRole('link', { name: 'NIRMAAN — home' }).locator('svg')
    expect(Math.abs((await nav.boundingBox())!.width / (await nav.boundingBox())!.height - RATIO.compact)).toBeLessThan(0.06)
    const foot = page.locator('footer svg[viewBox]'); await foot.scrollIntoViewIfNeeded()
    expect(Math.abs((await foot.boundingBox())!.width / (await foot.boundingBox())!.height - RATIO.full)).toBeLessThan(0.06)
    await expect(page.locator('footer svg[viewBox]')).toHaveAttribute('role', 'img'); await expect(page.locator('footer svg[viewBox]')).toHaveAttribute('aria-label', 'NIRMAAN')
  })
  for (const theme of ['light', 'dark'] as const) {
    test(`the wordmark stays legible in the ${theme} theme (contrast >= 4.5:1 on the landing page, login and hero)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nirmaan_theme', t), theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/'); await expect(page.getByRole('heading', { name: 'Build what comes next.' })).toBeVisible(); await page.waitForTimeout(1300)
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark')
      const logos = page.locator('svg[viewBox]:visible').filter({ has: page.locator('linearGradient') })
      for (let i = 0; i < await logos.count(); i++) expect(await contrast(logos.nth(i)), `landing logo ${i}`).toBeGreaterThanOrEqual(4.5)
      await page.goto('/login'); await expect(page.locator('main svg[viewBox]').first()).toBeVisible()
      expect(await contrast(page.locator('main svg[viewBox]').first()), 'login logo').toBeGreaterThanOrEqual(4.5)
    })
  }
})

test.describe('signed-in app shell', () => {
  test.use({ storageState: auth('onboarded') })
  test('desktop sidebar: compact lockup linking to the dashboard; collapsing swaps it for the mark alone', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 }); await page.goto('/opportunities'); await expect(page.getByRole('heading', { name: 'Opportunities' }).first()).toBeVisible()
    const link = page.getByRole('link', { name: 'NIRMAAN — go to dashboard' }).first(); const logo = link.locator('svg:visible')   // `auto` holds three layouts; CSS shows one
    let b = (await logo.boundingBox())!; expect(Math.abs(b.width / b.height - RATIO.compact)).toBeLessThan(0.06); expect(b.height).toBeGreaterThan(24)
    expect(await contrast(logo), 'white wordmark on the always-dark sidebar').toBeGreaterThanOrEqual(7)
    await page.screenshot({ path: info.outputPath('sidebar-expanded.png') })
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect.poll(async () => { const c = (await logo.boundingBox())!; return +(c.width / c.height).toFixed(2) }, { message: 'collapsed sidebar shows the mark alone' }).toBeLessThan(1)
    b = (await logo.boundingBox())!; expect(Math.abs(b.width / b.height - RATIO.mark)).toBeLessThan(0.06)
    const aside = (await page.locator('aside.bg-navy-900').boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(aside.x); expect(b.x + b.width).toBeLessThanOrEqual(aside.x + aside.width)
    await page.screenshot({ path: info.outputPath('sidebar-collapsed.png') })
    await link.click(); await expect(page).toHaveURL(/\/dashboard/)                                                      // the logo goes home
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect.poll(async () => { const c = (await logo.boundingBox())!; return c.width / c.height }).toBeGreaterThan(3)
  })
  for (const [w, h] of WIDTHS) {
    test(`dashboard at ${w}px: shell logo undistorted, no horizontal scroll`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h }); await page.goto('/dashboard'); await expect(page.getByText('Next best action')).toBeVisible()
      await checkLogos(page, 1); expect(await overflow(page)).toBeLessThanOrEqual(0)
      await expect(page.getByRole('link', { name: 'NIRMAAN — go to dashboard' }).first()).toBeVisible()
      if (w < 768) { const b = (await page.locator('header svg[viewBox]:visible').first().boundingBox())!; expect(Math.abs(b.width / b.height - RATIO.compact)).toBeLessThan(0.06) }   // mobile: mark + NIRMAAN, no tagline
      await page.screenshot({ path: info.outputPath(`dashboard-${w}.png`) })
    })
  }
})

test.describe('onboarding', () => {
  test.use({ storageState: auth('student') })
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]] as [number, number][]) {
    test(`onboarding at ${w}px: compact lockup above the progress bar, nothing overflows`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h }); await page.goto('/onboarding'); await expect(page.getByRole('heading', { name: /Tell us about you/ })).toBeVisible()
      await checkLogos(page, 1); expect(await overflow(page)).toBeLessThanOrEqual(0)
      const logo = page.locator('svg[viewBox]:visible').first(); const prog = (await page.getByRole('list', { name: 'Progress' }).boundingBox())!
      expect((await logo.boundingBox())!.y + (await logo.boundingBox())!.height, 'logo sits above the progress bar').toBeLessThan(prog.y)
      await expect(logo).toHaveAttribute('aria-label', 'NIRMAAN'); await page.screenshot({ path: info.outputPath(`onboarding-${w}.png`) })
    })
  }
})

test('the 404 page carries the full lockup', async ({ page }) => {
  await page.goto('/definitely-not-a-page'); await expect(page.getByRole('heading', { name: /couldn't find that page/ })).toBeVisible()
  await checkLogos(page, 1); expect(await overflow(page)).toBeLessThanOrEqual(0)
  const b = (await page.locator('main svg[viewBox]').first().boundingBox())!; expect(Math.abs(b.width / b.height - RATIO.full)).toBeLessThan(0.06)
})
