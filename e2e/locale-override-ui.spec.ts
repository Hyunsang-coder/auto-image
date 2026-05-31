import { test, expect } from '@playwright/test'
import { clearAppState, createProject, uploadScreenshot } from './helpers'

// Taller viewport so the single image row's stacked override buttons fit without
// scrolling — otherwise scroll-into-view tucks the first row under the sticky
// table header and the click gets intercepted.
test.use({ viewport: { width: 1280, height: 1000 } })

// UI integration: the localization page exposes an "이미지" row whose source
// column shows the base screenshot, and each target-locale cell can upload an
// override (a second thumbnail appears) and clear it (back to one thumbnail).
test('localize page: upload + clear a per-locale screenshot override', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Override UI', slideCount: 1 })

  // Base screenshot so the slide has a screenshot → the image row appears.
  await uploadScreenshot(page, 'iphone_home.png')

  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  // The image row: a table row whose 필드 cell reads "이미지".
  const imageRow = page.locator('tr', { has: page.getByText('이미지', { exact: true }) })
  await expect(imageRow).toHaveCount(1)

  // Source column shows the base thumbnail → exactly one image to start.
  await expect(imageRow.locator('img')).toHaveCount(1)

  // Upload an override into the first target-locale cell's hidden file input.
  await imageRow.locator('input[type="file"]').first().setInputFiles(
    new URL('./fixtures/iphone_decks.png', import.meta.url).pathname,
  )

  // Override thumbnail appears alongside the base → two images.
  await expect(imageRow.locator('img')).toHaveCount(2)

  // Clearing the override returns to just the base thumbnail.
  await imageRow.getByRole('button', { name: '지우기' }).click()
  await expect(imageRow.locator('img')).toHaveCount(1)
})
