import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

type CanvasObj = { layerName?: string; type?: string }

function hasBlobCircle() {
  const editor = (
    window as unknown as {
      __editor?: { canvas: { getObjects(): CanvasObj[] } }
    }
  ).__editor
  return !!editor?.canvas
    .getObjects()
    .some((o) => o.layerName === 'background' && o.type === 'circle')
}

function hasGrainRect() {
  const editor = (
    window as unknown as {
      __editor?: { canvas: { getObjects(): CanvasObj[] } }
    }
  ).__editor
  // base fill rect + the grain pattern rect
  const rects = editor?.canvas
    .getObjects()
    .filter((o) => o.layerName === 'background' && o.type === 'rect')
  return (rects?.length ?? 0) >= 2
}

function slideBackground(): { blobs?: unknown[]; noise?: number } {
  const raw = localStorage.getItem('auto-image:project')
  return raw ? JSON.parse(raw).state.project.slides[0].background : {}
}

const noiseSlider = 'div:has(> label:has-text("노이즈")) > input[type="range"]'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Texture Test', slideCount: 1 })
})

test('블롭 추가가 캔버스 background 레이어에 원을 그림', async ({ page }) => {
  await page.getByRole('button', { name: '+ 블롭 추가' }).click()

  await page.waitForFunction(hasBlobCircle)
  await expect(page.getByRole('button', { name: '블롭 1 삭제' })).toBeVisible()

  const bg = await page.evaluate(slideBackground)
  expect(bg.blobs).toHaveLength(1)
})

test('노이즈 슬라이더가 그레인 레이어를 추가하고 스토어에 저장됨', async ({ page }) => {
  await page.locator(noiseSlider).fill('30')

  await page.waitForFunction(hasGrainRect)
  const bg = await page.evaluate(slideBackground)
  expect(bg.noise).toBeCloseTo(0.3)
})

test('탭 전환(그라데이션 → 단색)에도 블롭·노이즈가 유지됨', async ({ page }) => {
  await page.getByRole('button', { name: '+ 블롭 추가' }).click()
  await page.locator(noiseSlider).fill('20')
  await page.waitForFunction(hasBlobCircle)

  await page.getByRole('button', { name: '단색', exact: true }).click()

  await expect(page.getByRole('button', { name: '블롭 1 삭제' })).toBeVisible()
  await page.waitForFunction(hasBlobCircle)
  const bg = await page.evaluate(slideBackground)
  expect(bg.blobs).toHaveLength(1)
  expect(bg.noise).toBeCloseTo(0.2)
})
