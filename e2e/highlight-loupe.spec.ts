import { test, expect } from '@playwright/test'
import {
  clearAppState,
  controlPos,
  createProject,
  drag,
  findLayer,
  selectLayer,
  uploadScreenshot,
  type EditorSurface,
} from './helpers'

test.use({ viewport: { width: 1440, height: 1200 } })

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Loupe Test' })
  await uploadScreenshot(page, 'iphone_home.png')
  await page.getByRole('button', { name: '하이라이트' }).click()
  await page.getByRole('button', { name: '+ 추가' }).click()
  await expect.poll(() => findLayer(page, 'highlight-source')).toBe(true)
  await expect.poll(() => findLayer(page, 'highlight-popup')).toBe(true)
})

test('새 하이라이트는 원본 박스와 확대 카드가 분리되어 생성됨', async ({ page }) => {
  const result = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const canvas = ed.canvas as unknown as { width: number; height: number }
    const shot = ed.findByLayer('screenshot') as unknown as {
      _screenBounds: { left: number; top: number; width: number; height: number }
    }
    const source = ed.findByLayer('highlight-source')!
    const popup = ed.findByLayer('highlight-popup')!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    const sc = source.getCenterPoint()
    const pc = popup.getCenterPoint()
    const expectedSource = {
      x: shot._screenBounds.left + shot._screenBounds.width * (h.sourceRegion.x + h.sourceRegion.w / 2),
      y: shot._screenBounds.top + shot._screenBounds.height * (h.sourceRegion.y + h.sourceRegion.h / 2),
    }
    const expectedPopup = {
      x: canvas.width * h.popup.x,
      y: canvas.height * h.popup.y,
    }
    return {
      sourceDx: Math.abs(sc.x - expectedSource.x),
      sourceDy: Math.abs(sc.y - expectedSource.y),
      popupDx: Math.abs(pc.x - expectedPopup.x),
      popupDy: Math.abs(pc.y - expectedPopup.y),
      verticalGap: sc.y - pc.y,
    }
  })
  expect(result.sourceDx).toBeLessThanOrEqual(1)
  expect(result.sourceDy).toBeLessThan(2)
  expect(result.popupDx).toBeLessThan(1)
  expect(result.popupDy).toBeLessThan(1)
  expect(result.verticalGap).toBeGreaterThan(100)
})

test('확대 카드를 드래그해도 원본 영역은 변하지 않음', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    return {
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      sourceRegion: h.sourceRegion,
      popupState: h.popup,
    }
  })
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  await selectLayer(page, 'highlight-popup')
  await drag(
    page,
    { x: box.x + before.popup.x, y: box.y + before.popup.y },
    { x: box.x + before.popup.x + 70, y: box.y + before.popup.y - 80 },
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
        return h ? h.popup.y : null
      }),
    )
    .toBeLessThan(before.popupState.y)
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
  })
  expect(after.sourceRegion).toEqual(before.sourceRegion)
  expect(after.popup.x).toBeGreaterThan(before.popupState.x)
})

test('원본 박스를 드래그하면 샘플 영역만 이동함', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    return {
      source: ed.findByLayer('highlight-source')!.getCenterPoint(),
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      sourceRegion: h.sourceRegion,
      popupState: h.popup,
    }
  })
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  await selectLayer(page, 'highlight-source')
  await drag(
    page,
    { x: box.x + before.source.x, y: box.y + before.source.y },
    { x: box.x + before.source.x, y: box.y + before.source.y - 80 },
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
        return h ? h.sourceRegion.y : null
      }),
    )
    .toBeLessThan(before.sourceRegion.y)
  const after = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    return {
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      sourceRegion: h.sourceRegion,
      popupState: h.popup,
    }
  })
  expect(after.sourceRegion.x).toBeCloseTo(before.sourceRegion.x, 2)
  expect(after.sourceRegion.w).toBeCloseTo(before.sourceRegion.w, 3)
  expect(after.sourceRegion.h).toBeCloseTo(before.sourceRegion.h, 3)
  expect(after.popupState).toEqual(before.popupState)
  expect(after.popup.x).toBeCloseTo(before.popup.x, 0)
  expect(after.popup.y).toBeCloseTo(before.popup.y, 0)
})

test('원본 박스를 리사이즈하면 샘플 크기가 바뀜', async ({ page }) => {
  const before = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0].sourceRegion : null
  })
  await selectLayer(page, 'highlight-source')
  const br = await controlPos(page, 'highlight-source', 'br')
  await drag(page, br, { x: br.x - 80, y: br.y - 35 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
        return h ? h.sourceRegion.w : null
      }),
    )
    .toBeLessThan(before.w)
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0].sourceRegion : null
  })
  expect(after.h).toBeLessThan(before.h)
})

test('확대 카드를 mtr 핸들로 회전하면 rotation이 저장·복원됨', async ({ page }) => {
  const sourceBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0].sourceRegion : null
  })
  await selectLayer(page, 'highlight-popup')
  const mtr = await controlPos(page, 'highlight-popup', 'mtr')
  await drag(page, mtr, { x: mtr.x + 80, y: mtr.y + 30 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
        return h ? h.popup.rotation ?? 0 : 0
      }),
    )
    .not.toBe(0)
  const sourceAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0].sourceRegion : null
  })
  expect(sourceAfter).toEqual(sourceBefore)
})

test('기기 드래그 중 원본 박스는 스크린샷을 따라가고 확대 카드는 제자리에 남음', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const body = ed.findByLayer('device-frame')!
    const shot = ed.findByLayer('screenshot')!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    return {
      source: ed.findByLayer('highlight-source')!.getCenterPoint(),
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      shot: { left: shot.left ?? 0, top: shot.top ?? 0 },
      grab: { x: (body.left ?? 0) + (body.width ?? 0) / 2, y: (body.top ?? 0) + 6 },
      sourceRegion: h.sourceRegion,
      popupState: h.popup,
    }
  })
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  const grab = { x: box.x + before.grab.x, y: box.y + before.grab.y }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(grab.x + (90 * i) / 6, grab.y + (60 * i) / 6)
  }
  const mid = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const shot = ed.findByLayer('screenshot')!
    return {
      source: ed.findByLayer('highlight-source')!.getCenterPoint(),
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      shot: { left: shot.left ?? 0, top: shot.top ?? 0 },
    }
  })
  const shotDelta = { x: mid.shot.left - before.shot.left, y: mid.shot.top - before.shot.top }
  expect(Math.abs(shotDelta.x)).toBeGreaterThan(40)
  expect(mid.source.x - before.source.x).toBeCloseTo(shotDelta.x, 0)
  expect(mid.source.y - before.source.y).toBeCloseTo(shotDelta.y, 0)
  expect(mid.popup.x).toBeCloseTo(before.popup.x, 0)
  expect(mid.popup.y).toBeCloseTo(before.popup.y, 0)
  await page.mouse.up()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        const df = raw ? JSON.parse(raw).state.project.slides[0].deviceFrame : null
        return df ? (df.offsetX ?? 0) !== 0 || (df.offsetY ?? 0) !== 0 : false
      }),
    )
    .toBe(true)
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
  })
  expect(after.sourceRegion).toEqual(before.sourceRegion)
  expect(after.popup.x).toBeCloseTo(before.popupState.x, 3)
  expect(after.popup.y).toBeCloseTo(before.popupState.y, 3)
})

test('기기를 회전하면 원본 박스만 원본 지점을 따라가고 확대 카드는 유지됨', async ({ page }) => {
  const before = await page.evaluate(() => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const body = ed.findByLayer('device-frame')!
    const raw = localStorage.getItem('auto-image:project')
    const h = raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
    return {
      source: ed.findByLayer('highlight-source')!.getCenterPoint(),
      popup: ed.findByLayer('highlight-popup')!.getCenterPoint(),
      pivot: {
        x: (body.left ?? 0) + (body.width ?? 0) / 2,
        y: (body.top ?? 0) + (body.height ?? 0) / 2,
      },
      sourceRegion: h.sourceRegion,
      popupState: h.popup,
    }
  })
  await page.getByRole('button', { name: '디바이스' }).click()
  await page.getByRole('slider').first().evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, '30')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const rad = (30 * Math.PI) / 180
  const dx = before.source.x - before.pivot.x
  const dy = before.source.y - before.pivot.y
  const expectedSource = {
    x: before.pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: before.pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor?: EditorSurface }).__editor
        const s = ed?.findByLayer('highlight-source')?.getCenterPoint()
        const p = ed?.findByLayer('highlight-popup')?.getCenterPoint()
        return s && p
          ? { sx: Math.round(s.x), sy: Math.round(s.y), px: Math.round(p.x), py: Math.round(p.y) }
          : null
      }),
    )
    .toEqual({
      sx: Math.round(expectedSource.x),
      sy: Math.round(expectedSource.y),
      px: Math.round(before.popup.x),
      py: Math.round(before.popup.y),
    })
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return raw ? JSON.parse(raw).state.project.slides[0].highlights[0] : null
  })
  expect(after.sourceRegion).toEqual(before.sourceRegion)
  expect(after.popup.x).toBeCloseTo(before.popupState.x, 3)
  expect(after.popup.y).toBeCloseTo(before.popupState.y, 3)
})
