import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

/**
 * The bottom slide tray (a horizontal <nav>). The slide list moved out of the
 * left <aside> into this tray; each thumb is a draggable <button> whose
 * accessible name is the slide's headline (falling back to "슬라이드 N"). The
 * trailing "+" button (슬라이드 추가) adds a slide.
 *
 * StepIndicator is also a <nav>, so scope to the one holding slide thumbs
 * (aria-labelled buttons) — only the tray has those.
 */
export function slideTray(page: Page): Locator {
  return page.locator('nav:has(button[aria-label])')
}

/** Slide thumbnail buttons in the tray, in visual order. */
export function slideThumbs(page: Page): Locator {
  // Thumb buttons carry an aria-label (the title); the add/dup/delete/link
  // buttons don't, so filtering by [aria-label] isolates the slides.
  return slideTray(page).locator('button[aria-label]')
}

/**
 * Upload a screenshot fixture into the active slide via the (hidden) file
 * input in ScreenshotPanel. Opens the 스크린샷 tab first so the input is mounted.
 * `name` is a file under e2e/fixtures (e.g. 'iphone_home.png').
 */
export async function uploadScreenshot(page: Page, name: string) {
  await page.getByRole('button', { name: '디바이스' }).click()
  // The 스크린샷 tab mounts two file inputs: the single-shot one and a `multiple`
  // bulk-import one. Target the single-shot input explicitly.
  await page
    .locator('input[type="file"]:not([multiple])')
    .setInputFiles(`${fixturesDir}/${name}`)
}

/**
 * Upload a background image fixture via the 배경 → 이미지 tab's file input.
 */
export async function uploadBackgroundImage(page: Page, name: string) {
  await page.getByRole('button', { name: '배경', exact: true }).click()
  await page.getByRole('button', { name: '이미지', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(`${fixturesDir}/${name}`)
}

export async function clearAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('auto-image:project')
    localStorage.removeItem('auto-image:api-keys')
  })
}

export async function createProject(
  page: Page,
  options: { name?: string; devices?: ('iphone' | 'ipad')[]; slideCount?: number } = {},
) {
  const { name = 'Test App', devices = ['iphone'], slideCount } = options

  await page.fill('input[placeholder="예: Dogo, Claude, ADHD"]', name)

  // Deselect all devices first by clicking active ones, then select desired
  const iPhoneBtn = page.getByRole('button', { name: /iPhone/ })
  const iPadBtn = page.getByRole('button', { name: /iPad Pro/ })

  const iPhoneActive = await iPhoneBtn.evaluate((el) =>
    el.className.includes('border-[var(--color-accent)]'),
  )
  const iPadActive = await iPadBtn.evaluate((el) =>
    el.className.includes('border-[var(--color-accent)]'),
  )

  if (iPhoneActive && !devices.includes('iphone')) await iPhoneBtn.click()
  if (!iPhoneActive && devices.includes('iphone')) await iPhoneBtn.click()
  if (iPadActive && !devices.includes('ipad')) await iPadBtn.click()
  if (!iPadActive && devices.includes('ipad')) await iPadBtn.click()

  if (slideCount !== undefined) {
    const input = page.locator('input[type="number"]')
    await input.fill(String(slideCount))
  }

  await page.getByRole('button', { name: '다음 →' }).click()
}
