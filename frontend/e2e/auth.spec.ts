import { test, expect } from '@playwright/test'

// These specs assume the backend is running at http://localhost:8000
// (the Vite dev proxy forwards /api and /health to it — see vite.config.ts).

test('a new student can register, land on onboarding, and reach the dashboard', async ({ page }) => {
  const email = `e2e-${Date.now()}@gla.demo`
  await page.goto('/register')
  await page.getByPlaceholder('Ananya Sharma').fill('E2E Test Student')
  await page.getByPlaceholder('you@gla.demo').fill(email)
  await page.getByPlaceholder('At least 8 characters').fill('password123')
  await page.locator('#confirmPassword').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/onboarding/)
  await page.getByRole('button', { name: /next/i }).click() // step 1 -> skills
  await page.getByText('python', { exact: true }).click()
  await page.getByText('react', { exact: true }).click()
  await page.getByRole('button', { name: /next/i }).click() // -> interests
  await page.getByText('ai/ml', { exact: true }).click()
  await page.getByRole('button', { name: /next/i }).click() // -> experience
  await page.getByRole('button', { name: /next/i }).click() // -> availability
  await page.getByRole('button', { name: /next/i }).click() // -> review
  await page.getByRole('button', { name: /finish/i }).click()

  await expect(page).toHaveURL(/dashboard/)
  await expect(page.getByText(/Good day/)).toBeVisible()
})

test('an existing student can log in and log out', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('priya.nair@gla.demo')
  await page.getByLabel('Password').fill('demo1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/dashboard/)

  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page).toHaveURL(/login/)
})
