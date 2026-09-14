import { test, expect } from '@playwright/test'

// The MPA split: a static Korean landing at /, its English twin at /en/, and the
// React app at /app/. These lock the wiring — a Vite input change or a moved
// entry breaks here first. The suite runs as ko-KR, so a Korean browser is the
// default case below.

const RELEASES = 'https://github.com/Hyunsang-coder/auto-image/releases/latest'

test('한국어 랜딩이 루트에서 렌더되고 영어 랜딩으로 이어짐', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('스크린샷')
  await expect(page.getByRole('link', { name: 'Mac용 무료 다운로드' }).first()).toHaveAttribute(
    'href',
    RELEASES,
  )
  await expect(page.locator('header a[hreflang="en"]').first()).toHaveAttribute('href', '/en/')
})

// The site hands out the Mac app instead of the hosted studio, so a surviving
// /app/ link would be a regression, not a shortcut.
test('한국어 랜딩에 웹 스튜디오로 가는 링크가 없음', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('a[href^="app/"], a[href^="/app/"]')).toHaveCount(0)
})

test('한국어 브라우저는 영어 페이지에서 한국어 페이지로 감', async ({ page }) => {
  await page.goto('/guides/how-to-use.html')
  await expect(page).toHaveURL(/\/guides\/ko\/how-to-use\.html$/)
})

test('언어 메뉴에서 고른 언어가 브라우저 언어보다 우선함', async ({ page }) => {
  await page.goto('/')
  await page.locator('header .lang-menu summary').click()
  await page.locator('header .lang-menu__list a[hreflang="en"]').click()
  await expect(page).toHaveURL(/\/en\/$/)
  await page.reload()
  await expect(page).toHaveURL(/\/en\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('App Store screenshots')
})

test.describe('영어 브라우저', () => {
  test.use({ locale: 'en-US' })

  test('영어 랜딩이 /en/에서 렌더됨', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('App Store screenshots')
    await expect(page.getByRole('link', { name: 'Download for Mac' }).first()).toHaveAttribute(
      'href',
      RELEASES,
    )
    await expect(page.locator('header a[hreflang="ko"]').first()).toHaveAttribute('href', '/')
    await expect(page.locator('a[href^="app/"], a[href^="/app/"]')).toHaveCount(0)
  })

  test('루트로 오면 /en/으로 보냄', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/en\/$/)
  })
})

test.describe('한국어도 영어도 아닌 브라우저', () => {
  test.use({ locale: 'ja-JP' })

  test('영어 페이지로 보냄', async ({ page }) => {
    await page.goto('/guides/ko/how-to-use.html')
    await expect(page).toHaveURL(/\/guides\/how-to-use\.html$/)
  })
})

test('에디터가 /app/에서 그대로 서빙됨', async ({ page }) => {
  await page.goto('/app/')
  await expect(page.getByText('프로젝트 열기').first()).toBeVisible()
})
