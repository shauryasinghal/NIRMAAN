import { test, expect, auth } from './support/fixtures'

test.use({ storageState: auth('onboarded') })

test('application: track → status → notes/reminder → real timeline → remove', async ({ page }) => {
  await page.goto('/opportunities?q=Open Source Contribution Sprint')
  await page.getByRole('article').first().getByRole('link').first().click()
  await expect(page.getByText('NIRMAAN fit')).toBeVisible()                       // detail has loaded
  const title = await page.getByRole('heading', { level: 1 }).innerText()
  await page.getByRole('button', { name: 'Track this application' }).click()
  await expect(page.getByText('Added to your tracker')).toBeVisible()
  await page.getByLabel('Application status').selectOption('planning'); await expect(page.getByText('Status updated')).toBeVisible()

  await page.goto('/applications')
  const board = page.getByRole('region', { name: 'Planning' })
  await expect(board.getByText(title)).toBeVisible()
  await page.getByRole('button', { name: `Open ${title}` }).click()
  const dlg = page.getByRole('dialog', { name: title })
  await dlg.getByLabel('Next action').fill('Draft the pitch'); await dlg.getByLabel('Remind me on').fill('2030-01-15'); await dlg.getByLabel('Notes').fill('Talk to the mentor first')
  await dlg.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await dlg.getByLabel('Status').selectOption('applied')
  await expect(dlg.getByText('planning → applied')).toBeVisible()
  const timeline = dlg.getByRole('list').last()
  for (const label of ['Added to tracker', 'Status changed', 'Notes updated', 'Next action set', 'Reminder']) await expect(timeline).toContainText(label)   // events written by the database trigger
  await dlg.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(page.getByRole('region', { name: 'Applied' }).getByText(title)).toBeVisible()
  await page.getByRole('tab', { name: 'List' }).click(); await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible()
  await page.getByRole('button', { name: title }).click()
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog', { name: 'Remove from tracker?' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText(title)).toHaveCount(0)
})

test('smart alert: create → check now → notification → read state → preferences', async ({ page }) => {
  await page.goto('/smart-alerts')
  await page.getByRole('button', { name: /New alert/ }).first().click()
  const dlg = page.getByRole('dialog', { name: 'New smart alert' })
  await dlg.getByRole('button', { name: 'Create alert' }).click(); await expect(dlg.getByText('Give your alert a name')).toBeVisible()
  await dlg.getByLabel('Name').fill('E2E Hackathons'); await dlg.getByLabel('Category').selectOption('Hackathon')
  await dlg.locator('#alert-fit').fill('20')
  await dlg.getByRole('button', { name: 'Create alert' }).click(); await expect(page.getByText('Alert created')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'E2E Hackathons' })
  await expect(card).toContainText('fit ≥ 20%'); await expect(card).toContainText('not checked yet')
  await card.getByRole('button', { name: /Check now/ }).click()
  await expect(card.getByText(/notifications? created/)).toBeVisible(); await expect(card.getByRole('link').first()).toBeVisible()

  await page.goto('/notifications')
  await expect(page.getByText(/New match for “E2E Hackathons”/).first()).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Notifications' })).toBeVisible()
  await page.getByRole('tab', { name: /Unread/ }).click(); await expect(page.getByLabel('Unread').first()).toBeVisible()
  await page.getByRole('button', { name: 'Mark all read' }).click(); await expect(page.getByText("You're all caught up")).toBeVisible()

  await page.goto('/settings')
  const sw = page.getByRole('switch', { name: /Smart alerts/ }); await expect(sw).toHaveAttribute('aria-checked', 'true'); await sw.click(); await expect(sw).toHaveAttribute('aria-checked', 'false')
  await page.reload(); await expect(page.getByRole('switch', { name: /Smart alerts/ })).toHaveAttribute('aria-checked', 'false')   // persisted server-side
  await page.getByRole('switch', { name: /Smart alerts/ }).click()

  await page.goto('/smart-alerts')
  await page.getByRole('button', { name: 'Delete E2E Hackathons' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('E2E Hackathons')).toHaveCount(0)
})
