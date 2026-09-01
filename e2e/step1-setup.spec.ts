import { test, expect } from '@playwright/test'
import { clearAppState, createProject, slideThumbs } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
})

test('홈이 시작 카드와 빈 목록으로 렌더됨', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '스크린샷 프로젝트' })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 프로젝트' })).toBeVisible()
  await expect(page.getByRole('button', { name: '프로젝트 열기' })).toBeVisible()
  await expect(page.getByText('아직 프로젝트가 없습니다. 위에서 하나 고르세요.')).toBeVisible()
})

test('새 프로젝트 → 폼 없이 바로 에디터, 슬라이드 1장', async ({ page }) => {
  await page.getByRole('button', { name: '새 프로젝트' }).click()

  const stepBtn = page.getByRole('button', { name: /에디터/ })
  await expect(stepBtn).toHaveAttribute('aria-current', 'step')
  await expect(slideThumbs(page)).toHaveCount(1)
})

test('헤더에서 프로젝트 이름을 바꾼다', async ({ page }) => {
  await createProject(page, { name: 'Renamed App' })
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('Renamed App')
})

// The name is the export's file name and the window title, so an emptied
// field must not stick — it snaps back when focus leaves.
test('이름을 비우고 포커스를 옮기면 기본 이름으로 되돌아온다', async ({ page }) => {
  await createProject(page, { name: 'Has A Name' })

  const nameField = page.getByLabel('프로젝트 이름')
  await nameField.fill('')
  await expect(nameField).toHaveValue('')

  await nameField.blur()
  await expect(nameField).toHaveValue('제목 없음')
})

test('트레이 + 버튼으로 슬라이드를 늘린다', async ({ page }) => {
  await createProject(page, { slideCount: 3 })
  await expect(slideThumbs(page)).toHaveCount(3)
})

test('템플릿 카드로 시작하면 여러 슬라이드로 에디터에 들어간다', async ({ page }) => {
  await page.getByRole('button', { name: '추천 시작 세트' }).click()

  await expect(page.getByRole('button', { name: /에디터/ })).toHaveAttribute('aria-current', 'step')
  expect(await slideThumbs(page).count()).toBeGreaterThan(1)
})

test('프로젝트가 열려 있으면 홈에서 이어서 편집할 수 있다', async ({ page }) => {
  await createProject(page, { name: 'Resume Me' })

  await page.getByRole('button', { name: '프로젝트', exact: false }).first().click()
  await expect(page.getByRole('button', { name: '계속 편집하기 →' })).toBeVisible()

  await page.getByRole('button', { name: '계속 편집하기 →' }).click()
  await expect(page.getByRole('button', { name: /에디터/ })).toHaveAttribute('aria-current', 'step')
})
