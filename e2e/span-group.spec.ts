import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Span Test', slideCount: 3 })
})

test('인접 두 슬라이드를 링크하면 2-page span 행이 나타남', async ({ page }) => {
  // Initial: 3 single slide buttons, 2 "link with next" affordances between
  // them (after rows 0 and 1; row 2 is the last so no affordance after it).
  const linkBtn = page.getByTitle('옆 슬라이드와 한 장으로 묶기').first()
  await expect(linkBtn).toBeVisible()
  await linkBtn.click()

  // Span group appears (its container carries a "🔗 2-page span" title).
  await expect(page.getByTitle('🔗 2-page span')).toBeVisible()
  // Unlink (해제) affordance appears.
  await expect(page.getByRole('button', { name: '해제' })).toBeVisible()
})

test('링크 후 캔버스 폭이 2배(880px)로 늘어남', async ({ page }) => {
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()

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
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  await expect(page.getByTitle('🔗 2-page span')).toBeVisible()

  await page.getByRole('button', { name: '해제' }).click()

  // Span group gone.
  await expect(page.getByTitle('🔗 2-page span')).toHaveCount(0)
  // The "link with next" affordance returns between every adjacent single
  // pair — for a 3-slide project that's 2 affordances.
  const linkBtns = page.getByTitle('옆 슬라이드와 한 장으로 묶기')
  await expect(linkBtns).toHaveCount(2)
})

test('Follower 반쪽을 클릭해도 캔버스가 leader의 2× 폭을 유지함', async ({ page }) => {
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas.upper-canvas') as HTMLCanvasElement | null
    return c?.width === 880
  })

  // SpanRow exposes two half-buttons via title. Click the R (Follower) half.
  await page.locator('button[title="오른쪽 (Follower)"]').click()

  // Width stays at 880 — clicking the follower routes back to the leader
  // canvas, doesn't drop us into a 440px view.
  const w = await page
    .locator('canvas.upper-canvas')
    .first()
    .evaluate((el: HTMLCanvasElement) => el.width)
  expect(w).toBe(880)
})

test('로컬라이즈에서 grouped 슬라이드는 leader 한 줄로 표시되고 "N·N+1" 라벨이 붙음', async ({ page }) => {
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  await expect(page.getByTitle('🔗 2-page span')).toBeVisible()

  // Step 3.
  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  // Leader's cell shows the combined "1·2" label (the follower's would-be row
  // is suppressed entirely — the leader's translation covers both halves).
  await expect(page.locator('td', { hasText: /^1·2$/ })).toBeVisible()
  // Slide #3 (the un-grouped one) keeps its plain "3" label.
  await expect(page.locator('td', { hasText: /^3$/ })).toBeVisible()
})

test('링크하면 기기가 seam(캔버스 중앙)에 정렬됨', async ({ page }) => {
  // Inside a 2-page span the device must straddle the seam (cw / 2) so the
  // screenshot spans both pages evenly — getDeviceLayout forces centerX to the
  // seam for every template, including off-center ones (split, hero-bleed).
  // New slides default to text-top, so this exercises the forced-centering path
  // with the default layout.
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas.upper-canvas') as HTMLCanvasElement | null
    return c?.width === 880
  })

  const geom = await page.evaluate(() => {
    const editor = (window as unknown as { __editor: { canvas: import('fabric').Canvas } }).__editor
    const c = editor.canvas
    const dev = c.getObjects().find(
      (o) => (o as unknown as { layerName?: string }).layerName === 'device-frame',
    )!
    const b = dev.getBoundingRect()
    return { seam: c.width! / 2, deviceCenter: Math.round(b.left + b.width / 2) }
  })

  expect(geom.deviceCenter).toBe(geom.seam)
})

test('Export 총 PNG 개수는 그룹 유무와 무관 (슬라이드 × 로케일)', async ({ page }) => {
  // 3 slides × 3 locales (ko source + en + ja defaults) = 9 PNGs.
  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  await page.getByRole('button', { name: /내보내기 →/ }).click()

  // The export summary card surfaces the total count. Grouping shouldn't
  // reduce it — a span pair still produces two device-sized PNGs.
  await expect(page.locator('text=/총 PNG/')).toBeVisible()
  await expect(page.locator('text=9개').first()).toBeVisible()
})
