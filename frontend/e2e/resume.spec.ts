import path from 'node:path'
import { test, expect, auth } from './support/fixtures'

test.use({ storageState: auth('onboarded') })
const RESUME = path.resolve('e2e/.tmp/resume.pdf'); const BAD = path.resolve('e2e/.tmp/not-a-resume.pdf')

test('resume upload → extraction → confirmation → profile (nothing is written before confirming)', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Import from resume' }).click()
  const dlg = page.getByRole('dialog', { name: 'Import from resume' })
  await dlg.getByLabel('Upload resume').setInputFiles(RESUME)
  await expect(dlg.getByText('Review before anything changes')).toBeVisible()
  await expect(dlg.getByText(/not an AI model/)).toBeVisible()
  await expect(dlg.getByText('docker', { exact: true })).toBeVisible()
  await expect(dlg.getByText(/Found in:.*Docker/i).first()).toBeVisible()                                     // evidence for each skill
  await expect(dlg.getByText('B.Tech CSE (AI/ML), GLA University, 2023-2027')).toBeVisible()
  // extraction alone changed nothing: profile behind the dialog still has no docker
  const before = await page.request.get('http://127.0.0.1:8000/api/profile', { headers: { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token')!).access_token)}` } })
  expect((await before.json()).skills).not.toContain('docker')

  const docker = dlg.getByRole('radiogroup', { name: 'What to do with docker' })
  await docker.getByRole('radio', { name: 'I have this' }).click()
  await dlg.getByLabel('Smart Attendance System - face recognition with Python').check()
  await dlg.getByRole('button', { name: /Apply \d+ selected/ }).click()
  await expect(page.getByText('Profile updated from your resume')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('docker').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From your resume' })).toBeVisible()
  await expect(page.getByText('Smart Attendance System')).toBeVisible()
  await expect(page.getByText('Suggested skills')).toBeVisible()                                     // the other found skills stay unconfirmed suggestions
})

test('a disguised executable is rejected with a clear message', async ({ page }) => {
  await page.goto('/profile'); await page.getByRole('button', { name: 'Import from resume' }).click()
  await page.getByRole('dialog').getByLabel('Upload resume').setInputFiles(BAD)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/not a valid PDF/i)
  await expect(page.getByRole('dialog').getByText('Review before anything changes')).toHaveCount(0)
})
