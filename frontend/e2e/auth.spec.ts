import { test, expect, freshSession } from './support/fixtures'
import { PASSWORD } from './support/global-setup'

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

test.describe('sign up → onboarding → dashboard', () => {
  test('a new student signs up, finishes onboarding and lands on a personalised dashboard', async ({ page }) => {
    const email = `new+${uniq()}@nirmaan.test`
    await page.goto('/register')
    await expect(page.getByLabel(/role/i)).toHaveCount(0)                                   // no client-chosen role exists
    await page.getByLabel('Full name').fill('Test Newcomer'); await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD); await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/onboarding/)
    // 1 About you
    await page.getByLabel('Branch / field of study').fill('CSE (AI/ML)')
    await page.getByRole('button', { name: 'Continue' }).click()
    // 2 Skills: continuing with none is refused
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toContainText('at least one skill')
    await page.getByPlaceholder('Search skills…').fill('python'); await page.getByRole('button', { name: 'python', exact: true }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    // 3 Interests
    await page.getByRole('button', { name: 'AI/ML', exact: true }).click(); await page.getByRole('button', { name: 'Continue' }).click()
    // 4 Preferences (team visibility defaults OFF)
    await expect(page.getByRole('switch', { name: /let other students find me/i })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('button', { name: 'Continue' }).click()
    // 5 Resume (optional) → finish
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Working late/ })).toContainText('Test')
    await expect(page.getByText('Next best action')).toBeVisible()
    await expect(page.getByRole('main').getByText('Saved', { exact: true })).toBeVisible()
    // the server says this account is a student, and reviewer/admin areas are closed to it
    await page.goto('/admin'); await expect(page).toHaveURL(/\/dashboard/)
    await page.goto('/review'); await expect(page).toHaveURL(/\/dashboard/)
  })

  test('signup with an already-registered email says so', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Full name').fill('Dup'); await page.getByLabel('Email').fill('e2e-other@nirmaan.test')
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD); await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('already exists')
  })

  test('email verification: an unconfirmed signup is told to check their inbox, and cannot log in yet', async ({ page }) => {
    const email = `unverified+${uniq()}@nirmaan.test`
    await page.goto('/register')
    await page.getByLabel('Full name').fill('Unverified'); await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD); await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible(); await expect(page.getByText(email)).toBeVisible()
    await page.goto('/login'); await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill(PASSWORD); await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText('confirm your email'); await expect(page.getByRole('button', { name: /resend verification/i })).toBeVisible()
  })
})

test.describe('login, sessions, logout', () => {
  test('wrong password shows a friendly error; correct one lands on the dashboard and survives a reload', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('e2e-onboarded@nirmaan.test'); await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Log in' }).click(); await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await page.getByLabel('Password').fill(PASSWORD); await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/dashboard/); await page.reload(); await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText('Next best action')).toBeVisible()
  })
  test('form validation happens before any request', async ({ page }) => {
    await page.goto('/login'); await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Enter your password')).toBeVisible(); await expect(page.getByText('Enter your email')).toBeVisible()
  })
  test('protected pages redirect to login and return you after signing in (deep link)', async ({ page }) => {
    await page.goto('/opportunities?category=Hackathon')
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.getByLabel('Email').fill('e2e-onboarded@nirmaan.test'); await page.getByLabel('Password').fill(PASSWORD); await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/opportunities\?category=Hackathon/)
  })
  test('logging out ends the session everywhere (server-side revocation)', async ({ browser }) => {
    const ctx = await browser.newContext(); await freshSession(ctx, 'e2e-other@nirmaan.test'); const page = await ctx.newPage()
    await page.goto('/dashboard'); await expect(page.getByText('Next best action')).toBeVisible()
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token')!).access_token)
    await page.getByRole('button', { name: /Other Student/ }).click()
    await page.getByRole('banner').getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    const replay = await page.request.get('http://127.0.0.1:8000/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    expect(replay.status()).toBe(401)                                                       // the old token is dead even though it hasn't expired
    await ctx.close()
  })
  test('a session whose tokens are both dead is sent back to login; a bad access token alone is silently refreshed', async ({ browser }) => {
    const ctx = await browser.newContext(); const fresh = await freshSession(ctx, 'e2e-other@nirmaan.test'); const page = await ctx.newPage()
    void fresh
    // 1) corrupt only the access token: the API answers 401, supabase-js refreshes, the page still works
    await page.addInitScript(() => { const k = 'sb-127-auth-token'; const s = JSON.parse(localStorage.getItem(k)!); s.access_token = s.access_token.slice(0, -4) + 'AAAA'; s.expires_at = Math.floor(Date.now() / 1000) + 3600; localStorage.setItem(k, JSON.stringify(s)) })
    await page.goto('/dashboard'); await expect(page.getByText('Next best action')).toBeVisible()
    await ctx.close()
    // 2) corrupt both: nothing can recover it → back to login with an "expired" notice
    const ctx2 = await browser.newContext(); await freshSession(ctx2, 'e2e-other@nirmaan.test'); const p2 = await ctx2.newPage()
    await p2.addInitScript(() => { const k = 'sb-127-auth-token'; const s = JSON.parse(localStorage.getItem(k)!); s.access_token = s.access_token.slice(0, -4) + 'AAAA'; s.refresh_token = 'rt.does-not-exist'; s.expires_at = Math.floor(Date.now() / 1000) + 3600; localStorage.setItem(k, JSON.stringify(s)) })
    await p2.goto('/dashboard'); await expect(p2).toHaveURL(/\/login/)
    await ctx2.close()
  })
})

test.describe('Google sign-in', () => {
  test('is disabled — never faked — when the Supabase project has no Google provider', async ({ page }) => {
    await page.goto('/login')
    const g = page.getByRole('button', { name: /continue with google/i })
    await expect(g).toBeDisabled(); await expect(page.getByText(/isn't enabled for this project/i)).toBeVisible()
  })
  test('when the provider is enabled, the button starts the real OAuth redirect (no password is ever requested)', async ({ page }) => {
    await page.route('**/api/auth/config', (r) => r.fulfill({ json: { emailPassword: true, google: true, emailConfirmationRequired: true, verified: true } }))
    await page.goto('/login')
    const g = page.getByRole('button', { name: /continue with google/i }); await expect(g).toBeEnabled()
    const authorize = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'))
    await g.click()
    const url = new URL((await authorize).url())
    expect(url.searchParams.get('provider')).toBe('google'); expect(url.searchParams.get('redirect_to')).toContain('/auth/callback'); expect(url.searchParams.get('code_challenge')).toBeTruthy()   // PKCE
    expect(url.search).not.toMatch(/password/i)
  })
  test('the OAuth callback surfaces a provider error instead of hanging', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User+denied+access')
    await expect(page.getByRole('alert')).toContainText('User denied access'); await expect(page.getByRole('link', { name: 'Back to log in' })).toBeVisible()
  })
})

test('forgot password never reveals whether an account exists', async ({ page }) => {
  await page.goto('/forgot-password'); await page.getByLabel('Email').fill('nobody-here@nirmaan.test'); await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(/if an account exists/i)).toBeVisible()
})
