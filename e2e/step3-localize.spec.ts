import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Localize Test', slideCount: 2 })
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
})

test('로컬라이즈 에디터가 렌더됨 (import-only 워크플로)', async ({ page }) => {
  // 인앱 번역은 제거됨 — 양식 내보내기/가져오기 + 번역 프롬프트가 핵심 UI다.
  await expect(page.getByRole('button', { name: 'CSV 내보내기' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'JSON 내보내기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '번역 프롬프트' })).toBeVisible()
  // exact: '이미지 가져오기' (bulk) also contains '가져오기' — pin to the template button.
  await expect(page.getByRole('button', { name: '가져오기', exact: true })).toBeVisible()
})

test('기본 타겟 로케일에서 양식·프롬프트 버튼이 활성화됨', async ({ page }) => {
  // 새 프로젝트는 기본 타겟 로케일(en, ja)을 가지므로 양식 버튼이 활성화된다.
  await expect(page.getByRole('button', { name: 'CSV 내보내기' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '번역 프롬프트' })).toBeEnabled()
})

test('번역 프롬프트 버튼이 미리보기 모달을 열고 내용을 보여줌', async ({ page }) => {
  await page.getByRole('button', { name: '번역 프롬프트' }).click()
  await expect(page.getByRole('heading', { name: '번역 프롬프트' })).toBeVisible()
  // 프롬프트 본문이 모달에 그대로 보인다.
  await expect(page.locator('pre')).toContainText('You are translating App Store screenshot caption copy')
  // 닫기 → 모달이 사라진다.
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page.getByRole('heading', { name: '번역 프롬프트' })).not.toBeVisible()
})

test('소스 로케일 드롭다운이 존재함', async ({ page }) => {
  // 소스 로케일 select
  const selects = page.locator('select')
  await expect(selects.first()).toBeVisible()
})

test('타겟 로케일을 모두 해제하면 양식 내보내기가 비활성화됨', async ({ page }) => {
  // 체크된 타겟 로케일을 모두 해제 → 내보낼 언어가 없으니 양식/프롬프트 버튼 비활성화.
  for (let i = 0; i < 12; i++) {
    const checked = page.getByRole('checkbox', { checked: true })
    if ((await checked.count()) === 0) break
    await checked.first().uncheck()
  }
  await expect(page.getByRole('button', { name: 'CSV 내보내기' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '번역 프롬프트' })).toBeDisabled()
})

test('Export 스텝 버튼으로 이동 가능', async ({ page }) => {
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('heading', { name: '내보내기' })).toBeVisible()
})
