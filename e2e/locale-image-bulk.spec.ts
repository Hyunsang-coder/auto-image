import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

// Bulk image import on the Localize page: every file carries a locale suffix.
// The file whose locale matches project.sourceLocale (ko) -> slide base; the
// rest -> per-locale overrides. So "1.ko.png" -> slide 1 base, "1.ja.png" ->
// slide 1 ja override (base sorted first so the override attaches in-batch).
test('이미지 일괄 가져오기: 베이스 + 언어별 override를 파일명으로 배치', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Bulk Image', slideCount: 1 })
  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  const home = readFileSync(new URL('./fixtures/iphone_home.png', import.meta.url))
  const decks = readFileSync(new URL('./fixtures/iphone_decks.png', import.meta.url))

  // Descriptive names: leading digits = slide index, trailing .<locale> required.
  await page.locator('input[accept="image/*"][multiple]').setInputFiles([
    { name: '01-home.ko.png', mimeType: 'image/png', buffer: home },
    { name: '01-home.ja.png', mimeType: 'image/png', buffer: decks },
  ])

  await expect(page.getByText(/이미지를 가져왔습니다/)).toBeVisible()

  // The base screenshot now exists → the 이미지 row appears, with the base
  // thumbnail (source column) plus the ja override thumbnail = two images.
  const imageRow = page.locator('tr', { has: page.getByText('이미지', { exact: true }) })
  await expect(imageRow).toHaveCount(1)
  await expect(imageRow.locator('img')).toHaveCount(2)
})

test('이미지 일괄 가져오기: 기기 불일치는 덮어쓰지 않고 건너뜀', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Device Guard', slideCount: 1 })
  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  const iphone = readFileSync(new URL('./fixtures/iphone_home.png', import.meta.url))
  const ipad = readFileSync(new URL('./fixtures/span_ipad.png', import.meta.url))

  // First import sets slide 1 to an iPhone screenshot (ko = source = base).
  await page.locator('input[accept="image/*"][multiple]').setInputFiles([
    { name: '1.ko.png', mimeType: 'image/png', buffer: iphone },
  ])
  await expect(page.getByText(/이미지를 가져왔습니다/)).toBeVisible()

  // An iPad-aspect image for the same slide must be skipped, not silently swapped.
  await page.locator('input[accept="image/*"][multiple]').setInputFiles([
    { name: '1.ko.png', mimeType: 'image/png', buffer: ipad },
  ])
  // The per-file "건너뜀" detail now lives inside a collapsed <details>; the
  // always-visible summary surfaces the warning count ("경고 N건 (아래 목록 확인)").
  await expect(page.getByText(/아래 목록 확인/)).toBeVisible()
})

test('이미지 일괄 가져오기: 알 수 없는 파일명은 경고로 건너뜀', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Bulk Image Warn', slideCount: 1 })
  await page.getByRole('button', { name: /로컬라이즈/ }).click()

  const home = readFileSync(new URL('./fixtures/iphone_home.png', import.meta.url))
  await page.locator('input[accept="image/*"][multiple]').setInputFiles([
    { name: 'cover.png', mimeType: 'image/png', buffer: home },
  ])

  // "경고" appears both in the summary <p> and the <details> toggle, so match the
  // always-visible summary line ("…경고 N건 (아래 목록 확인)") specifically.
  await expect(page.getByText(/아래 목록 확인/)).toBeVisible()
})
