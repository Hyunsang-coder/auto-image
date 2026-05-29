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

test('Cmd+D로 선택된 배지가 복제됨', async ({ page }) => {
  await page.getByRole('button', { name: '배지' }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()

  type Ed = {
    canvas: { getObjects: () => { layerName?: string }[]; setActiveObject: (o: unknown) => void; requestRenderAll: () => void }
    findByLayer: (n: string) => unknown
  }
  const badgeCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { __editor: Ed }).__editor.canvas
          .getObjects()
          .filter((o) => o.layerName === 'badge').length,
    )

  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') != null)
  expect(await badgeCount()).toBe(1)

  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor
    e.canvas.setActiveObject(e.findByLayer('badge'))
    e.canvas.requestRenderAll()
  })

  const isMac = process.platform === 'darwin'
  await page.keyboard.press(isMac ? 'Meta+d' : 'Control+d')

  await page.waitForFunction(
    () =>
      (window as unknown as { __editor: Ed }).__editor.canvas.getObjects().filter((o) => o.layerName === 'badge').length === 2,
  )
  expect(await badgeCount()).toBe(2)
})

test('화살표 키로 선택된 배지를 미세 이동 (Shift=10px)', async ({ page }) => {
  await page.getByRole('button', { name: '배지' }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()

  type Ed = {
    findByLayer: (n: string) => { left: number } | null
    canvas: { setActiveObject: (o: unknown) => void; requestRenderAll: () => void }
  }

  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') != null)
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor
    e.canvas.setActiveObject(e.findByLayer('badge'))
    e.canvas.requestRenderAll()
  })

  const before = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge')!.left)
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForFunction(
    (b) => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge')!.left > b + 5,
    before,
  )
  const after = await page.evaluate(
    () => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge')!.left,
  )
  expect(after).toBeGreaterThan(before)
})

test('다중선택 드래그가 양쪽 객체를 올바르게 이동 (그룹 상대좌표 손상 방지)', async ({ page }) => {
  type Ed = {
    getState: () => { width: number; objects: { layerName?: string; left: number; top: number; height: number }[] }
  }
  const badgeGeom = () =>
    page.evaluate(() =>
      (window as unknown as { __editor: Ed }).__editor
        .getState()
        .objects.filter((o) => o.layerName === 'badge')
        .map((o) => ({ left: o.left, top: o.top, height: o.height })),
    )

  await page.getByRole('button', { name: '배지' }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.waitForFunction(
    () =>
      (window as unknown as { __editor: Ed }).__editor.getState().objects.filter((o) => o.layerName === 'badge')
        .length === 2,
  )

  const box = (await page.locator('canvas').last().boundingBox())!
  const st = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.getState())
  const scale = box.width / st.width
  const before = await badgeGeom()
  const pt = (b: { left: number; top: number; height: number }) => ({
    x: box.x + b.left * scale,
    y: box.y + (b.top + b.height / 2) * scale,
  })

  // shift-click both → ActiveSelection, then drag right by 40px
  await page.mouse.click(pt(before[0]).x, pt(before[0]).y)
  await page.keyboard.down('Shift')
  await page.mouse.click(pt(before[1]).x, pt(before[1]).y)
  await page.keyboard.up('Shift')
  await page.mouse.move(pt(before[0]).x, pt(before[0]).y)
  await page.mouse.down()
  await page.mouse.move(pt(before[0]).x + 40, pt(before[0]).y, { steps: 5 })
  await page.mouse.up()

  await page.waitForFunction(
    (b0) =>
      (window as unknown as { __editor: Ed }).__editor
        .getState()
        .objects.filter((o) => o.layerName === 'badge')[0].left >
      b0 + 20,
    before[0].left,
  )
  const after = await badgeGeom()
  // Both badges shifted right by ~40px and kept their (positive, on-canvas) tops.
  expect(after[0].left).toBeGreaterThan(before[0].left + 20)
  expect(after[1].left).toBeGreaterThan(before[1].left + 20)
  expect(after[0].top).toBeGreaterThan(0)
  expect(after[1].top).toBeGreaterThan(0)
})

test('Step 3(로컬라이즈)로 이동 가능', async ({ page }) => {
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  // 로컬라이즈 에디터 헤더 확인
  await expect(page.getByRole('button', { name: /로컬라이즈/ })).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})
