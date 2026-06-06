import { test, expect } from '@playwright/test'
import { clearAppState } from './helpers'

// The suite-wide locale is pinned to ko-KR (playwright.config.ts); this spec
// overrides it to verify the browser-language default and the header toggle.
test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
})

test('영어 브라우저는 영어 UI로 시작함', async ({ page }) => {
  await expect(page.getByText('New Screenshot Project')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('토글로 한국어 전환 후 새로고침해도 유지됨', async ({ page }) => {
  await page.getByRole('button', { name: '한국어' }).click()
  await expect(page.getByText('새 스크린샷 프로젝트')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')

  await page.reload()
  await expect(page.getByText('새 스크린샷 프로젝트')).toBeVisible()

  // And back to English via the toggle.
  await page.getByRole('button', { name: 'EN' }).click()
  await expect(page.getByText('New Screenshot Project')).toBeVisible()
})
