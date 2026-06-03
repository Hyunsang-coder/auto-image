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

// 캔버스(956px)가 기본 뷰포트(720px)보다 길어 기기 영역이 하단 슬라이드
// 트레이에 가려진다 — 드래그 좌표가 트레이가 아닌 캔버스에 닿도록 키운다.
test.use({ viewport: { width: 1280, height: 1200 } })

test('프레임 숨김(플로팅) 모드에서도 기기를 드래그로 옮길 수 있음', async ({ page }) => {
  type Ed = {
    getState: () => { width: number; objects: { layerName?: string; left: number; top: number; width: number; height: number }[] }
  }
  const deviceBody = () =>
    page.evaluate(() => {
      const o = (window as unknown as { __editor: Ed }).__editor
        .getState()
        .objects.find((x) => x.layerName === 'device-frame')
      return o ? { left: o.left, top: o.top, width: o.width, height: o.height } : null
    })

  await uploadScreenshot(page, 'iphone_home.png')

  // 렌더링 모드에서 기기 프레임 끔 → 플로팅 스크린샷 + 보이지 않는 드래그 핸들.
  await page.getByLabel('기기 프레임 표시').uncheck()
  await page.waitForFunction(() => {
    const objs = (window as unknown as { __editor: Ed }).__editor.getState().objects
    // 프레임 path들이 사라지고 핸들 rect 하나만 남으면 플로팅 재렌더 완료.
    return objs.filter((o) => o.layerName === 'device-frame').length === 1
  })

  const before = (await deviceBody())!
  const box = (await page.locator('canvas').last().boundingBox())!
  const st = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.getState())
  const scale = box.width / st.width

  // 핸들(=기기 풋프린트) 상단부를 잡고 오른쪽으로 50px 드래그. (기기 중앙은
  // 기본 뷰포트(720px) 아래라 마우스 이벤트가 닿지 않는다.)
  const cx = box.x + (before.left + before.width / 2) * scale
  const cy = box.y + (before.top + before.height * 0.15) * scale
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 50, cy, { steps: 5 })
  await page.mouse.up()

  await page.waitForFunction((l) => {
    // The post-drag sync re-renders the canvas; mid-render the handle is
    // momentarily absent, so the predicate must tolerate undefined.
    const o = (window as unknown as { __editor: Ed }).__editor
      .getState()
      .objects.find((x) => x.layerName === 'device-frame')
    return !!o && o.left > l + 20
  }, before.left)
  const after = (await deviceBody())!
  expect(after.left).toBeGreaterThan(before.left + 20)
})
