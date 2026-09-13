import { test, expect } from '@playwright/test'
import { clearAppState, createProject, uploadScreenshot } from './helpers'

// Cross-type upload keeps the canvas and only overrides the frame visual —
// the banner offers the one explicit way to a real canvas of the shot's type.
test('스크린샷 규격 불일치: 배너에서 규격 전환', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Convert' })
  await uploadScreenshot(page, 'span_ipad.png')

  await expect(
    page.getByText('이 스크린샷은 iPad 규격인데 캔버스는 iPhone 규격입니다.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'iPad 규격으로 전환' }).click()

  // Persist is throttled trailing (canvas re-renders keep touching the store),
  // so allow extra time for the write to land.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('auto-image:project')
          if (!raw) return null
          const p = JSON.parse(raw).state.project
          return {
            model: p.slides[0].deviceFrame.model,
            frameModel: p.slides[0].deviceFrame.frameModel ?? null,
            devices: p.devices,
          }
        }),
      { timeout: 15000 },
    )
    .toEqual({ model: 'ipad-pro-13', frameModel: null, devices: ['iphone', 'ipad'] })

  await expect(
    page.getByText('이 스크린샷은 iPad 규격인데 캔버스는 iPhone 규격입니다.'),
  ).toHaveCount(0)
})
