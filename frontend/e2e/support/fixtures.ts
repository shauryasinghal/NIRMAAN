import { test as base, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export { expect, AxeBuilder }
export const auth = (name: 'student' | 'onboarded' | 'other' | 'reviewer' | 'admin') => `e2e/.auth/${name}.json`

/** Every test fails on uncaught page errors and unexpected console errors (network-level "Failed to load resource" lines
 *  are ignored here because specs that provoke 4xx responses assert on them explicitly). */
export const test = base.extend<{ problems: string[] }>({
  problems: [async ({ page }, use) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`) })
    await use(problems)
    expect(problems, 'unexpected console/page errors').toEqual([])
  }, { auto: true }],
})

export async function waitForApp(page: Page) { await page.waitForLoadState('domcontentloaded'); await expect(page.locator('#root')).not.toBeEmpty() }

/** Creates a brand-new session for an account (so a test can log out / corrupt it without affecting shared state). */
export async function freshSession(context: import('@playwright/test').BrowserContext, email: string, password = 'E2e-pass-123') {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'x' }, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(`login failed: ${r.status}`)
  const session = await r.json()
  await context.addInitScript((s) => { if (!localStorage.getItem('sb-127-auth-token') || (window as unknown as { __resetAuth?: boolean }).__resetAuth !== false) localStorage.setItem('sb-127-auth-token', JSON.stringify(s)) }, session)
  return session as { access_token: string; refresh_token: string }
}
