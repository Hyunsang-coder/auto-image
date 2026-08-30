import { test, expect } from '@playwright/test'
import { clearAppState, createProject, openSection } from './helpers'

type CanvasObj = { layerName?: string; type?: string }

// Passed to page.evaluate/waitForFunction — must stay self-contained.
function getEditorObjects(): CanvasObj[] {
  const editor = (
    window as unknown as {
      __editor?: { canvas: { getObjects(): CanvasObj[] } }
    }
  ).__editor
  return editor?.canvas.getObjects() ?? []
}

function hasShapeRect() {
  const editor = (
    window as unknown as { __editor?: { canvas: { getObjects(): CanvasObj[] } } }
  ).__editor
  return !!editor?.canvas.getObjects().some((o) => o.layerName === 'shape' && o.type === 'rect')
}

function hasShapePolygon() {
  const editor = (
    window as unknown as { __editor?: { canvas: { getObjects(): CanvasObj[] } } }
  ).__editor
  return !!editor?.canvas.getObjects().some((o) => o.layerName === 'shape' && o.type === 'polygon')
}

function hasShapeEllipse() {
  const editor = (
    window as unknown as { __editor?: { canvas: { getObjects(): CanvasObj[] } } }
  ).__editor
  return !!editor?.canvas.getObjects().some((o) => o.layerName === 'shape' && o.type === 'ellipse')
}

function hasNoShape() {
  const editor = (
    window as unknown as { __editor?: { canvas: { getObjects(): CanvasObj[] } } }
  ).__editor
  return !editor?.canvas.getObjects().some((o) => o.layerName === 'shape')
}

function slideShapes(): Array<{ kind: string; layer?: string }> {
  const raw = localStorage.getItem('auto-image:project')
  return raw ? JSON.parse(raw).state.project.slides[0].shapes ?? [] : []
}

async function layerOrder(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(getEditorObjects).then((objs) => objs.map((o) => o.layerName ?? ''))
}

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Shape Test', slideCount: 1 })
  await openSection(page, '도형')
})

test('사각형 추가 → 캔버스 shape 레이어에 rect, back 밴드(텍스트 아래)로 저장', async ({ page }) => {
  await page.getByRole('button', { name: '사각형' }).click()

  await page.waitForFunction(hasShapeRect)
  const shapes = await page.evaluate(slideShapes)
  expect(shapes).toHaveLength(1)
  expect(shapes[0].kind).toBe('rect')
  expect(shapes[0].layer).toBe('back')

  const order = await layerOrder(page)
  const shapeIdx = order.indexOf('shape')
  expect(shapeIdx).toBeGreaterThan(-1)
  expect(shapeIdx).toBeLessThan(order.indexOf('text'))
})

test('화살표는 front 밴드 — 텍스트 위에 그려짐', async ({ page }) => {
  await page.getByRole('button', { name: '화살표' }).click()

  await page.waitForFunction(hasShapePolygon)
  const shapes = await page.evaluate(slideShapes)
  expect(shapes[0].kind).toBe('arrow')
  expect(shapes[0].layer).toBe('front')

  const order = await layerOrder(page)
  expect(order.indexOf('shape')).toBeGreaterThan(order.lastIndexOf('text'))
})

test('패널 삭제가 도형을 캔버스와 스토어에서 제거함', async ({ page }) => {
  // 접근성 이름은 "◯ 원"(글리프 포함) — title 속성이 순수 라벨이다.
  await page.locator('button[title="원"]').click()
  await page.waitForFunction(hasShapeEllipse)

  await page.locator('aside').getByRole('button', { name: '삭제' }).click()

  await page.waitForFunction(hasNoShape)
  expect(await page.evaluate(slideShapes)).toHaveLength(0)
})
