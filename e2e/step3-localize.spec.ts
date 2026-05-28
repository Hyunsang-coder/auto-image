import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Localize Test', slideCount: 2 })
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
})

test('로컬라이즈 에디터가 렌더됨', async ({ page }) => {
  // 번역 API 선택 라디오 버튼들
  await expect(page.getByRole('radio', { name: /claude/i })).toBeVisible()
  await expect(page.getByRole('radio', { name: /openai/i })).toBeVisible()
  await expect(page.getByRole('radio', { name: /gemini/i })).toBeVisible()
})

test('타겟 로케일 없으면 전체 번역 버튼이 비활성화됨', async ({ page }) => {
  const translateBtn = page.getByRole('button', { name: /전체 번역/ })
  await expect(translateBtn).toBeDisabled()
})

test('소스 로케일 드롭다운이 존재함', async ({ page }) => {
  // 소스 로케일 select
  const selects = page.locator('select')
  await expect(selects.first()).toBeVisible()
})

test('타겟 로케일 선택 후에도 API 키 없으면 번역 버튼 비활성화', async ({ page }) => {
  // 타겟 로케일 체크박스 선택 (en이 있다면)
  const checkboxes = page.getByRole('checkbox')
  const count = await checkboxes.count()
  if (count > 0) {
    await checkboxes.first().check()
  }

  const translateBtn = page.getByRole('button', { name: /전체 번역/ })
  await expect(translateBtn).toBeDisabled()
})

test('Export 스텝 버튼으로 이동 가능', async ({ page }) => {
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('heading', { name: '내보내기' })).toBeVisible()
})
