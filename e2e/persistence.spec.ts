import { test, expect } from '@playwright/test'
import { createProject, slideTray, uploadScreenshot } from './helpers'

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

  // The tray renders the headline as the thumb's accessible name (aria-label).
  const headlineThumb = slideTray(page).getByRole('button', { name: '유지되는 헤드라인' })
  await expect(headlineThumb).toBeVisible()

  await page.reload()

  // step is persisted, so we land back in the editor and the tray thumb keeps
  // the edited headline.
  await expect(headlineThumb).toBeVisible()
})

test('2-page span 그룹이 새로고침 후에도 유지됨', async ({ page }) => {
  await createProject(page, { name: 'Persist Span', slideCount: 3 })

  await page.getByTitle('옆 슬라이드와 한 장으로 묶기').first().click()
  // The span group container carries a "🔗 2-page span" title.
  await expect(page.getByTitle('🔗 2-page span')).toBeVisible()

  await page.reload()

  await expect(page.getByTitle('🔗 2-page span')).toBeVisible()
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

test('새 프로젝트로 저장 — 원본 항목은 그대로, 사본이 별도 항목으로 추가됨', async ({ page }) => {
  await createProject(page, { name: 'Save Test', slideCount: 1 })
  const modal = page.locator('.fixed')

  // First save: not in the library yet → single 저장 action, no save-as choice.
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(modal.getByRole('button', { name: '새 프로젝트로 저장' })).toHaveCount(0)
  await modal.getByRole('button', { name: '저장', exact: true }).click()

  // Second save: entry exists → 덮어쓰기 / 새 프로젝트로 저장 choice.
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await modal.locator('input').fill('Save Test Copy')
  await modal.getByRole('button', { name: '새 프로젝트로 저장' }).click()

  const library = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('auto-image:library')!).state.projects as {
        id: string
        name: string
      }[],
  )
  expect(library.map((p) => p.name).sort()).toEqual(['Save Test', 'Save Test Copy'])
  expect(new Set(library.map((p) => p.id)).size).toBe(2)

  // The active project became the copy — overwriting now updates the copy only.
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await modal.locator('input').fill('Copy Renamed')
  await modal.getByRole('button', { name: '덮어쓰기' }).click()
  const after = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('auto-image:library')!).state.projects as {
        name: string
      }[],
  )
  expect(after.map((p) => p.name).sort()).toEqual(['Copy Renamed', 'Save Test'])
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
