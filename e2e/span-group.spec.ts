import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Span Test', slideCount: 3 })
})

test('인접 두 슬라이드를 링크하면 2-page span 행이 나타남', async ({ page }) => {
  // Initial: 3 single slide buttons, 2 "link with next" affordances between
  // them (after rows 0 and 1; row 2 is the last so no affordance below it).
  const linkBtn = page.getByRole('button', { name: /다음 슬라이드와 연결/ }).first()
  await expect(linkBtn).toBeVisible()
  await linkBtn.click()

  // Span row label appears.
  await expect(page.getByText('2-page span')).toBeVisible()
  // Unlink (해제) affordance appears.
  await expect(page.getByRole('button', { name: '해제' })).toBeVisible()
})

test('링크 후 캔버스 폭이 2배(880px)로 늘어남', async ({ page }) => {
  await page.getByRole('button', { name: /다음 슬라이드와 연결/ }).first().click()

  // Wait for re-render then read Fabric's upper-canvas width attribute. The
  // editor canvas is normally EDITOR_CANVAS_WIDTH (440); grouped slides
  // should double to 880.
  const canvas = page.locator('canvas.upper-canvas').first()
  await expect(canvas).toBeVisible()

  // Allow Fabric a tick to apply the new dimensions.
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas.upper-canvas') as HTMLCanvasElement | null
    return c?.width === 880
  })
  const width = await canvas.evaluate((el: HTMLCanvasElement) => el.width)
  expect(width).toBe(880)
})

test('해제 버튼이 그룹을 풀고 다시 단일 슬라이드 2개로 만듦', async ({ page }) => {
  await page.getByRole('button', { name: /다음 슬라이드와 연결/ }).first().click()
  await expect(page.getByText('2-page span')).toBeVisible()

  await page.getByRole('button', { name: '해제' }).click()

  // Span row gone.
  await expect(page.getByText('2-page span')).not.toBeVisible()
  // The "link with next" affordance returns between every adjacent single
  // pair — for a 3-slide project that's 2 affordances.
  const linkBtns = page.getByRole('button', { name: /다음 슬라이드와 연결/ })
  await expect(linkBtns).toHaveCount(2)
})
