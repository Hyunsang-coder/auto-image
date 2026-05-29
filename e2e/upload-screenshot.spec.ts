import { test, expect } from '@playwright/test'
import { clearAppState, createProject, uploadScreenshot } from './helpers'

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'Upload Test', slideCount: 1 })
})

test('실제 iPhone 스크린샷을 업로드하면 캔버스에 screenshot 레이어가 생김', async ({ page }) => {
  await uploadScreenshot(page, 'iphone_home.png')

  // Dropzone 사라지고 screenshot 레이어가 캔버스에 올라옴.
  await expect(page.getByText('클릭하여 이미지 업로드')).not.toBeVisible()
  await page.waitForFunction(() => {
    const editor = (
      window as unknown as {
        __editor?: { canvas: { getObjects(): { layerName?: string }[] } }
      }
    ).__editor
    return !!editor?.canvas.getObjects().some((o) => o.layerName === 'screenshot')
  })
})

test('스크린샷 업로드 후 ZIP 내보내기가 동작함', async ({ page }) => {
  await uploadScreenshot(page, 'iphone_home.png')
  await page.waitForFunction(() => {
    const editor = (
      window as unknown as {
        __editor?: { canvas: { getObjects(): { layerName?: string }[] } }
      }
    ).__editor
    return !!editor?.canvas.getObjects().some((o) => o.layerName === 'screenshot')
  })

  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  await page.getByRole('button', { name: /내보내기 →/ }).click()

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: /ZIP 내보내기/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
})
