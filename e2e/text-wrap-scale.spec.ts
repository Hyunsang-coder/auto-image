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
