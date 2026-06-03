import { test, expect, type Page } from '@playwright/test'
import { clearAppState, createProject, uploadScreenshot } from './helpers'

// Loupe highlights: a new highlight's popup spawns centered over its source
// region, and the popup can be tilted with the mtr handle (rotation persists
// through the store round-trip).

test.use({ viewport: { width: 1440, height: 1200 } })

type FabObj = {
  left?: number
  top?: number
  width?: number
  height?: number
  angle?: number
  setCoords(): void
  getCenterPoint(): { x: number; y: number }
  oCoords?: Record<string, { x: number; y: number }>
}
type EditorSurface = {
  canvas: { setActiveObject(o: unknown): void; renderAll(): void }
  findByLayer(n: string): FabObj | null
}

function findLayer(page: Page, layer: string) {
  return page.evaluate((l) => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor
    return ed?.findByLayer(l) != null
  }, layer)
}

async function selectLayer(page: Page, layer: string) {
  await expect.poll(() => findLayer(page, layer)).toBe(true)
  await page.evaluate((l) => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const obj = ed.findByLayer(l)!
    ed.canvas.setActiveObject(obj)
    obj.setCoords()
    ed.canvas.renderAll()
  }, layer)
}

async function controlPos(page: Page, layer: string, name: string): Promise<{ x: number; y: number }> {
  const local = await page.evaluate(
    ([l, n]) => {
      const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
      const obj = ed.findByLayer(l)!
      obj.setCoords()
      const c = obj.oCoords![n]
      return { x: c.x, y: c.y }
    },
    [layer, name] as [string, string],
  )
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  return { x: box.x + local.x, y: box.y + local.y }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6)
  }
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Loupe Test' })
  await uploadScreenshot(page, 'iphone_home.png')
  await page.getByRole('button', { name: '하이라이트' }).click()
  await page.getByRole('button', { name: '+ 추가' }).click()
  await expect.poll(() => findLayer(page, 'highlight-popup')).toBe(true)
})

test('새 하이라이트 팝업이 원본 영역 위에 생성됨 (돋보기)', async ({ page }) => {
  const result = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const popup = ed.findByLayer('highlight-popup')!
    const body = ed.findByLayer('device-frame')!
    const c = popup.getCenterPoint()
    // Default source region: x 0.08, y 0.42, w 0.84, h 0.18 → center (0.5, 0.51)
    // of the device box.
    const expectedX = (body.left ?? 0) + (body.width ?? 0) * 0.5
    const expectedY = (body.top ?? 0) + (body.height ?? 0) * 0.51
    return { dx: Math.abs(c.x - expectedX), dy: Math.abs(c.y - expectedY) }
  })
  // The frame body's bounds include the bezel, so allow a small tolerance.
  expect(result.dx).toBeLessThan(6)
  expect(result.dy).toBeLessThan(12)
})

test('돋보기를 드래그하면 샘플 영역이 따라 움직임', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    return ed.findByLayer('highlight-popup')!.getCenterPoint()
  })
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  await selectLayer(page, 'highlight-popup')
  await drag(
    page,
    { x: box.x + before.x, y: box.y + before.y },
    { x: box.x + before.x, y: box.y + before.y - 80 },
  )
  // 릴리즈 → sourceRegion.y 갱신 → 재렌더된 카드가 새 지점 위에 그대로 있다.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        return ed?.findByLayer('highlight-popup')?.getCenterPoint().y ?? 0
      }),
    )
    .toBeLessThan(before.y - 40)
})

test('팝업을 mtr 핸들로 회전하면 rotation이 저장·복원됨', async ({ page }) => {
  await selectLayer(page, 'highlight-popup')
  const mtr = await controlPos(page, 'highlight-popup', 'mtr')
  await drag(page, mtr, { x: mtr.x + 80, y: mtr.y + 30 })
  // 릴리즈 → 스토어 sync → 재렌더된 팝업이 그 각도를 유지한다.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        return ed?.findByLayer('highlight-popup')?.angle ?? 0
      }),
    )
    .not.toBe(0)
})

test('기기를 회전하면 돋보기가 원본 지점을 따라간다', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const popup = ed.findByLayer('highlight-popup')!.getCenterPoint()
    const body = ed.findByLayer('device-frame')!
    return {
      popup,
      pivot: {
        x: (body.left ?? 0) + (body.width ?? 0) / 2,
        y: (body.top ?? 0) + (body.height ?? 0) / 2,
      },
    }
  })
  // 기기 회전 슬라이더 → 30°
  await page.getByRole('button', { name: '디바이스' }).click()
  await page.getByRole('slider').first().evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, '30')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  // 돋보기 카드가 기기 중심을 피벗으로 같이 회전한 위치에 재렌더된다.
  const rad = (30 * Math.PI) / 180
  const dx = before.popup.x - before.pivot.x
  const dy = before.popup.y - before.pivot.y
  const expected = {
    x: before.pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: before.pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        const c = ed?.findByLayer('highlight-popup')?.getCenterPoint()
        return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null
      }),
    )
    .toEqual({ x: Math.round(expected.x), y: Math.round(expected.y) })
})
