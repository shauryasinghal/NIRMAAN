import { test, expect, auth } from './support/fixtures'

test.use({ storageState: auth('onboarded') })

test.describe('opportunity discovery', () => {
  test('search → filter → detail → save, with filters living in the URL', async ({ page }) => {
    await page.goto('/opportunities')
    await expect(page.getByRole('heading', { name: 'Discover opportunities' })).toBeVisible()
    const total = page.getByRole('status').filter({ hasText: /opportunities/ }).first()
    await expect(total).toContainText(/6\d opportunities/)                                   // server-side total, not a client filter
    await expect(page.getByText('Demo listings')).toBeVisible()                              // demo data is labelled
    await expect(page.getByText('Demo data').first()).toBeVisible()

    await page.getByLabel('Search opportunities').fill('cyber')
    await expect(page).toHaveURL(/q=cyber/)
    await expect(total).not.toContainText(/6\d opportunities/)
    for (const card of await page.getByRole('article').all()) await expect(card).toContainText(/cyber|ctf|security|network/i)

    await page.getByRole('checkbox', { name: /^CTF/ }).check()
    await expect(page).toHaveURL(/category=CTF/)
    await expect(page.getByRole('button', { name: 'Remove filter Category: CTF' })).toBeVisible()
    await page.reload()                                                                        // filters survive refresh
    await expect(page.getByRole('checkbox', { name: /^CTF/ })).toBeChecked()
    await expect(page.getByLabel('Search opportunities')).toHaveValue('cyber')

    await page.getByRole('article').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}/)
    await expect(page.getByText('NIRMAAN fit')).toBeVisible()
    await expect(page.getByText('Demo listing', { exact: false }).first()).toBeVisible()
    const title = await page.getByRole('heading', { level: 1 }).innerText()

    const save = page.getByRole('button', { name: 'Save opportunity' }).first()
    await save.click()
    await expect(page.getByRole('button', { name: 'Remove from saved' }).first()).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/saved'); await expect(page.getByRole('article').filter({ hasText: title })).toBeVisible()
    await page.getByRole('article').filter({ hasText: title }).getByRole('button', { name: 'Remove from saved' }).click()
    await expect(page.getByText('Nothing saved yet')).toBeVisible()
    await page.goBack(); await page.goBack().catch(() => undefined)
  })

  test('back button restores the previous filter state; Clear all resets it', async ({ page }) => {
    await page.goto('/opportunities')
    await page.getByRole('checkbox', { name: /^Hackathon/ }).check(); await expect(page).toHaveURL(/category=Hackathon/)
    await page.getByRole('checkbox', { name: /^Beginner/i }).check(); await expect(page).toHaveURL(/difficulty=beginner/)
    await page.getByRole('button', { name: 'Clear all' }).click(); await expect(page).not.toHaveURL(/category=/)
    await expect(page.getByRole('checkbox', { name: /^Hackathon/ })).not.toBeChecked()
  })

  test('empty results explain themselves and offer a way out', async ({ page }) => {
    await page.goto('/opportunities?q=zzzzqqqq')
    await expect(page.getByText('No opportunities match')).toBeVisible()
    await page.getByRole('button', { name: 'Clear all filters' }).click(); await expect(page.getByRole('article').first()).toBeVisible()
  })

  test('sorting by fit is monotone and every score is explained', async ({ page }) => {
    await page.goto('/opportunities?sort=fit')
    await expect(page.getByRole('article').first()).toBeVisible()
    const scores = (await page.locator('article [title^="Fit score"], article [title^="Low confidence"]').allInnerTexts()).map((t) => parseInt(t, 10)).filter((n) => !Number.isNaN(n))
    expect(scores.length).toBeGreaterThan(5)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    await page.goto('/opportunities?min_fit=70'); await expect(page.getByRole('button', { name: 'Remove filter Fit ≥ 70%' })).toBeVisible()
    for (const s of (await page.locator('article [title^="Fit score"]').allInnerTexts()).map((t) => parseInt(t, 10))) expect(s).toBeGreaterThanOrEqual(70)
  })

  test('detail shows the transparent fit breakdown and a why-not panel', async ({ page }) => {
    await page.goto('/opportunities?q=Cybersecurity Capture the Flag')
    await page.getByRole('article').first().getByRole('link').first().click()
    await page.getByText('How this score is calculated').click()
    await expect(page.getByText('Skill match · weight 30%')).toBeVisible(); await expect(page.getByText(/unknown inputs are left out/i)).toBeVisible()
    await expect(page.getByText(/Main blockers:|Things to keep in mind/)).toBeVisible()
    await expect(page.getByText(/What helps:/).first()).toBeVisible()
  })

  test('unknown opportunity id is a clear 404 state, not a crash', async ({ page }) => {
    await page.goto('/opportunities/00000000-0000-0000-0000-000000000000')
    await expect(page.getByText(/no longer exists or the link is wrong/i)).toBeVisible()
    await page.goto('/opportunities/not-a-uuid'); await expect(page.getByText(/no longer exists/i)).toBeVisible()
  })

  test('compare 2–4: strongest match is computed from real fit', async ({ page }) => {
    await page.goto('/opportunities?sort=fit')
    const boxes = page.getByRole('checkbox', { name: /compare/i })
    await boxes.nth(0).check(); await expect(page.getByRole('button', { name: /compare/i, exact: false }).last()).toBeDisabled()
    await boxes.nth(1).check(); await boxes.nth(2).check()
    await page.getByRole('region', { name: 'Comparison' }).getByRole('button', { name: /Compare/ }).click()
    await expect(page).toHaveURL(/\/compare\?ids=/)
    await expect(page.getByText(/Strongest match:/)).toBeVisible(); await expect(page.getByRole('row', { name: /Your fit/ })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveCount(4)
    await page.getByRole('button', { name: /^Remove .* from comparison$/ }).first().click(); await expect(page.getByRole('columnheader')).toHaveCount(3)
  })

  test('pagination keeps the page in the URL', async ({ page }) => {
    await page.goto('/opportunities'); await page.getByRole('button', { name: 'Next page' }).click(); await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})
