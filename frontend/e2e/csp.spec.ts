import { test, expect, auth } from './support/fixtures'

// Runs ONLY under playwright.csp.config.ts: the production build served with the exact headers from vercel.json.
test.use({ storageState: auth('onboarded') })

type W = { __csp?: string[] }

test('the production build runs under the strict CSP with zero violations', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => { const w = window as unknown as W; w.__csp = [...(w.__csp ?? []), `${e.violatedDirective}: ${e.blockedURI}`] }))
  const res = await page.goto('/dashboard')
  const h = res!.headers()
  expect(h['content-security-policy']).toContain("script-src 'self'")
  expect(h['content-security-policy']).not.toContain("'unsafe-eval'")
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['x-frame-options']).toBe('DENY'); expect(h['strict-transport-security']).toContain('max-age=')
  await expect(page.getByText('Next best action')).toBeVisible()
  for (const path of ['/opportunities', '/team-builder', '/originality', '/applications', '/profile', '/settings']) { await page.goto(path); await expect(page.locator('h1').first()).toBeVisible() }
  await page.goto('/opportunities?sort=fit'); await page.getByRole('article').first().getByRole('link').first().click(); await expect(page.getByText('NIRMAAN fit')).toBeVisible()
  await page.keyboard.press('Control+k'); await expect(page.getByRole('dialog')).toBeVisible()
  const violations = await page.evaluate(() => (window as unknown as W).__csp ?? [])
  expect(violations, 'CSP violations').toEqual([])
})
