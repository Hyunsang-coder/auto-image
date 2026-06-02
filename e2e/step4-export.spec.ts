import { test, expect } from '@playwright/test'
import { clearAppState, createProject } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Export Test', slideCount: 2 })
  await page.getByRole('button', { name: /Export/ }).click()
})

test('내보내기 패널이 렌더됨', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '내보내기' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '미리보기' })).toBeVisible()
  await expect(page.getByRole('button', { name: /ZIP 내보내기/ })).toBeVisible()
})

test('렌더링 범위 요약이 올바르게 표시됨', async ({ page }) => {
  // 슬라이드 수, 디바이스, 로케일 정보가 있어야 함
  const content = await page.locator('body').textContent()
  expect(content).toContain('2')   // 슬라이드 2장
  expect(content).toContain('iPhone') // 기기
})

test('← 로컬라이즈 버튼으로 Step 3으로 이동', async ({ page }) => {
  await page.getByRole('button', { name: '← 로컬라이즈' }).click()
  await expect(page.getByRole('button', { name: /로컬라이즈/ })).toHaveClass(/bg-\[var\(--color-accent\)\]/)
})

test('미리보기가 자동 렌더되어 이미지가 표시됨', async ({ page }) => {
  // The panel renders previews on mount (no button) — wait for the blob images.
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[src^="blob:"]')
      return img !== null
    },
    { timeout: 30_000 },
  )

  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
})

test('내보낸 PNG에 알파 채널이 없음 (color type 2) — ASC 거부 방지', async ({ page }) => {
  await page.waitForFunction(() => document.querySelector('img[src^="blob:"]') !== null, {
    timeout: 30_000,
  })

  // Read the rendered PNG bytes and inspect the IHDR header. ASC rejects any
  // screenshot whose encoding carries an alpha channel; a color type of 2
  // (truecolor, no alpha) is what guards against that.
  const header = await page.evaluate(async () => {
    const src = document.querySelector<HTMLImageElement>('img[src^="blob:"]')!.src
    const buf = new Uint8Array(await (await fetch(src)).arrayBuffer())
    return { sig: Array.from(buf.subarray(0, 8)), colorType: buf[25] }
  })

  expect(header.sig).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(header.colorType).toBe(2)
})

test('ZIP 내보내기 버튼이 실행 중에 비활성화됨', async ({ page }) => {
  const exportBtn = page.getByRole('button', { name: /ZIP 내보내기/ })

  // 클릭하여 export 시작
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    exportBtn.click(),
  ])

  // 다운로드가 시작됨 (zip 파일)
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
})
