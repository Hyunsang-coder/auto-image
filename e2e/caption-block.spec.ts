import { test, expect, type Page } from '@playwright/test'
import { clearAppState, createProject, openSection, selectLayer, zoomTo100 } from './helpers'

// Two things the caption blocks used to get wrong, both of them ways to lose
// work: text typed straight onto the canvas vanished if you left the editor
// without deselecting first, and a block could not be removed at all once it
// was the only one left.

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Caption Test', slideCount: 1 })
  await zoomTo100(page)
})

/** How many caption objects the canvas is currently drawing. */
function textCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ed = (window as unknown as { __editor?: { getState(): { objects: { layerName?: string }[] } } })
      .__editor
    return ed ? ed.getState().objects.filter((o) => o.layerName === 'text').length : -1
  })
}

/** Put the first caption into Fabric's inline editor and type, without exiting. */
async function typeOnCanvas(page: Page, text: string) {
  await selectLayer(page, 'text')
  await page.evaluate(() => {
    const ed = (window as unknown as { __editor: { canvas: { getActiveObject(): unknown } } }).__editor
    const active = ed.canvas.getActiveObject() as {
      enterEditing(): void
      selectAll(): void
    }
    active.enterEditing()
    active.selectAll()
  })
  await page.keyboard.type(text)
}

test('편집 중이던 캡션이 단계를 옮겨도 남아 있음', async ({ page }) => {
  await openSection(page, '텍스트')
  await page.locator('textarea').first().fill('원본')

  await typeOnCanvas(page, '편집중')
  // Still only on the canvas: the store is written when editing exits, and it
  // has not exited yet.
  await expect(page.locator('textarea').first()).toHaveValue('원본')

  // Leave without pressing Escape or clicking away — this unmounts the canvas,
  // and fabric's dispose() does not exit the editor on its own.
  await page.getByRole('button', { name: /Localize|로컬라이즈/ }).first().click()
  await expect(page.getByRole('button', { name: /Editor|에디터/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /Editor|에디터/ }).first().click()

  await openSection(page, '텍스트')
  await expect(page.locator('textarea').first()).toHaveValue('편집중')
})

test('선택한 텍스트 블록을 Backspace로 삭제', async ({ page }) => {
  await openSection(page, '텍스트')
  await page.getByRole('button', { name: /텍스트 블록 추가/ }).click()
  await expect.poll(() => textCount(page)).toBe(2)

  await selectLayer(page, 'text')
  await page.keyboard.press('Backspace')

  await expect.poll(() => textCount(page)).toBe(1)
})

test('마지막 남은 텍스트 블록도 삭제할 수 있음', async ({ page }) => {
  await openSection(page, '텍스트')
  await expect.poll(() => textCount(page)).toBe(1)

  // The panel's delete button used to appear only from the second block on, so
  // the first one could never be removed by any route.
  await page.getByRole('button', { name: '이 텍스트 블록 삭제' }).click()

  await expect.poll(() => textCount(page)).toBe(0)
  await expect(page.getByText('텍스트 블록이 없습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: /텍스트 블록 추가 \(0\/4\)/ })).toBeVisible()
})

test('캔버스에서 고른 텍스트 블록만 패널에서 펼쳐짐', async ({ page }) => {
  await openSection(page, '텍스트')
  await page.locator('textarea').first().fill('첫 블록')
  await page.getByRole('button', { name: /텍스트 블록 추가/ }).click()
  await expect.poll(() => textCount(page)).toBe(2)

  // Adding opens the new block, so the first one collapses to a header
  // carrying a preview of its text.
  await expect(
    page.getByRole('button', { name: /제목 \(헤드라인\) 첫 블록/, expanded: false }),
  ).toBeVisible()

  // Selecting the headline on the canvas opens its block instead.
  await selectLayer(page, 'text')
  await expect(page.getByRole('button', { name: /제목 \(헤드라인\)/, expanded: true })).toBeVisible()
  await expect(page.locator('textarea').first()).toHaveValue('첫 블록')
})
