import { test, expect } from '@playwright/test'
import { clearAppState, createProject, slideTray, slideThumbs } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Editor Test', slideCount: 3 })
})

test('에디터 레이아웃이 캔버스 + 트레이 + 패널로 렌더됨', async ({ page }) => {
  // 캔버스 영역 (Fabric.js는 lower-canvas + upper-canvas 2개 생성)
  await expect(page.locator('canvas').first()).toBeVisible()
  // 하단 슬라이드 트레이 (<nav>)
  await expect(slideTray(page)).toBeVisible()
  // 프로퍼티 패널 사이드바
  await expect(page.locator('aside').last()).toBeVisible()
})

test('슬라이드 목록에 생성된 슬라이드 수만큼 표시됨', async ({ page }) => {
  // Each single slide is one thumb button; a 2-page span group would be two
  // half-buttons, but a fresh 3-slide project has three single thumbs.
  await expect(slideThumbs(page)).toHaveCount(3)
})

test('슬라이드 클릭으로 활성 슬라이드 변경', async ({ page }) => {
  const slides = slideThumbs(page)

  // 두 번째 슬라이드 클릭
  await slides.nth(1).click()

  // 두 번째 슬라이드가 활성화 색상을 가짐
  await expect(slides.nth(1)).toHaveClass(/border-\[var\(--color-accent\)\]/)
})

test('헤드라인 텍스트 입력이 슬라이드 트레이 썸네일 라벨에 반영됨', async ({ page }) => {
  // 캡션 탭 클릭 (기본 탭은 '배경'이므로 textarea가 없음)
  await page.getByRole('button', { name: '텍스트', exact: true }).click()

  const headlineTextarea = page.locator('textarea').first()
  await headlineTextarea.fill('내 헤드라인')

  // 트레이는 썸네일만 그리므로 헤드라인은 썸네일 버튼의 접근성 라벨(aria-label/title)로 노출됨.
  await expect(slideTray(page).getByRole('button', { name: '내 헤드라인' })).toBeVisible()
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
  // Wait for the first render to adopt its undo baseline — an object:modified
  // fired before that has no pre-change state to push, so Undo stays disabled.
  await page.waitForFunction(() =>
    (window as { __editor?: { hasBaseline: () => boolean } }).__editor?.hasBaseline(),
  )
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

test('Undo가 배지 이동을 되돌리고, 되돌림이 슬라이드 전환 후에도 유지됨', async ({ page }) => {
  type Ed = {
    getState: () => { width: number; objects: { layerName?: string; left: number; top: number; height: number }[] }
    findByLayer: (n: string) => unknown
    canvas: { setActiveObject: (o: unknown) => void; requestRenderAll: () => void }
  }
  const badge = () =>
    page.evaluate(() => {
      const b = (window as unknown as { __editor: Ed }).__editor
        .getState()
        .objects.find((o) => o.layerName === 'badge')!
      return { left: b.left, top: b.top, height: b.height }
    })

  await page.getByRole('button', { name: '배지' }).click()
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') != null)

  const box = (await page.locator('canvas').last().boundingBox())!
  const st = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.getState())
  const scale = box.width / st.width
  const orig = await badge()

  // real drag +60px right → fires object:modified → pushHistory + sync
  const cx = box.x + orig.left * scale
  const cy = box.y + (orig.top + orig.height / 2) * scale
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy, { steps: 6 })
  await page.mouse.up()
  await page.waitForFunction((l) => {
    const b = (window as unknown as { __editor: Ed }).__editor.getState().objects.find((o) => o.layerName === 'badge')!
    return b.left > l + 30
  }, orig.left)
  const moved = await badge()

  // undo → should revert near the original position
  const isMac = process.platform === 'darwin'
  await page.keyboard.press(isMac ? 'Meta+z' : 'Control+z')
  await page.waitForFunction((l) => {
    const b = (window as unknown as { __editor: Ed }).__editor.getState().objects.find((o) => o.layerName === 'badge')!
    return Math.abs(b.left - l) < 10
  }, orig.left)
  const undone = await badge()
  expect(Math.abs(undone.left - orig.left)).toBeLessThan(10)
  expect(moved.left).toBeGreaterThan(orig.left + 30)

  // store consistency: switch slide and back — revert must survive a re-render
  const slides = slideThumbs(page)
  await slides.nth(1).click()
  await slides.nth(0).click()
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('badge') != null)
  const afterSwitch = await badge()
  expect(Math.abs(afterSwitch.left - orig.left)).toBeLessThan(10)
})

test('드래그한 헤드라인 위치가 슬라이드 전환 후에도 유지됨', async ({ page }) => {
  type Ed = {
    getState: () => { width: number; objects: { layerName?: string; left: number; top: number; width: number; height: number }[] }
  }
  const headline = () =>
    page.evaluate(() => {
      const o = (window as unknown as { __editor: Ed }).__editor
        .getState()
        .objects.find((x) => x.layerName === 'text')!
      return { left: o.left, top: o.top, width: o.width, height: o.height }
    })

  // Give the headline real text so it has a clickable footprint.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('내 헤드라인')
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.getState().objects.some((o) => o.layerName === 'text'))

  const box = (await page.locator('canvas').last().boundingBox())!
  const st = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.getState())
  const scale = box.width / st.width
  const orig = await headline()

  // drag the headline up by 90px (click the bbox center, not its left edge)
  const cx = box.x + (orig.left + orig.width / 2) * scale
  const cy = box.y + (orig.top + orig.height / 2) * scale
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 90, { steps: 6 })
  await page.mouse.up()
  await page.waitForFunction(
    (t) => {
      const o = (window as unknown as { __editor: Ed }).__editor.getState().objects.find((x) => x.layerName === 'text')!
      return o.top < t - 40
    },
    orig.top,
  )
  const moved = await headline()

  // switch to slide 2 and back to slide 1 → forces a re-render from the store
  const slides = slideThumbs(page)
  await slides.nth(1).click()
  await slides.nth(0).click()
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.getState().objects.some((o) => o.layerName === 'text'))

  const afterSwitch = await headline()
  // Headline must stay where it was dragged, not snap back to the template top.
  expect(Math.abs(afterSwitch.top - moved.top)).toBeLessThan(8)
  expect(afterSwitch.top).toBeLessThan(orig.top - 40)
})

test('줄인 텍스트 박스 너비가 슬라이드 전환 후에도 유지됨', async ({ page }) => {
  type Ed = {
    findByLayer: (n: string) => { width: number; set: (k: string, v: number) => void; setCoords: () => void } | null
    canvas: { setActiveObject: (o: unknown) => void; fire: (e: string, opts: { target: unknown }) => void }
    getState: () => { objects: { layerName?: string; width: number }[] }
  }
  const hlWidth = () =>
    page.evaluate(
      () => (window as unknown as { __editor: Ed }).__editor.getState().objects.find((o) => o.layerName === 'text')!.width,
    )

  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('두 줄로 감기는 제법 긴 헤드라인 문구입니다')
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('text') != null)
  const before = await hlWidth()

  // Shrink the box by 100px and commit it like a real resize. (Shrinking, not
  // widening: the text-top template's default box is already 85% of the canvas
  // — too little headroom to widen meaningfully.)
  await page.evaluate(() => {
    const ed = (window as unknown as { __editor: Ed }).__editor
    const hl = ed.findByLayer('text')!
    hl.set('width', hl.width - 100)
    hl.setCoords()
    ed.canvas.setActiveObject(hl)
    ed.canvas.fire('object:modified', { target: hl })
  })
  await page.waitForFunction((w) => {
    const hl = (window as unknown as { __editor: Ed }).__editor.getState().objects.find((o) => o.layerName === 'text')
    return !!hl && hl.width < w - 80
  }, before)
  const resized = await hlWidth()

  // switch slide and back → must keep the narrower box, not snap to template width
  const slides = slideThumbs(page)
  await slides.nth(1).click()
  await slides.nth(0).click()
  await page.waitForFunction(() => (window as unknown as { __editor: Ed }).__editor.findByLayer('text') != null)
  const afterSwitch = await hlWidth()
  expect(Math.abs(afterSwitch - resized)).toBeLessThan(8)
  expect(afterSwitch).toBeLessThan(before - 80)
})

test('Step 3(로컬라이즈)로 이동 가능', async ({ page }) => {
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  // 로컬라이즈 에디터 헤더 확인
  await expect(page.getByRole('button', { name: /로컬라이즈/ })).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})
