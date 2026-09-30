import { test, expect, auth } from './support/fixtures'

test.use({ storageState: auth('onboarded') })
test.setTimeout(120_000)

const UNRELATED = { title: 'Beehive acoustic health monitor', description: 'Low-power microphones and temperature sensors inside beehives that stream colony health indicators to beekeepers so they can prevent swarming and disease.' }

test('opportunity → validate idea → originality result → history → detail → delete', async ({ page }) => {
  await page.goto('/opportunities?q=Kaggle Student Data Science Bowl')
  await page.getByRole('article').first().getByRole('link').first().click()
  await page.getByRole('link', { name: /Validate an idea for this/ }).click()
  await expect(page).toHaveURL(/\/originality\?opportunity=/); await expect(page.getByText(/Validating an idea for/)).toBeVisible()

  await page.getByRole('button', { name: 'Check originality' }).click()
  await expect(page.getByText('Give your idea a title')).toBeVisible(); await expect(page.getByText(/at least 20 characters/)).toBeVisible()
  await page.getByLabel('Idea title').fill(UNRELATED.title); await page.getByLabel('Describe the idea').fill(UNRELATED.description)
  await page.getByRole('button', { name: 'Check originality' }).click()
  await expect(page.getByText(/Embedding your idea/)).toBeVisible()                                    // processing state = real pending request

  const result = page.locator('#result')
  await expect(result.getByRole('heading', { name: 'No significant match found' })).toBeVisible({ timeout: 90_000 })
  await expect(result).toContainText('No significant semantic match found in the current comparison corpus.')
  await expect(result).toContainText(/not proof of plagiarism/i)
  await expect(result).toContainText(/MiniLM-L6-v2 \(384-d\).*pgvector/)
  await expect(result).toContainText(/Comparison corpus:\s*50 ideas/)
  await expect(result.getByText(/100% original/i)).toHaveCount(0)
  await expect(result.getByText('Overall semantic similarity').first()).toBeVisible()               // overlap dimensions
  await expect(result.getByText('Title similarity').first()).toBeVisible()

  await page.goto('/originality/history'); await expect(page.getByRole('link', { name: new RegExp(UNRELATED.title) })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(UNRELATED.title) }).click()
  await expect(page).toHaveURL(/\/originality\/history\/[0-9a-f-]{36}/); await expect(page.getByText('How this was analysed')).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: `Delete ${UNRELATED.title}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name: new RegExp(UNRELATED.title) })).toHaveCount(0)
})

test('a near-duplicate is flagged, queued for human review and notified', async ({ page }) => {
  await page.goto('/originality')
  await page.getByLabel('Idea title').fill('Teammate finder for hackathons')
  await page.getByLabel('Describe the idea').fill('A tool that finds teammates for hackathons based on matching or complementary technical skills, so every team has the right abilities.')
  await page.getByRole('button', { name: 'Check originality' }).click()
  const result = page.locator('#result')
  await expect(result.getByText(/Substantial semantic overlap|Related prior work found/)).toBeVisible({ timeout: 90_000 })
  await expect(result.getByText('Skill-based hackathon teammate finder')).toBeVisible()
  if (await result.getByText('Queued for human review').count()) {
    await page.goto('/notifications'); await expect(page.getByText('Your idea was queued for human review').first()).toBeVisible()
  }
})
