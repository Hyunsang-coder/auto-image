import { test, expect } from '@playwright/test'
import { clearAppState } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
})

test('Step 1 페이지가 올바르게 렌더됨', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '새 스크린샷 프로젝트' })).toBeVisible()
  await expect(page.getByPlaceholder('예: Dogo, Claude, ADHD')).toBeVisible()
  // Device cards are clickable divs (not buttons) — check by their title text.
  await expect(page.getByText('iPhone', { exact: true })).toBeVisible()
  await expect(page.getByText('iPad', { exact: true })).toBeVisible()
})

test('앱 이름이 비어있으면 다음 버튼이 비활성화됨', async ({ page }) => {
  await page.fill('input[placeholder="예: Dogo, Claude, ADHD"]', '')
  const nextBtn = page.getByRole('button', { name: '다음 →' })
  await expect(nextBtn).toBeDisabled()
})

test('슬라이드 수 +/- 버튼이 동작함', async ({ page }) => {
  const countInput = page.locator('input[type="number"]')
  const initialValue = Number(await countInput.inputValue())

  await page.getByRole('button', { name: '+', exact: true }).click()
  await expect(countInput).toHaveValue(String(initialValue + 1))

  await page.getByRole('button', { name: '−' }).click()
  await expect(countInput).toHaveValue(String(initialValue))
})

test('슬라이드 수는 1 미만으로 내려가지 않음', async ({ page }) => {
  const countInput = page.locator('input[type="number"]')
  const minusBtn = page.getByRole('button', { name: '−' })

  // 최소값까지 감소
  for (let i = 0; i < 10; i++) await minusBtn.click()
  await expect(countInput).toHaveValue('1')
})

test('슬라이드 수는 10을 초과하지 않음', async ({ page }) => {
  const countInput = page.locator('input[type="number"]')
  const plusBtn = page.getByRole('button', { name: '+', exact: true })

  for (let i = 0; i < 15; i++) await plusBtn.click()
  await expect(countInput).toHaveValue('10')
})

test('프로젝트 생성 후 Step 2(에디터)로 이동', async ({ page }) => {
  await page.fill('input[placeholder="예: Dogo, Claude, ADHD"]', 'My App')
  await page.getByRole('button', { name: '다음 →' }).click()

  // Step 2 에디터 헤더의 에디터 스텝이 활성화됨
  const stepBtn = page.getByRole('button', { name: /에디터/ })
  await expect(stepBtn).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})

test('기기 카드 클릭으로 선택 전환', async ({ page }) => {
  await page.fill('input[placeholder="예: Dogo, Claude, ADHD"]', 'My App')
  // iPad 카드 클릭 → iPad 선택으로 전환
  await page.getByText('iPad', { exact: true }).click()

  const nextBtn = page.getByRole('button', { name: '다음 →' })
  await expect(nextBtn).toBeEnabled()
})
