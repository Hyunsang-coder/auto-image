import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

/**
 * Upload a screenshot fixture into the active slide via the (hidden) file
 * input in ScreenshotPanel. Opens the 스크린샷 tab first so the input is mounted.
 * `name` is a file under e2e/fixtures (e.g. 'iphone_home.png').
 */
export async function uploadScreenshot(page: Page, name: string) {
  await page.getByRole('button', { name: '스크린샷' }).click()
  await page.locator('input[type="file"]').setInputFiles(`${fixturesDir}/${name}`)
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
  const iPhoneBtn = page.getByRole('button', { name: /iPhone 16 Pro/ })
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
