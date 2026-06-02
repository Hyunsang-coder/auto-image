import { test, expect } from '@playwright/test'
import { createProject, uploadScreenshot } from './helpers'

function hasScreenshotOnCanvas(page: import('@playwright/test').Page) {
  return page.waitForFunction(() => {
    const editor = (
      window as unknown as {
        __editor?: { canvas: { getObjects(): { layerName?: string }[] } }
      }
    ).__editor
    return !!editor?.canvas.getObjects().some((o) => o.layerName === 'screenshot')
  })
}

// NOTE: we deliberately do NOT use clearAppState here. It installs an
// addInitScript that wipes localStorage on *every* document load — including
// the page.reload() these tests rely on. Instead we clear storage once up
// front so state written during the test survives the reload.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('헤드라인 편집이 새로고침 후에도 유지됨', async ({ page }) => {
  await createProject(page, { name: 'Persist Test', slideCount: 3 })

  await page.getByRole('button', { name: '텍스트', exact: true }).click()
  await page.locator('textarea').first().fill('유지되는 헤드라인')

  const slideList = page.locator('aside').first()
  await expect(slideList.getByText('유지되는 헤드라인')).toBeVisible()

  await page.reload()

  // step is persisted, so we land back in the editor and the slide list keeps
  // the edited headline.
  await expect(slideList.getByText('유지되는 헤드라인')).toBeVisible()
})

test('2-page span 그룹이 새로고침 후에도 유지됨', async ({ page }) => {
  await createProject(page, { name: 'Persist Span', slideCount: 3 })

  await page.getByRole('button', { name: /다음 슬라이드와 연결/ }).first().click()
  await expect(page.getByText('2-page span')).toBeVisible()

  await page.reload()

  await expect(page.getByText('2-page span')).toBeVisible()
})

test('업로드한 스크린샷이 새로고침 후에도 유지됨 (IndexedDB)', async ({ page }) => {
  await createProject(page, { name: 'Persist Shot', slideCount: 1 })

  await uploadScreenshot(page, 'iphone_decks.png')
  await hasScreenshotOnCanvas(page)

  await page.reload()

  // imageKey는 localStorage(project)에, 이미지 바이트는 IndexedDB에 — 둘 다 살아남아
  // 새로고침 후 캔버스에 스크린샷이 다시 그려져야 함.
  await hasScreenshotOnCanvas(page)
})

test('초기화 후 새로고침하면 프로젝트가 사라진 채 유지됨', async ({ page }) => {
  await createProject(page, { name: 'Persist Reset', slideCount: 2 })

  // Sanity: project survives a reload before reset.
  await page.reload()
  await expect(page.getByText('Persist Reset')).toBeVisible()

  await page.getByRole('button', { name: '초기화' }).click()
  await page.locator('.fixed').getByRole('button', { name: '초기화' }).click()

  await page.reload()

  // Back at Step 1 with no project — the setup form is shown and the header
  // reset button is gone.
  await expect(page.locator('input[placeholder="예: Dogo, Claude, ADHD"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '초기화' })).toHaveCount(0)
})
