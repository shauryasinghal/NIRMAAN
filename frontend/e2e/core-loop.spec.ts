import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('priya.nair@gla.demo')
  await page.getByLabel('Password').fill('demo1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/dashboard/)
})

test('dashboard shows recommended opportunities and links to opportunity detail', async ({ page }) => {
  await expect(page.getByText('Top matched opportunities')).toBeVisible()
  const firstCard = page.locator('a[href^="/opportunities/"]').first()
  await expect(firstCard).toBeVisible()
  await firstCard.click()
  await expect(page).toHaveURL(/opportunities\//)
  await expect(page.getByText('Why NIRMAAN recommends this')).toBeVisible()
})

test('opportunity discovery page filters and sorts', async ({ page }) => {
  await page.goto('/opportunities')
  await expect(page.getByText('Discover opportunities built for you.')).toBeVisible()
  await page.getByPlaceholder('Search title or organization…').fill('AI')
  await expect(page.locator('a[href^="/opportunities/"]').first()).toBeVisible()
})

test('team builder generates a real team from selected skills', async ({ page }) => {
  await page.goto('/team-builder')
  await page.getByRole('button', { name: 'Generate team' }).click()
  await expect(page.getByText('Diversity score')).toBeVisible()
  await expect(page.getByText('Team members')).toBeVisible()
})

test('originality checker flags a near-duplicate idea for review', async ({ page }) => {
  await page.goto('/originality')
  await page.getByPlaceholder('e.g. Hackathon teammate matcher').fill('Hackathon teammate matcher')
  await page.getByPlaceholder('Describe what the idea does…').fill(
    'A platform for finding teammates with matching or complementary technical skills for hackathons.',
  )
  await page.getByRole('button', { name: 'Check originality' }).click()
  await expect(page.getByText('Human review recommended')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Closest matches')).toBeVisible()
})

test('history page lists a previously checked idea', async ({ page }) => {
  await page.goto('/originality/history')
  await expect(page.getByText('Originality history')).toBeVisible()
})
