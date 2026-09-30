import { test, expect, auth, freshSession } from './support/fixtures'

test('reviewer: queue → evidence → decision (note required) → student sees it → admin sees the audit record', async ({ browser }) => {
  const rc = await browser.newContext({ storageState: auth('reviewer') }); const r = await rc.newPage()
  await r.goto('/review')
  await expect(r.getByRole('heading', { name: 'Review queue' })).toBeVisible()
  await r.getByRole('link', { name: /Teammate matcher for hackathons/ }).first().click()
  await expect(r.getByText('Similarity evidence')).toBeVisible(); await expect(r.getByText(/not proof of plagiarism/i)).toBeVisible(); await expect(r.getByText(/Submitter's history/)).toBeVisible()
  await expect(r.getByText('Skill-based hackathon teammate finder')).toBeVisible()

  await r.getByRole('button', { name: 'Request changes' }).click()
  const dlg = r.getByRole('dialog', { name: 'Request changes' })
  await expect(dlg.getByRole('button', { name: /Confirm request changes/ })).toBeDisabled()          // a note is mandatory for this decision
  await dlg.getByLabel(/Note to the student/).fill('Please explain how this differs from existing teammate finders.')
  await dlg.getByRole('button', { name: /Confirm request changes/ }).click()
  await expect(r.getByText('Decision recorded')).toBeVisible(); await expect(r).toHaveURL(/\/review$/)

  const sc = await browser.newContext({ storageState: auth('other') }); const s = await sc.newPage()
  await s.goto('/notifications'); await expect(s.getByText('A reviewer decided on your idea').first()).toBeVisible(); await expect(s.getByText(/changes requested/).first()).toBeVisible()
  await s.goto('/originality/history'); await s.getByRole('link', { name: /Teammate matcher for hackathons/ }).click()
  await expect(s.getByText('Reviewer decision')).toBeVisible(); await expect(s.getByText(/differs from existing teammate finders/)).toBeVisible()
  await s.goto('/dashboard'); await expect(s.getByText(/Revise your idea/)).toBeVisible()                // next-best-action reacts to the decision

  const ac = await browser.newContext({ storageState: auth('admin') }); const a = await ac.newPage()
  await a.goto('/admin'); await a.getByRole('tab', { name: 'Audit log' }).click()
  await a.getByLabel('Filter by action').selectOption('review_decision')
  await expect(a.getByRole('row', { name: /review decision/ }).first()).toContainText('request_changes'); await expect(a.getByRole('row', { name: /review decision/ }).first()).toContainText('e2e-reviewer@nirmaan.test')
  await rc.close(); await sc.close(); await ac.close()
})

test('students cannot reach reviewer or admin areas — and neither can reviewers reach admin', async ({ browser }) => {
  const sc = await browser.newContext({ storageState: auth('onboarded') }); const s = await sc.newPage()
  for (const path of ['/review', '/review/00000000-0000-0000-0000-000000000000', '/admin']) { await s.goto(path); await expect(s).toHaveURL(/\/dashboard/) }
  await expect(s.getByRole('link', { name: 'Review Queue' })).toHaveCount(0); await expect(s.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  const token = await s.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token')!).access_token)
  for (const p of ['/api/reviewer/queue', '/api/admin/users', '/api/admin/audit']) expect((await s.request.get(`http://127.0.0.1:8000${p}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403)
  expect((await s.request.post('http://127.0.0.1:8000/api/reviewer/reviews/00000000-0000-0000-0000-000000000000/decision', { headers: { Authorization: `Bearer ${token}` }, data: { decision: 'approve' } })).status()).toBe(403)
  await sc.close()
  const rc = await browser.newContext({ storageState: auth('reviewer') }); const r = await rc.newPage()
  await r.goto('/admin'); await expect(r).toHaveURL(/\/dashboard/); await expect(r.getByRole('link', { name: 'Review Queue' }).first()).toBeVisible()
  await rc.close()
})

test('admin: role changes are confirmed, applied by the server and audited', async ({ browser }) => {
  const ac = await browser.newContext({ storageState: auth('admin') }); const a = await ac.newPage()
  await a.goto('/admin'); await a.getByLabel('Search users').fill('e2e-student@')
  const sel = a.getByLabel('Role for e2e-student@nirmaan.test'); await expect(sel).toHaveValue('student')
  await sel.selectOption('reviewer')
  await a.getByRole('dialog', { name: 'Change role?' }).getByRole('button', { name: 'Change role' }).click(); await expect(a.getByText('Role updated and audited')).toBeVisible()
  const uc = await browser.newContext(); await freshSession(uc, 'e2e-student@nirmaan.test'); const u = await uc.newPage()
  await u.goto('/review'); await expect(u.getByRole('heading', { name: 'Review queue' })).toBeVisible()      // the new role is real…
  await a.getByLabel('Role for e2e-student@nirmaan.test').selectOption('student'); await a.getByRole('dialog').getByRole('button', { name: 'Change role' }).click()
  await a.getByRole('tab', { name: 'Audit log' }).click(); await a.getByLabel('Filter by action').selectOption('role_changed')
  await expect(a.getByRole('row', { name: /role changed/ }).first()).toContainText('e2e-admin@nirmaan.test')   // …and recorded with who did it
  await u.reload(); await expect(u).toHaveURL(/\/dashboard|\/onboarding/)                               // and revocable
  await ac.close(); await uc.close()
})
