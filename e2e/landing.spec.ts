import { test, expect } from '@playwright/test'

// The MPA split: a static landing at / and the React app at /app/. These lock
// the wiring — a Vite input change or a moved entry breaks here first.

const RELEASES = 'https://github.com/Hyunsang-coder/auto-image/releases/latest'

test('랜딩이 루트에서 렌더되고 콘텐츠가 정적임', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('App Store screenshots')
  await expect(page.getByRole('link', { name: 'Download for macOS →' })).toHaveAttribute(
    'href',
    RELEASES,
  )
})

// The site hands out the Mac app instead of the hosted studio, so a surviving
// /app/ link would be a regression, not a shortcut.
test('랜딩에 웹 스튜디오로 가는 링크가 없음', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('a[href^="app/"], a[href^="/app/"]')).toHaveCount(0)
})

test('에디터가 /app/에서 그대로 서빙됨', async ({ page }) => {
  await page.goto('/app/')
  await expect(page.getByText('프로젝트 가져오기').first()).toBeVisible()
})
