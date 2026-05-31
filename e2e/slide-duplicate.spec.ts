import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

// Duplicating a single slide inserts a standalone copy right after it, carrying
// the same headline. The copy button is revealed on row hover.
test('슬라이드 복제: 헤드라인까지 그대로 복사된 슬라이드가 추가됨', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Duplicate', slideCount: 1 })

  // Give slide 1 a headline so the copy is identifiable in the list.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Dup me')

  const aside = page.locator('aside').first()
  await expect(aside.getByText('Dup me')).toHaveCount(1)

  // Hover the row to reveal the copy button, then click it.
  const row = aside.getByRole('button', { name: /Dup me/ }).first()
  await row.hover()
  await aside.getByTitle('슬라이드 복제').first().click()

  // A second row now carries the same headline.
  await expect(aside.getByText('Dup me')).toHaveCount(2)
})
