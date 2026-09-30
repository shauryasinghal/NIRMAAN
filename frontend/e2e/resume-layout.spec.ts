import { test, expect, auth } from './support/fixtures'
import type { Locator, Page } from '@playwright/test'

/**
 * Layout regression for the resume review (Profile dialog AND onboarding step). Real geometry, real browser: the extraction API is mocked
 * with the shape that broke in production — several skills with long evidence sentences plus a very long URL.
 *
 * Root cause of the original bug: each section was a <fieldset>, whose browser default is `min-width: min-content`, and the evidence line was
 * `truncate` (white-space: nowrap) — so the fieldset grew to the width of the longest sentence and pushed the skill cards and their
 * "I have this / Suggest only / Skip" controls out of the container.
 */
const LONG = 'My coursework and projects have given me a solid grounding in object-oriented design in Python and Java, along with Data Structures, and I designed and integrated a React frontend with a FastAPI backend'
const LONG_URL = 'https://www.linkedin.com/in/shaurya-singhal-0123456789abcdef0123456789abcdef/details/projects/?someVeryLongQueryStringThatHasNoSpacesAtAll=1234567890123456789012345678901234567890'
const EXTRACTION = {
  method: 'rule-based extraction (section headings, patterns, controlled skill vocabulary) — not an AI model; please review everything',
  willChange: 'Nothing yet.',
  extracted: {
    name: 'Shaurya Singhal', email: null, links: ['https://github.com/shauryasinghal', LONG_URL],
    education: ['B.Tech Computer Science and Engineering (AI/ML), GLA University, Mathura, 2023-2027, CGPA 8.4/10 with a focus on machine learning systems'],
    projects: ['SchemeSaathi AI, built at the OOSC 4.0 Hackathon (IIIT Allahabad): a React + FastAPI assistant that matches citizens to government schemes'],
    certifications: [], experience: [], achievements: [],
    skills: [{ name: 'java', evidence: LONG }, { name: 'python', evidence: LONG }, { name: 'react', evidence: 'React frontend with a FastAPI backend' }, { name: 'system design', evidence: 'think abstractly about system design.' }, { name: 'api design', evidence: 'REST API design' }, { name: 'machine learning', evidence: 'machine learning coursework' }],
    sectionsFound: ['education', 'projects'], charactersRead: 3200,
    items: { education: ['B.Tech Computer Science and Engineering (AI/ML), GLA University, Mathura, 2023-2027, CGPA 8.4/10 with a focus on machine learning systems'], projects: ['SchemeSaathi AI, built at the OOSC 4.0 Hackathon (IIIT Allahabad): a React + FastAPI assistant that matches citizens to government schemes'], certifications: [], experience: [], achievements: [] },
  },
  diff: {
    newSkills: [{ name: 'java', evidence: LONG }, { name: 'python', evidence: LONG }, { name: 'react', evidence: 'SchemeSaathi AI, built at the OOSC 4.0 Hackathon (IIIT Allahabad), I designed and integrated a React frontend with a FastAPI backend' },
      { name: 'system design', evidence: 'navigating ambiguous problems, and able to think abstractly about system design.' }],
    alreadyConfirmed: ['api design', 'machine learning'], nameDiffers: true, currentName: 'shaurya', newLinks: [],
  },
}
const WIDTHS: [number, number][] = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844]]

async function mockExtraction(page: Page) { await page.route('**/api/profile/resume/extract', (r) => r.fulfill({ json: EXTRACTION })) }
async function upload(scope: Locator) { await scope.getByLabel('Upload resume').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }) }

/** Every visible element inside `root` must sit inside root's horizontal bounds — no clipped or escaping control, no horizontal scroll. */
async function horizontalEscapes(root: Locator) {
  return root.evaluate((el) => {
    const r = el.getBoundingClientRect(); const bad: string[] = []
    el.querySelectorAll('*').forEach((n) => {
      if (n.closest('.sr-only') || n.closest('svg')) return
      const b = n.getBoundingClientRect(); if (!b.width || !b.height) return
      if (b.right > r.right + 1 || b.left < r.left - 1) bad.push(`${n.tagName.toLowerCase()}[${(n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 30)}] ${Math.round(b.left - r.left)}..${Math.round(b.right - r.right)}px`)
    })
    return { bad: bad.slice(0, 6), scrollOverflow: el.scrollWidth - el.clientWidth }
  })
}
const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function checkCards(page: Page, scope: Locator) {
  const cards = scope.getByRole('listitem').filter({ has: page.getByRole('radiogroup') })
  await expect(cards).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i); const cb = (await card.boundingBox())!
    const radios = card.getByRole('radio')
    await expect(radios).toHaveCount(3)
    for (let j = 0; j < 3; j++) {                                                 // each control fully inside its own card, never clipped
      const b = (await radios.nth(j).boundingBox())!
      expect(b.x, `radio ${j} of card ${i} left`).toBeGreaterThanOrEqual(cb.x - 0.5); expect(b.x + b.width, `radio ${j} of card ${i} right`).toBeLessThanOrEqual(cb.x + cb.width + 0.5)
      expect(b.width).toBeGreaterThan(40)
    }
    const ev = (await card.getByText(/Found in:/).boundingBox())!                 // evidence wraps inside the card instead of being cut off
    expect(ev.x + ev.width).toBeLessThanOrEqual(cb.x + cb.width + 0.5)
    expect(await card.getByText(/Found in:/).evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')).toBe(true)
  }
}

test.describe('resume review layout — profile dialog', () => {
  test.use({ storageState: auth('onboarded') })
  for (const [w, h] of WIDTHS) {
    test(`fits at ${w}px: nothing escapes, footer stays reachable`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h }); await mockExtraction(page)
      await page.goto('/profile'); await page.getByRole('button', { name: 'Import from resume' }).click()
      const dlg = page.getByRole('dialog', { name: 'Import from resume' }); await upload(dlg)
      await expect(dlg.getByText('Review before anything changes')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`dialog-${w}.png`) })

      const box = (await dlg.boundingBox())!                                       // a properly sized, fully on-screen dialog
      expect(box.x).toBeGreaterThanOrEqual(-0.5); expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5); expect(box.y).toBeGreaterThanOrEqual(-0.5); expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5)
      if (w >= 1024) { expect(box.width).toBeGreaterThanOrEqual(Math.min(900, w - 48) - 2); expect(box.width).toBeLessThanOrEqual(900.5) }
      const esc = await horizontalEscapes(dlg); expect(esc.bad, 'elements escaping the dialog').toEqual([]); expect(esc.scrollOverflow).toBeLessThanOrEqual(1)
      const body = await dlg.locator('.dialog-body').evaluate((e) => e.scrollWidth - e.clientWidth); expect(body).toBeLessThanOrEqual(1)
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
      await checkCards(page, dlg)

      await expect(dlg.getByRole('button', { name: /Apply \d+ selected/ })).toBeInViewport({ ratio: 1 })      // footer visible without scrolling…
      await dlg.locator('.dialog-body').evaluate((e) => { e.scrollTop = e.scrollHeight })
      await expect(dlg.getByRole('button', { name: /Apply \d+ selected/ })).toBeInViewport({ ratio: 1 })      // …and at the bottom
      await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 })
      await dlg.locator('.dialog-body').evaluate((e) => { e.scrollTop = e.scrollHeight / 2 }); await page.screenshot({ path: info.outputPath(`dialog-${w}-scrolled.png`) })
      await dlg.locator('.dialog-body').evaluate((e) => { e.scrollTop = 0 })
      await expect(dlg.getByText('Review before anything changes')).toBeInViewport()                          // header + explanation still reachable at the top
    })
  }

  test('the active choice and the footer summary always agree', async ({ page }) => {
    await mockExtraction(page); await page.goto('/profile'); await page.getByRole('button', { name: 'Import from resume' }).click()
    const dlg = page.getByRole('dialog', { name: 'Import from resume' }); await upload(dlg)
    const summary = dlg.getByTestId('resume-summary')
    await expect(summary).toContainText('0 confirmed'); await expect(summary).toContainText('4 suggestions')
    const java = dlg.getByRole('radiogroup', { name: 'What to do with java' })
    await java.getByRole('radio', { name: 'I have this' }).click()
    await expect(java.getByRole('radio', { name: 'I have this' })).toHaveAttribute('aria-checked', 'true')
    await expect(java.getByRole('radio', { name: 'Suggest only' })).toHaveAttribute('aria-checked', 'false')
    await expect(summary).toContainText('1 confirmed'); await expect(summary).toContainText('3 suggestions')
    await dlg.getByRole('radiogroup', { name: 'What to do with python' }).getByRole('radio', { name: 'Skip' }).click()
    await expect(summary).toContainText('1 confirmed'); await expect(summary).toContainText('2 suggestions'); await expect(summary).toContainText('1 skipped')
    await page.screenshot({ path: test.info().outputPath('choices.png') })
    await expect(dlg.getByRole('button', { name: /Apply 3 selected/ })).toBeEnabled()                        // java (confirmed) + react + system design (suggested)
  })

  test('keyboard: every choice is reachable and shows a visible focus ring', async ({ page }) => {
    await mockExtraction(page); await page.goto('/profile'); await page.getByRole('button', { name: 'Import from resume' }).click()
    const dlg = page.getByRole('dialog', { name: 'Import from resume' }); await upload(dlg)
    const first = dlg.getByRole('radiogroup', { name: 'What to do with java' }).getByRole('radio', { name: 'I have this' })
    await first.focus(); await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('aria-checked', 'true')
    expect(await first.evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle !== 'none' || s.boxShadow !== 'none' })).toBe(true)
  })
})

test.describe('resume review layout — onboarding step', () => {
  test.use({ storageState: auth('student') })
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as [number, number][]) {
    test(`fits at ${w}px inside the onboarding card`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h }); await mockExtraction(page)
      await page.goto('/onboarding')
      const resumeStep = page.getByRole('heading', { name: /Have a resume/ })
      await expect(page.getByRole('heading', { name: /Tell us about you/ })).toBeVisible()                        // wait for the wizard, not the loading skeleton
      await page.getByLabel('Branch / field of study').fill('CSE (AI/ML)'); await page.getByRole('button', { name: 'Continue' }).click()
      const cont = page.getByRole('button', { name: 'Continue' })
      const asks = async (re: RegExp) => page.getByRole('alert').filter({ hasText: re }).waitFor({ timeout: 1500 }).then(() => true, () => false)   // the shared account may already have these saved
      await expect(page.getByPlaceholder('Search skills…')).toBeVisible(); await cont.click()
      if (await asks(/at least one skill/)) { await page.getByPlaceholder('Search skills…').fill('python'); await page.getByRole('button', { name: 'Python', exact: true }).click(); await cont.click() }
      await expect(page.getByRole('heading', { name: /What excites you/ })).toBeVisible(); await cont.click()
      if (await asks(/interest/)) { await page.getByRole('button', { name: 'AI/ML', exact: true }).click(); await cont.click() }
      await expect(page.getByRole('switch', { name: /let other students find me/i })).toBeVisible(); await cont.click()
      await expect(resumeStep).toBeVisible()
      const card = page.getByRole('heading', { name: /Have a resume/ }).locator('xpath=../..')
      await upload(card); await expect(card.getByText('Review before anything changes')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`onboarding-${w}.png`), fullPage: true })
      const esc = await horizontalEscapes(card); expect(esc.bad, 'elements escaping the card').toEqual([])
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
      await checkCards(page, card)
      await card.getByRole('button', { name: /Apply \d+ selected/ }).scrollIntoViewIfNeeded()
      await expect(card.getByRole('button', { name: /Apply \d+ selected/ })).toBeInViewport({ ratio: 1 })
    })
  }
})
