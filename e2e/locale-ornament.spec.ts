import { test, expect } from '@playwright/test'
import { clearAppState, createProject, selectLayer } from './helpers'

// Per-locale ornaments: in locale edit mode the ornament stays editable and a
// nudge writes into that locale's override — the base set is untouched.

type StoredSlide = {
  ornaments?: { x: number }[]
  localeOverrides?: Record<string, { ornaments?: { x: number }[] }>
}

function readSlide(page: import('@playwright/test').Page): Promise<StoredSlide> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')!
    return JSON.parse(raw).state.project.slides[0]
  })
}

test('locale 모드에서 장식 이동은 그 언어의 override로만 기록됨', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Orn Locale', slideCount: 1 })

  // Base ornament via the 장식 tab.
  await page.getByRole('button', { name: '장식', exact: true }).click()
  await page.getByTitle('별', { exact: true }).click()
  await expect.poll(async () => (await readSlide(page)).ornaments?.length ?? 0).toBe(1)
  const baseX = (await readSlide(page)).ornaments![0].x

  // Enter English edit mode (new projects target en/ja by default) — the
  // ornament must stay editable (not shared-locked).
  await page.getByTitle(/편집 언어/).selectOption('en')
  await selectLayer(page, 'ornament')
  const editable = await page.evaluate(() => {
    const ed = (
      window as unknown as {
        __editor?: { canvas: { getObjects(): { layerName?: string; selectable?: boolean }[] } }
      }
    ).__editor!
    const o = ed.canvas.getObjects().find((x) => x.layerName === 'ornament')!
    return o.selectable !== false
  })
  expect(editable).toBe(true)

  // Nudge right 10px → routed into localeOverrides.en, base untouched.
  await page.keyboard.press('Shift+ArrowRight')
  await expect
    .poll(async () => (await readSlide(page)).localeOverrides?.en?.ornaments?.[0]?.x ?? 0)
    .toBeGreaterThan(baseX)
  expect((await readSlide(page)).ornaments![0].x).toBe(baseX)
})
