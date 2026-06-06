import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

// The localize page exports a CSV/JSON translation template (one labeled column
// per language, including the source locale) and re-imports a filled file. The
// source-locale column routes to the slide's base text; the rest to translations
// — so which column is "base" follows the app's 원본 언어 setting, no regen needed.
test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  // Default project source locale is ko, target locales en + ja.
  await createProject(page, { name: 'Template IO', slideCount: 1 })

  // Give the slide a headline → one translatable text row in the grid.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Track your day')

  await page.getByRole('button', { name: /로컬라이즈/ }).click()
})

test('CSV 양식은 모든 언어를 열로 내보낸다 (원본 열 = 베이스 텍스트)', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV 내보내기' }).click()
  const download = await downloadPromise
  const content = readFileSync(await download.path(), 'utf8')

  // Header: id columns + source locale (ko) + targets (en, ja). No `source` column.
  const header = content.replace(/^\uFEFF/, '').split(/\r?\n/)[0]
  expect(header).toBe('slide,slideId,field,ko,en,ja')
  // The source-locale (ko) column carries the base headline text.
  expect(content).toContain('Track your day')
})

test('타깃 언어 열을 가져오면 해당 셀이 채워짐', async ({ page }) => {
  // slideId 빈칸 → 1-based slide 인덱스로 매칭. 원본(ko) 열은 베이스, en 열은 번역.
  const csv = 'slide,slideId,field,ko,en,ja\n1,,headline,Track your day,Track it,\n'
  await page.locator('input[accept=".csv,.json"]').setInputFiles({
    name: 'filled.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })

  await expect(page.getByText(/번역을 가져왔습니다/)).toBeVisible()

  // The headline row's first target cell (en) now holds the imported value.
  const headlineRow = page.locator('tr', { has: page.getByText('Track your day') })
  await expect(headlineRow.locator('textarea').first()).toHaveValue('Track it')
})

test('원본 언어 열은 베이스 텍스트로, 원본 언어를 바꾸면 베이스가 바뀐다', async ({ page }) => {
  // All-language file. With source=ko, the ko column becomes the slide's base text.
  const csv =
    'slide,slideId,field,ko,en,ja\n1,,headline,한국어 헤드라인,English headline,日本語 견출\n'
  const setFile = () =>
    page.locator('input[accept=".csv,.json"]').setInputFiles({
      name: 'all.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })

  await setFile()
  await expect(page.getByText(/번역을 가져왔습니다/)).toBeVisible()

  // Base text (source/원본 column, read-only) now shows the ko value; targets filled.
  // Field label is "텍스트" (single text block).
  const headlineRow = page.locator('tr', { has: page.getByText('텍스트', { exact: true }) })
  await expect(headlineRow).toContainText('한국어 헤드라인')
  await expect(headlineRow.locator('textarea').first()).toHaveValue('English headline') // en is first target

  // Flip the source language to en, re-import the SAME file. Now the en column is base.
  await page.locator('select[class*="rounded"]').first().selectOption('en')
  await setFile()
  await expect(page.getByText(/번역을 가져왔습니다/)).toBeVisible()

  const headlineRow2 = page.locator('tr', { has: page.getByText('텍스트', { exact: true }) })
  await expect(headlineRow2).toContainText('English headline')
})

test('JSON 양식 왕복: texts 맵을 채워 다시 가져옴', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 내보내기' }).click()
  const download = await downloadPromise
  const parsed = JSON.parse(readFileSync(await download.path(), 'utf8'))

  // texts carries every language; the source locale (ko) holds the base text.
  const headline = parsed.rows.find((r: { field: string }) => r.field === 'text:0')
  expect(headline.texts.ko).toBe('Track your day')

  headline.texts.en = 'Day tracker'
  await page.locator('input[accept=".csv,.json"]').setInputFiles({
    name: 'filled.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(parsed)),
  })

  await expect(page.getByText(/번역을 가져왔습니다/)).toBeVisible()
  const headlineRow = page.locator('tr', { has: page.getByText('Track your day') })
  await expect(headlineRow.locator('textarea').first()).toHaveValue('Day tracker')
})
