import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

// The localize page exports a CSV/JSON translation template (source text + a
// column per target locale) and re-imports a filled file back into the grid.
test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Template IO', slideCount: 1 })

  // Give the slide a headline → one translatable text row in the grid.
  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('Track your day')

  await page.getByRole('button', { name: /로컬라이즈/ }).click()
})

test('CSV 양식을 내보내면 원본 텍스트와 로케일 열이 포함됨', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV 내보내기' }).click()
  const download = await downloadPromise
  const content = readFileSync(await download.path(), 'utf8')

  // Header carries the reserved columns + default target locales (en, ja).
  const header = content.replace(/^\uFEFF/, '').split(/\r?\n/)[0]
  expect(header).toBe('slide,slideId,field,source,en,ja')
  expect(content).toContain('Track your day')
})

test('채워진 CSV를 가져오면 해당 셀이 채워짐', async ({ page }) => {
  // slideId 빈칸 → 1-based slide 인덱스로 매칭. en 열만 채움.
  const csv = 'slide,slideId,field,source,en,ja\n1,,headline,Track your day,Track it,\n'
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

test('JSON 양식 왕복: 내보낸 파일을 그대로 채워 다시 가져옴', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON 내보내기' }).click()
  const download = await downloadPromise
  const parsed = JSON.parse(readFileSync(await download.path(), 'utf8'))

  const headline = parsed.rows.find((r: { field: string }) => r.field === 'headline')
  expect(headline.source).toBe('Track your day')

  headline.translations.en = 'Day tracker'
  await page.locator('input[accept=".csv,.json"]').setInputFiles({
    name: 'filled.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(parsed)),
  })

  await expect(page.getByText(/번역을 가져왔습니다/)).toBeVisible()
  const headlineRow = page.locator('tr', { has: page.getByText('Track your day') })
  await expect(headlineRow.locator('textarea').first()).toHaveValue('Day tracker')
})
