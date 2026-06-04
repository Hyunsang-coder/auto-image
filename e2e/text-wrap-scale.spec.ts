import { test, expect } from '@playwright/test'
import { clearAppState, createProject, selectLayer, controlPos, drag } from './helpers'

// Caption text behavior on the canvas: CJK grapheme wrapping (a token wider
// than the box wraps instead of overflowing) and corner-scale persistence
// (scaling a text box bakes into fontSize instead of snapping back).

type TextObj = { text?: string; textLines?: string[]; fontSize?: number; width?: number }

function readHeadline(page: import('@playwright/test').Page): Promise<TextObj | null> {
  return page.evaluate(() => {
    const ed = (
      window as unknown as {
        __editor?: { canvas: { getObjects(): Record<string, unknown>[] } }
      }
    ).__editor
    if (!ed) return null
    const o = ed.canvas
      .getObjects()
      .find((x) => (x as { layerName?: string }).layerName === 'text') as TextObj | undefined
    return o ? { text: o.text, textLines: o.textLines, fontSize: o.fontSize, width: o.width } : null
  })
}

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Text Test', slideCount: 1 })
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
})

test('띄어쓰기 없는 한글은 글자 단위로 줄바꿈 (상자 밖 오버플로 없음)', async ({ page }) => {
  await page.locator('textarea').first().fill('운동기록을자동으로정리해주는똑똑한러닝앱입니다')
  await expect
    .poll(async () => (await readHeadline(page))?.textLines?.length ?? 0)
    .toBeGreaterThan(1)
  const obj = (await readHeadline(page))!
  // The box stays page-bound (no 775px-wide single line) and the design font
  // size survives — wrap instead of shrink/overflow.
  expect(obj.width!).toBeLessThanOrEqual(440)
  expect(obj.fontSize).toBe(40)
})

test('띄어쓰기 있는 한글은 단어 단위 줄바꿈 유지', async ({ page }) => {
  await page.locator('textarea').first().fill('운동 기록을 자동으로 정리해 주는 똑똑한 러닝 앱')
  await expect
    .poll(async () => (await readHeadline(page))?.textLines?.length ?? 0)
    .toBeGreaterThan(1)
  const obj = (await readHeadline(page))!
  // Word tokens all fit the box → no grapheme splitting: every rendered line
  // is a sequence of complete words from the original text.
  for (const line of obj.textLines!) {
    for (const word of line.split(' ')) {
      expect('운동 기록을 자동으로 정리해 주는 똑똑한 러닝 앱'.split(' ')).toContain(word)
    }
  }
})

test('fit-to-box: 줄어든 표시 크기가 저장 크기를 오염시키지 않고, 넓히면 글자가 되살아남', async ({ page }) => {
  // Set everything BEFORE the text fill: the fill is then the last store
  // mutation, so polling on the text guarantees the final re-render landed
  // (dragging mid-re-render would grab a stale, replaced object).
  await page.locator('label:has-text("박스 너비에 맞춤") input[type=checkbox]').check()
  // Scope to the headline block — the bulk-style section above it has its own
  // 크기 number input that would otherwise match first.
  await page
    .locator('div:has(> p:has-text("헤드라인")) input[type="number"]')
    .first()
    .fill('64')
  await page.locator('textarea').first().fill('Comprehensive weather information')
  await expect.poll(async () => (await readHeadline(page))?.text).toBe('Comprehensive weather information')

  // Design 64 over-fills the default box with its widest word → render-time
  // fit shows a smaller canvas size while the store keeps the design size.
  await expect.poll(async () => (await readHeadline(page))?.fontSize ?? 99).toBeLessThan(64)
  const fitted = (await readHeadline(page))!.fontSize!

  // Widen the box → the canvas font re-fits upward toward the design ceiling…
  await selectLayer(page, 'text')
  const mr = await controlPos(page, 'text', 'mr')
  await drag(page, mr, { x: mr.x + 50, y: mr.y })
  await expect
    .poll(async () => (await readHeadline(page))?.fontSize ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(fitted)

  // …and the release must not bake the fitted size into the store (the old
  // ratchet permanently replaced the design size with the shrunk one).
  const storedSize = await page.evaluate(
    () => JSON.parse(localStorage.getItem('auto-image:project')!).state.project.slides[0].texts[0].style.fontSize,
  )
  expect(storedSize).toBe(64)
})

test('캔버스 밖까지 넓힌 박스가 릴리즈 후에도 그대로 유지됨 (점프 없음)', async ({ page }) => {
  await page.locator('textarea').first().fill('깔끔하고 보기 쉬운 날씨 정보를 한눈에')
  await expect.poll(async () => (await readHeadline(page))?.text).toBe('깔끔하고 보기 쉬운 날씨 정보를 한눈에')

  await selectLayer(page, 'text')
  const mr = await controlPos(page, 'text', 'mr')
  // Drag past the right canvas edge, capturing the pre-release state between
  // the last move and mouse-up: release must not re-clamp/re-center the box.
  await page.mouse.move(mr.x, mr.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(mr.x + (200 * i) / 6, mr.y)
  const mid = (await readHeadline(page))!
  await page.mouse.up()

  await expect
    .poll(async () => (await readHeadline(page))?.width ?? 0, { timeout: 5_000 })
    .toBeCloseTo(mid.width!, 0)
  const after = (await readHeadline(page))!
  expect(after.width!).toBeGreaterThan(440) // overshoot survived, not clamped to one page
  expect(after.textLines).toEqual(mid.textLines) // no reflow on release
})

test('모서리 핸들로 키운 텍스트 크기가 유지됨 (스냅백 없음)', async ({ page }) => {
  await page.locator('textarea').first().fill('크기 테스트')
  await expect.poll(async () => (await readHeadline(page))?.text).toBe('크기 테스트')
  const before = (await readHeadline(page))!

  await selectLayer(page, 'text')
  const br = await controlPos(page, 'text', 'br')
  await drag(page, br, { x: br.x + 60, y: br.y + 60 })

  // After release the store re-renders the caption — the enlarged size must
  // survive (scaleY baked into fontSize), not snap back to the design size.
  await expect
    .poll(async () => (await readHeadline(page))?.fontSize ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(before.fontSize!)
})
