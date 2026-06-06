import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
})

test('프로젝트 없으면 에디터/로컬라이즈/Export 스텝이 비활성화됨', async ({ page }) => {
  const editorBtn = page.getByRole('button', { name: /에디터/ })
  const localizeBtn = page.getByRole('button', { name: /로컬라이즈/ })
  const exportBtn = page.getByRole('button', { name: /Export/ })

  await expect(editorBtn).toBeDisabled()
  await expect(localizeBtn).toBeDisabled()
  await expect(exportBtn).toBeDisabled()
})

test('프로젝트 생성 후 스텝 이동 가능', async ({ page }) => {
  await createProject(page, { name: 'Nav Test' })

  const localizeBtn = page.getByRole('button', { name: /로컬라이즈/ })
  await expect(localizeBtn).toBeEnabled()

  await localizeBtn.click()
  const exportBtn = page.getByRole('button', { name: /Export/ })
  await expect(exportBtn).toBeEnabled()
})

test('초기화 버튼은 프로젝트 없으면 표시되지 않음', async ({ page }) => {
  await expect(page.getByRole('button', { name: '초기화' })).not.toBeVisible()
})

test('프로젝트 생성 후 초기화 버튼 표시됨', async ({ page }) => {
  await createProject(page, { name: 'Reset Test' })
  await expect(page.getByRole('button', { name: '초기화' })).toBeVisible()
})

test('초기화 모달 표시 및 취소', async ({ page }) => {
  await createProject(page, { name: 'Reset Test' })

  await page.getByRole('button', { name: '초기화' }).click()
  await expect(page.getByRole('heading', { name: '프로젝트 초기화' })).toBeVisible()

  await page.getByRole('button', { name: '취소' }).click()
  await expect(page.getByRole('heading', { name: '프로젝트 초기화' })).not.toBeVisible()

  // 프로젝트는 그대로 남아있어야 함
  await expect(page.getByRole('button', { name: '초기화' })).toBeVisible()
})

test('초기화 확인 후 Step 1로 돌아가고 프로젝트 제거됨', async ({ page }) => {
  await createProject(page, { name: 'Reset Test' })

  await page.getByRole('button', { name: '초기화' }).click()
  // 모달의 초기화 버튼 (두 번째)
  await page.locator('.bg-red-500\\/90, .bg-red-500').click()

  await expect(page.getByRole('heading', { name: '새 스크린샷 프로젝트' })).toBeVisible()
  await expect(page.getByRole('button', { name: '초기화' })).not.toBeVisible()
})

test('모달 배경 클릭으로 닫힘', async ({ page }) => {
  await createProject(page, { name: 'Reset Test' })

  await page.getByRole('button', { name: '초기화' }).click()
  await expect(page.getByRole('heading', { name: '프로젝트 초기화' })).toBeVisible()

  // 모달 배경(overlay) 클릭
  await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('heading', { name: '프로젝트 초기화' })).not.toBeVisible()
})

test('헤더에 프로젝트 이름과 슬라이드 수가 표시됨', async ({ page }) => {
  await createProject(page, { name: 'My Cool App', slideCount: 3 })
  await expect(page.locator('header')).toContainText('My Cool App')
  await expect(page.locator('header')).toContainText('3장')
})
