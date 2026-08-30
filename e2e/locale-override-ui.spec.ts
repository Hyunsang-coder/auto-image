import { test, expect } from '@playwright/test'
import { clearAppState, createProject, uploadScreenshot } from './helpers'

// Taller viewport so the single image row's stacked override buttons fit without
// scrolling — otherwise scroll-into-view tucks the first row under the sticky
// table header and the click gets intercepted.
test.use({ viewport: { width: 1280, height: 1000 } })

// UI integration: the localization page exposes an "이미지" row whose source
// column shows the base screenshot, and each target-locale cell can upload an
// override and clear it. A cell with no override of its own shows the base
// image it falls back to, dimmed and labelled, rather than an empty slot.
test('localize page: upload + clear a per-locale screenshot override', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Override UI', slideCount: 1 })

  // Base screenshot so the slide has a screenshot → the image row appears.
  await uploadScreenshot(page, 'iphone_home.png')

  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  // The image row: a table row whose 필드 cell reads "이미지".
  const imageRow = page.locator('tr', { has: page.getByText('이미지', { exact: true }) })
  await expect(imageRow).toHaveCount(1)

  // Source column plus both target locales (en, ja) showing what they fall
  // back to — three thumbnails, and neither locale has an override yet.
  const fallbacks = imageRow.getByText('기준 언어와 동일')
  await expect(imageRow.locator('img')).toHaveCount(3)
  await expect(fallbacks).toHaveCount(2)

  // Upload an override into the first target-locale cell's hidden file input.
  await imageRow.locator('input[type="file"]').first().setInputFiles(
    new URL('./fixtures/iphone_decks.png', import.meta.url).pathname,
  )

  // That cell now has an image of its own, so only the other locale falls back.
  await expect(fallbacks).toHaveCount(1)
  await expect(imageRow.getByRole('button', { name: '지우기' })).toHaveCount(1)

  // Clearing the override returns the cell to the base image.
  await imageRow.getByRole('button', { name: '지우기' }).click()
  await expect(fallbacks).toHaveCount(2)
  await expect(imageRow.locator('img')).toHaveCount(3)
})
