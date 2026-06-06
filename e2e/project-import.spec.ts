import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { clearAppState, slideThumbs } from './helpers'

// Project import on the setup page: one multi-file selection (manifest JSON +
// locale-suffixed screenshots + caption CSV) assembles a full project at the
// pre-export stage. The result modal shows the summary/warnings; committing
// lands in the editor (step 2) via a single loadProject.

const MANIFEST = JSON.stringify({
  version: 1,
  name: 'Imported App',
  device: 'iphone',
  sourceLocale: 'ko',
  targetLocales: ['en'],
  slides: [
    { textBlocks: 1 },
    { layout: 'text-bottom', textBlocks: 2 },
    { layout: 'hero' },
    { layout: 'split' },
  ],
})

const CSV = [
  'slide,slideId,field,ko,en',
  '1,,text:0,산책을 기록하세요,Track every walk',
  '2,,text:0,건강 리포트,Health reports',
  '2,,text:1,매일 자동 정리,Summarized daily',
].join('\n')

const importInput = 'input[accept=".json,.csv,image/*"]'

test('프로젝트 가져오기: manifest + 이미지 + CSV가 한 번에 프로젝트로 조립됨', async ({ page }) => {
  // Clear once (not via clearAppState's init script) — the reload at the end
  // must see the persisted project survive.
  await page.goto('/app/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const home = readFileSync(new URL('./fixtures/iphone_home.png', import.meta.url))
  const decks = readFileSync(new URL('./fixtures/iphone_decks.png', import.meta.url))

  await page.locator(importInput).setInputFiles([
    { name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(MANIFEST) },
    { name: 'screenshot-copy.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) },
    { name: '1.ko.png', mimeType: 'image/png', buffer: home },
    { name: '1.en.png', mimeType: 'image/png', buffer: decks },
    { name: '2.ko.png', mimeType: 'image/png', buffer: decks },
  ])

  // Result modal: 4 slides, 3 screenshots (base+override+base), 6 caption cells.
  await expect(
    page.getByText('슬라이드 4장 · 스크린샷 3개 · 캡션 6개 적용'),
  ).toBeVisible()
  await expect(page.getByText(/경고 \d+건 보기/)).not.toBeVisible()

  await page.getByRole('button', { name: '에디터에서 검수 →' }).click()

  // Lands in the editor with the imported captions as slide titles.
  await expect(slideThumbs(page)).toHaveCount(4)
  await expect(slideThumbs(page).first()).toHaveAccessibleName('산책을 기록하세요')
  await expect(slideThumbs(page).nth(1)).toHaveAccessibleName('건강 리포트')

  // The committed project survives a reload (zustand persist + IndexedDB blobs).
  await page.reload()
  await expect(slideThumbs(page)).toHaveCount(4)
})

test('프로젝트 가져오기: 없는 슬라이드의 이미지는 경고로 남고 나머지는 적용됨', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')

  const home = readFileSync(new URL('./fixtures/iphone_home.png', import.meta.url))
  const manifest = JSON.stringify({ version: 1, name: 'Warn App', slides: [{}] })

  await page.locator(importInput).setInputFiles([
    { name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(manifest) },
    { name: '1.ko.png', mimeType: 'image/png', buffer: home },
    { name: '9.ko.png', mimeType: 'image/png', buffer: home },
  ])

  await expect(
    page.getByText('슬라이드 1장 · 스크린샷 1개 · 캡션 0개 적용'),
  ).toBeVisible()
  await page.getByText(/경고 1건 보기/).click()
  await expect(page.getByText(/슬라이드 9/)).toBeVisible()

  await page.getByRole('button', { name: '에디터에서 검수 →' }).click()
  await expect(slideThumbs(page)).toHaveCount(1)
})

test('프로젝트 가져오기: 매니페스트가 없으면 실패 안내만 보여줌', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')

  await page.locator(importInput).setInputFiles([
    { name: 'copy.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) },
  ])

  await expect(page.getByText('가져올 수 없습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '에디터에서 검수 →' })).not.toBeVisible()
  await page.getByRole('button', { name: '닫기' }).click()
})
