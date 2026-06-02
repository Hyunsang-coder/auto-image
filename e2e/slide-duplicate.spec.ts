import { test, expect } from '@playwright/test'
import { clearAppState, createProject, slideTray } from './helpers'

// Duplicating a single slide inserts a standalone copy right after it, carrying
// the same headline. The copy button is revealed on thumb hover.
test('슬라이드 복제: 헤드라인까지 그대로 복사된 슬라이드가 추가됨', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Duplicate', slideCount: 1 })

  // Give slide 1 a headline so the copy is identifiable as a thumb label.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Dup me')

  const tray = slideTray(page)
  await expect(tray.getByRole('button', { name: 'Dup me' })).toHaveCount(1)

  // Hover the thumb to reveal the copy button, then click it.
  await tray.getByRole('button', { name: 'Dup me' }).first().hover()
  await tray.getByTitle('슬라이드 복제').first().click()

  // A second thumb now carries the same headline label.
  await expect(tray.getByRole('button', { name: 'Dup me' })).toHaveCount(2)
})
