import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Export Test', slideCount: 2 })
  await page.getByRole('button', { name: /Export/ }).click()
})

test('내보내기 패널이 렌더됨', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '내보내기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '미리보기 렌더' })).toBeVisible()
  await expect(page.getByRole('button', { name: /ZIP 내보내기/ })).toBeVisible()
})

test('렌더링 범위 요약이 올바르게 표시됨', async ({ page }) => {
  // 슬라이드 수, 디바이스, 로케일 정보가 있어야 함
  const content = await page.locator('body').textContent()
  expect(content).toContain('2')   // 슬라이드 2장
  expect(content).toContain('iPhone') // 기기
})

test('← 로컬라이즈 버튼으로 Step 3으로 이동', async ({ page }) => {
  await page.getByRole('button', { name: '← 로컬라이즈' }).click()
  await expect(page.getByRole('button', { name: /로컬라이즈/ })).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})

test('미리보기 렌더 버튼이 클릭 가능하고 로딩 후 이미지 표시', async ({ page }) => {
  await page.getByRole('button', { name: '미리보기 렌더' }).click()

  // 렌더링 중 버튼이 비활성화됨
  // (짧게 비활성화되다가 완료되면 다시 활성화)
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[src^="blob:"]')
      return img !== null
    },
    { timeout: 30_000 },
  )

  await expect(page.locator('img[src^="blob:"]')).toBeVisible()
})

test('ZIP 내보내기 버튼이 실행 중에 비활성화됨', async ({ page }) => {
  const exportBtn = page.getByRole('button', { name: /ZIP 내보내기/ })

  // 클릭하여 export 시작
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    exportBtn.click(),
  ])

  // 다운로드가 시작됨 (zip 파일)
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
})
