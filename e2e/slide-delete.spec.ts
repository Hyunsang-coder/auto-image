import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

// Deleting a slide drops it from the list. The trash button is revealed on row
// hover; the store refuses to remove the last slide, so the button disables.
test('슬라이드 삭제: 행에서 삭제하면 목록에서 빠진다', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Delete', slideCount: 2 })

  // Give slide 1 a headline so it's identifiable in the list.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Delete me')

  const aside = page.locator('aside').first()
  await expect(aside.locator('ul > li')).toHaveCount(2)
  await expect(aside.getByText('Delete me')).toHaveCount(1)

  // Hover the row to reveal the trash button, then click it.
  const row = aside.getByRole('button', { name: /Delete me/ }).first()
  await row.hover()
  await aside.getByTitle('슬라이드 삭제').first().click()

  // A confirm popup asks again before deleting — confirm it.
  await page.getByRole('button', { name: '삭제', exact: true }).click()

  // The slide is gone — one row left, no 'Delete me'.
  await expect(aside.locator('ul > li')).toHaveCount(1)
  await expect(aside.getByText('Delete me')).toHaveCount(0)

  // The last remaining slide can't be deleted — its trash button is disabled.
  await aside.locator('ul > li').first().hover()
  await expect(aside.getByTitle('마지막 슬라이드는 삭제할 수 없습니다')).toBeDisabled()
})
