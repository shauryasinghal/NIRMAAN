import { test, expect, auth } from './support/fixtures'

test('opportunity → build team → invite → the invitee accepts', async ({ browser }) => {
  const ctxA = await browser.newContext({ storageState: auth('onboarded') }); const a = await ctxA.newPage()
  await a.goto('/opportunities?q=Flipkart GRiD Campus Challenge')
  await a.getByRole('article').first().getByRole('link').first().click()
  await a.getByRole('link', { name: /Build a team for this/ }).click()
  await expect(a).toHaveURL(/\/team-builder\?opportunity=/)
  await expect(a.getByText(/Needs:.*react/)).toBeVisible()
  await a.getByRole('button', { name: 'Build my team' }).click()

  await expect(a.getByText('Coverage of required skills')).toBeVisible()
  await expect(a.getByText(/Before: \d\/\d covered by you alone/)).toBeVisible()
  await a.getByText('How the balance score is calculated').click()
  await expect(a.getByText(/never use|No personal or demographic attributes/i)).toBeVisible()
  await expect(a.getByText('0.40·coverage')).toBeVisible()
  const other = a.getByRole('article', { name: 'Other Student' })
  await expect(other).toBeVisible(); await expect(other.getByText(/covers \d required skill/)).toBeVisible()      // an explanation, not just a name
  await expect(other.getByText('Frontend Engineer').or(other.getByText('Backend Engineer'))).toBeVisible()
  await a.getByRole('tab', { name: /All candidates ranked/ }).click(); await expect(a.getByRole('article').first()).toBeVisible(); await a.getByRole('tab', { name: /Suggested team/ }).click()

  await a.getByRole('button', { name: /Save team/ }).click()
  await expect(a.getByRole('dialog', { name: 'Save this team' })).toBeVisible()
  await a.getByLabel('Team name (optional)').fill('E2E Dream Team')
  await a.getByRole('button', { name: /^Invite \d+$/ }).click()
  await expect(a.getByText('Team saved and invitations sent')).toBeVisible()
  await a.getByRole('tab', { name: /My teams/ }).click()
  await expect(a.getByRole('heading', { name: 'E2E Dream Team' })).toBeVisible(); await expect(a.getByText('invited').first()).toBeVisible()

  const ctxB = await browser.newContext({ storageState: auth('other') }); const b = await ctxB.newPage()
  await b.goto('/notifications'); await expect(b.getByText(/invited you to a team/).first()).toBeVisible()
  await b.goto('/team-builder'); await b.getByRole('tab', { name: /My teams/ }).click()
  await expect(b.getByText("You've been invited")).toBeVisible()
  await b.getByRole('button', { name: /Accept/ }).click(); await expect(b.getByText('You joined the team')).toBeVisible()
  await a.reload(); await a.getByRole('tab', { name: /My teams/ }).click(); await expect(a.getByText('accepted').first()).toBeVisible()
  await ctxA.close(); await ctxB.close()
})

test.describe('team consent & safety', () => {
  test.use({ storageState: auth('onboarded') })
  test('manual skills work, an empty request is refused, and nobody appears without opting in', async ({ page }) => {
    await page.goto('/team-builder')
    await expect(page.getByRole('button', { name: 'Build my team' })).toBeDisabled()
    await page.getByPlaceholder('Add a required skill…').fill('iot'); await page.getByRole('button', { name: 'iot', exact: true }).click()
    await page.getByRole('button', { name: 'Build my team' }).click(); await expect(page.getByText('Coverage of required skills')).toBeVisible()
    await expect(page.getByText('Fresh Student')).toHaveCount(0)                                      // not opted in → never listed
  })
})
