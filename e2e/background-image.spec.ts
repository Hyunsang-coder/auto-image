import { test, expect } from '@playwright/test'
import { clearAppState, createProject, uploadBackgroundImage } from './helpers'

type CanvasObj = { layerName?: string; type?: string }

function hasBackgroundImage() {
  const editor = (
    window as unknown as {
      __editor?: { canvas: { getObjects(): CanvasObj[] } }
    }
  ).__editor
  return !!editor?.canvas
    .getObjects()
    .some((o) => o.layerName === 'background' && o.type === 'image')
}

test.beforeEach(async ({ page }) => {
  await clearAppState(page)
  await page.goto('/')
  await createProject(page, { name: 'BG Test', slideCount: 1 })
})

test('배경 이미지를 업로드하면 캔버스에 background 이미지 레이어가 생김', async ({ page }) => {
  await uploadBackgroundImage(page, 'iphone_home.png')
  await page.waitForFunction(hasBackgroundImage)
})

test('배경 이미지 업로드 후 ZIP 내보내기가 동작함', async ({ page }) => {
  await uploadBackgroundImage(page, 'iphone_home.png')
  await page.waitForFunction(hasBackgroundImage)

  await page.getByRole('button', { name: /로컬라이즈/ }).click()
  await page.getByRole('button', { name: /내보내기 →/ }).click()

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: /ZIP 내보내기/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
})
