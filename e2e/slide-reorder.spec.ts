import { test, expect } from '@playwright/test'
import {
  clearAppState,
  createProject,
  findLayer,
  openSection,
  slideThumbs,
  slideTray,
  uploadScreenshot,
} from './helpers'

async function headline(page: Parameters<typeof slideThumbs>[0], index: number, text: string) {
  await slideThumbs(page).nth(index).click()
  await openSection(page, '텍스트')
  await page.locator('textarea').first().fill(text)
}

async function thumbNames(page: Parameters<typeof slideThumbs>[0]): Promise<(string | null)[]> {
  return slideThumbs(page).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
}

// Arrow buttons move a slide without any pointer drag (the DnD fallback).
test('슬라이드 순서: 화살표 버튼으로 앞·뒤 이동', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Reorder', slideCount: 3 })
  await headline(page, 0, 'Slide A')
  await headline(page, 1, 'Slide B')
  await headline(page, 2, 'Slide C')
  await expect.poll(() => thumbNames(page)).toEqual(['Slide A', 'Slide B', 'Slide C'])

  const tray = slideTray(page)
  await slideThumbs(page).nth(0).click()
  await slideThumbs(page).nth(0).hover()
  await tray.getByTitle('뒤로 이동').first().click()
  await expect.poll(() => thumbNames(page)).toEqual(['Slide B', 'Slide A', 'Slide C'])

  await slideThumbs(page).nth(2).hover()
  await tray.getByTitle('앞으로 이동').last().click()
  await expect.poll(() => thumbNames(page)).toEqual(['Slide B', 'Slide C', 'Slide A'])
})

// The highlight panel's grab buttons select the canvas object for direct
// drag/resize, and the nudge pad moves the source region without sliders.
test('하이라이트: 패널에서 원본 영역 선택·미세 이동', async ({ page }) => {
  await clearAppState(page)
  await page.goto('/app/')
  await createProject(page, { name: 'Highlight Panel' })
  await uploadScreenshot(page, 'iphone_home.png')
  await openSection(page, '하이라이트')
  await page.getByRole('button', { name: '+ 추가' }).click()
  // The canvas re-renders async after the store update — wait for the object.
  await expect.poll(() => findLayer(page, 'highlight-source')).toBe(true)
  await expect(page.getByRole('button', { name: '원본 영역 선택' })).toBeVisible()

  await page.getByRole('button', { name: '원본 영역 선택' }).click()
  await expect(page.getByText('선택됨')).toBeVisible()

  const xBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('auto-image:project')
    return JSON.parse(raw!).state.project.slides[0].highlights[0].sourceRegion.x
  })
  await page.getByRole('button', { name: '오른쪽으로 이동' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('auto-image:project')
        return JSON.parse(raw!).state.project.slides[0].highlights[0].sourceRegion.x
      }),
    )
    .toBeGreaterThan(xBefore)
})
