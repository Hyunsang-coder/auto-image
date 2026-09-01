import { fileURLToPath } from 'node:url'
import { expect, type Locator, type Page } from '@playwright/test'

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

/**
 * The window.__editor inspection surface FabricCanvas exposes for tests, plus
 * the Fabric-object subset the specs poke at.
 */
export type FabObj = {
  left?: number
  top?: number
  width?: number
  height?: number
  angle?: number
  setCoords(): void
  getCenterPoint(): { x: number; y: number }
  oCoords?: Record<string, { x: number; y: number }>
  _crop?: { top: number; right: number; bottom: number; left: number }
}
export type EditorSurface = {
  canvas: { setActiveObject(o: unknown): void; renderAll(): void }
  findByLayer(n: string): FabObj | null
}

export function findLayer(page: Page, layer: string) {
  return page.evaluate((l) => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor
    return ed?.findByLayer(l) != null
  }, layer)
}

/** Wait for the layer to exist, then make it the active (selected) object. */
export async function selectLayer(page: Page, layer: string) {
  await expect.poll(() => findLayer(page, layer)).toBe(true)
  await page.evaluate((l) => {
    const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
    const obj = ed.findByLayer(l)!
    ed.canvas.setActiveObject(obj)
    obj.setCoords()
    ed.canvas.renderAll()
  }, layer)
}

/** Page coords of a Fabric control point (e.g. 'mtr', 'cropT') on a layer's object. */
export async function controlPos(page: Page, layer: string, name: string): Promise<{ x: number; y: number }> {
  const local = await page.evaluate(
    ([l, n]) => {
      const ed = (window as unknown as { __editor?: EditorSurface }).__editor!
      const obj = ed.findByLayer(l)!
      obj.setCoords()
      const c = obj.oCoords![n]
      return { x: c.x, y: c.y }
    },
    [layer, name] as [string, string],
  )
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  return { x: box.x + local.x, y: box.y + local.y }
}

/** Real pointer drag in small steps so per-tick canvas handlers fire. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6)
  }
  await page.mouse.up()
}

/**
 * The bottom slide tray (a horizontal <nav>). The slide list moved out of the
 * left <aside> into this tray; each thumb is a draggable <button> whose
 * accessible name is the slide's headline (falling back to "슬라이드 N"). The
 * trailing "+" button (슬라이드 추가) adds a slide.
 *
 * StepIndicator is also a <nav>, so scope to the one holding slide thumbs
 * (aria-labelled buttons) — only the tray has those.
 */
export function slideTray(page: Page): Locator {
  return page.locator('nav:has(button[aria-label])')
}

/** Slide thumbnail buttons in the tray, in visual order. */
export function slideThumbs(page: Page): Locator {
  // Thumb buttons carry an aria-label (the title); the add/dup/delete/link
  // buttons don't, so filtering by [aria-label] isolates the slides.
  return slideTray(page).locator('button[aria-label]')
}

/**
 * Upload a screenshot fixture into the active slide via the (hidden) file
 * input in ScreenshotPanel. Opens the 스크린샷 tab first so the input is mounted.
 * `name` is a file under e2e/fixtures (e.g. 'iphone_home.png').
 */
export async function uploadScreenshot(page: Page, name: string) {
  await openSection(page, '디바이스')
  // The 스크린샷 tab mounts two file inputs: the single-shot one and a `multiple`
  // bulk-import one. Target the single-shot input explicitly.
  await page
    .locator('input[type="file"]:not([multiple])')
    .setInputFiles(`${fixturesDir}/${name}`)
}

export async function showDeviceFrame(page: Page) {
  await openSection(page, '디바이스')
  await page.getByRole('checkbox', { name: '기기 프레임 표시' }).check()
  await expect.poll(() => findLayer(page, 'device-frame')).toBe(true)
}

/**
 * Draw the canvas 1:1. The board fits the whole slide set on screen by default,
 * so any assertion in canvas pixels (element width, drag deltas) has to opt out
 * of the fit first or it measures a scaled canvas.
 */
export async function zoomTo100(page: Page) {
  await page.keyboard.press('ControlOrMeta+0')
  await expect(page.getByRole('button', { name: '100%', exact: true })).toBeVisible()
}

/**
 * Open an inspector section from the layer panel's add menu. The panel itself
 * is selection-driven now, so this is how a test reaches a section whose layer
 * has no instance yet (you cannot select a badge you have not added).
 */
export async function openSection(page: Page, label: string) {
  await page.getByRole('button', { name: '요소 추가', exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

/**
 * Upload a background image fixture via the 배경 → 이미지 section's file input.
 */
export async function uploadBackgroundImage(page: Page, name: string) {
  await openSection(page, '배경')
  // The properties panel also has an '이미지' (external images) tab — the
  // background panel's fill-type tab is the later one in the DOM.
  await page.getByRole('button', { name: '이미지', exact: true }).last().click()
  await page.locator('input[type="file"]').setInputFiles(`${fixturesDir}/${name}`)
}

export async function clearAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('auto-image:project')
    localStorage.removeItem('auto-image:api-keys')
  })
}

/**
 * The home screen asks nothing: one click makes a project and lands on the
 * editor. Name and slide count are set afterwards where the app puts them —
 * the header's name field and the slide tray's + button.
 */
export async function createProject(
  page: Page,
  options: { name?: string; slideCount?: number } = {},
) {
  const { name = 'Test App', slideCount = 1 } = options

  await page.getByRole('button', { name: '새 프로젝트' }).click()

  const nameField = page.getByLabel('프로젝트 이름')
  await nameField.waitFor()
  await nameField.fill(name)

  // A new project starts with one slide.
  for (let i = 1; i < slideCount; i++) {
    await page.getByTitle('슬라이드 추가').click()
  }
  // addSlide selects what it just added; specs expect to start on slide 1.
  if (slideCount > 1) await slideThumbs(page).first().click()
}

/**
 * Secondary header actions (템플릿으로 저장 / 프로젝트 파일 저장 / 초기화) live in
 * the toolbar's More menu, so a spec has to open it before clicking one.
 */
export async function openMoreMenu(page: Page) {
  await page.getByRole('button', { name: '더 보기' }).click()
}
