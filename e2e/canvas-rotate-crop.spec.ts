import { test, expect, type Page } from '@playwright/test'
import {
  clearAppState,
  controlPos,
  createProject,
  drag,
  selectLayer,
  uploadScreenshot,
  type EditorSurface,
} from './helpers'

// On-canvas direct manipulation: the mtr handle rotates the device, and in
// floating mode (frame hidden) the edge controls trim the screenshot card.
// Drags are real pointer events on the Fabric upper-canvas.

test.use({ viewport: { width: 1440, height: 1200 } })

function editor(page: Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor
    return ed?.findByLayer('device-frame')?.angle ?? null
  })
}

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
})

test('mtr 드래그로 기기가 회전하고 회전값이 저장됨', async ({ page }) => {
  await createProject(page, { name: 'Rotate Drag' })
  await selectLayer(page, 'device-frame')
  const mtr = await controlPos(page, 'device-frame', 'mtr')
  await drag(page, mtr, { x: mtr.x + 90, y: mtr.y + 40 })
  // Sync wrote the angle to the store; the re-render restores it on the body.
  await expect.poll(() => editor(page)).not.toBe(0)
  // The panel slider reflects the same angle (store round-trip, not just canvas).
  await page.getByRole('button', { name: '디바이스' }).click()
  const v = Number(await page.getByRole('slider').first().inputValue())
  expect(Math.abs(v)).toBeGreaterThan(1)
})

test('플로팅 모드에서 엣지 컨트롤 드래그가 크롭을 만든다', async ({ page }) => {
  await createProject(page, { name: 'Crop Drag' })
  await uploadScreenshot(page, 'iphone_home.png')
  // 기기 프레임 숨김 → 플로팅 카드 (uploadScreenshot이 디바이스 탭을 연 상태).
  await page.getByText('기기 프레임 표시').click()
  // 플로팅 핸들이 크롭 상태를 들고 다시 렌더될 때까지 대기.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        return ed?.findByLayer('device-frame')?._crop != null
      }),
    )
    .toBe(true)
  await selectLayer(page, 'device-frame')
  const top = await controlPos(page, 'device-frame', 'cropT')
  await drag(page, top, { x: top.x, y: top.y + 100 })
  // 릴리즈 → sync → 스토어 crop.top 반영 → 재렌더된 핸들에도 유지.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        return ed?.findByLayer('device-frame')?._crop?.top ?? 0
      }),
    )
    .toBeGreaterThan(0.05)
  // 다른 엣지는 그대로.
  const crop = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor
    return ed?.findByLayer('device-frame')?._crop ?? null
  })
  expect(crop!.bottom).toBe(0)
  expect(crop!.left).toBe(0)
  expect(crop!.right).toBe(0)
  // 크롭만 했으므로 디바이스 오프셋은 그대로 0 — 크롭 드래그가 오프셋으로
  // 새어들면 카드가 트림한 만큼 점프한다 (regression).
  const df = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    const slide = raw ? JSON.parse(raw).state?.project?.slides?.[0] : null
    return slide ? { offsetX: slide.deviceFrame.offsetX ?? 0, offsetY: slide.deviceFrame.offsetY ?? 0 } : null
  })
  expect(df).toEqual({ offsetX: 0, offsetY: 0 })
})
