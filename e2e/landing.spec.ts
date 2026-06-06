import { test, expect } from '@playwright/test'

// The MPA split: a static landing at / and the React app at /app/. These lock
// the wiring — a Vite input change or a moved entry breaks here first.

test('랜딩이 루트에서 렌더되고 콘텐츠가 정적임', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('App Store screenshots')
  await expect(page.getByRole('link', { name: 'Open the studio →' })).toBeVisible()
})

test('랜딩 CTA가 /app/의 에디터로 이동함', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Open the studio →' }).click()
  await expect(page).toHaveURL(/\/app\/$/)
  await expect(page.getByText('프로젝트 가져오기').first()).toBeVisible()
})
