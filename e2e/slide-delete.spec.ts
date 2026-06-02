import { test, expect } from '@playwright/test'
import { clearAppState, createProject, slideTray, slideThumbs } from './helpers'

// Deleting a slide drops it from the list. The trash button is revealed on thumb
// hover; the store refuses to remove the last slide, so the button disables.
test('슬라이드 삭제: 트레이에서 삭제하면 목록에서 빠진다', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Delete', slideCount: 2 })

  // Give slide 1 a headline so it's identifiable as a thumb label.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Delete me')

  const tray = slideTray(page)
  await expect(slideThumbs(page)).toHaveCount(2)
  const target = tray.getByRole('button', { name: 'Delete me' })
  await expect(target).toHaveCount(1)

  // Hover the thumb to reveal the trash button, then click it.
  await target.hover()
  await tray.getByTitle('슬라이드 삭제').first().click()

  // A confirm popup asks again before deleting — confirm it.
  await page.getByRole('button', { name: '삭제', exact: true }).click()

  // The slide is gone — one thumb left, no 'Delete me'.
  await expect(slideThumbs(page)).toHaveCount(1)
  await expect(tray.getByRole('button', { name: 'Delete me' })).toHaveCount(0)

  // The last remaining slide can't be deleted — its trash button is disabled.
  await slideThumbs(page).first().hover()
  await expect(tray.getByTitle('마지막 슬라이드는 삭제할 수 없습니다')).toBeDisabled()
})
