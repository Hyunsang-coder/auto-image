import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Editor Test', slideCount: 3 })
})

test('에디터 레이아웃이 3-컬럼으로 렌더됨', async ({ page }) => {
  // 슬라이드 목록 사이드바
  await expect(page.locator('aside').first()).toBeVisible()
  // 캔버스 영역 (Fabric.js는 lower-canvas + upper-canvas 2개 생성)
  await expect(page.locator('canvas').first()).toBeVisible()
  // 프로퍼티 패널 사이드바
  await expect(page.locator('aside').last()).toBeVisible()
})

test('슬라이드 목록에 생성된 슬라이드 수만큼 표시됨', async ({ page }) => {
  // Each row is a <li> — that maps to "one slide tile" regardless of whether
  // it's a single slide or a 2-page span group (which renders as one row).
  const slideRows = page.locator('aside').first().locator('ul > li')
  await expect(slideRows).toHaveCount(3)
})

test('슬라이드 클릭으로 활성 슬라이드 변경', async ({ page }) => {
  const slideList = page.locator('aside').first()
  const slides = slideList.getByRole('button')

  // 두 번째 슬라이드 클릭
  await slides.nth(1).click()

  // 두 번째 슬라이드가 활성화 색상을 가짐
  await expect(slides.nth(1)).toHaveClass(/border-\[var\(--color-accent\)\]/)
})

test('헤드라인 텍스트 입력이 슬라이드 목록에 반영됨', async ({ page }) => {
  // 캡션 탭 클릭 (기본 탭은 '템플릿'이므로 textarea가 없음)
  await page.getByRole('button', { name: '캡션' }).click()

  const headlineTextarea = page.locator('textarea').first()
  await headlineTextarea.fill('내 헤드라인')

  // 슬라이드 목록의 첫 번째 항목에 텍스트가 표시됨
  const slideList = page.locator('aside').first()
  await expect(slideList.getByRole('button').first()).toContainText('내 헤드라인')
})

test('Undo/Redo 버튼이 존재함', async ({ page }) => {
  // CanvasToolbar에 undo/redo 버튼
  await expect(page.getByRole('button', { name: /undo|실행 취소/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /redo|다시 실행/i })).toBeVisible()
})

test('초기 진입 시 Undo/Redo 버튼이 비활성화됨', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
})

test('편집(object:modified) 후 Undo 버튼이 활성화됨', async ({ page }) => {
  await page.waitForFunction(() => (window as { __editor?: unknown }).__editor != null)
  await page.evaluate(() => {
    ;(window as unknown as { __editor: { canvas: { fire: (e: string) => void } } }).__editor.canvas.fire(
      'object:modified',
    )
  })
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('Delete 키로 선택된 배지가 삭제됨', async ({ page }) => {
  await page.getByRole('button', { name: '배지' }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()

  type Ed = { findByLayer: (n: string) => unknown; canvas: { setActiveObject: (o: unknown) => void; requestRenderAll: () => void } }

  // Badge group lands on the canvas, then select it programmatically.
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') != null)
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor
    e.canvas.setActiveObject(e.findByLayer('badge'))
    e.canvas.requestRenderAll()
  })

  await page.keyboard.press('Delete')

  // Store-driven delete re-renders the canvas without the badge.
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') == null)
  expect(
    await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge')),
  ).toBeNull()
})

test('Step 3(로컬라이즈)로 이동 가능', async ({ page }) => {
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  // 로컬라이즈 에디터 헤더 확인
  await expect(page.getByRole('button', { name: /로컬라이즈/ })).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})
