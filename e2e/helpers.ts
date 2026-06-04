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
  await page.getByRole('button', { name: '디바이스' }).click()
  // The 스크린샷 tab mounts two file inputs: the single-shot one and a `multiple`
  // bulk-import one. Target the single-shot input explicitly.
  await page
    .locator('input[type="file"]:not([multiple])')
    .setInputFiles(`${fixturesDir}/${name}`)
}

/**
 * Upload a background image fixture via the 배경 → 이미지 tab's file input.
 */
export async function uploadBackgroundImage(page: Page, name: string) {
  await page.getByRole('button', { name: '배경', exact: true }).click()
  await page.getByRole('button', { name: '이미지', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(`${fixturesDir}/${name}`)
}

export async function clearAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('auto-image:project')
    localStorage.removeItem('auto-image:api-keys')
  })
}

export async function createProject(
  page: Page,
  options: { name?: string; devices?: ('iphone' | 'ipad')[]; slideCount?: number } = {},
) {
  const { name = 'Test App', devices = ['iphone'], slideCount } = options

  await page.fill('input[placeholder="예: Dogo, Claude, ADHD"]', name)

  // Device type cards are clickable divs (not buttons). The title span uses
  // font-medium; go up one level (xpath=..) to get the card div which carries
  // the active border class.
  const deviceCard = (label: string) =>
    page.locator('span[class*="font-medium"]', { hasText: new RegExp(`^${label}$`) }).locator('xpath=..')

  const iPhoneCard = deviceCard('iPhone')
  const iPadCard = deviceCard('iPad')

  const iPhoneActive = await iPhoneCard.evaluate((el) =>
    el.className.includes('border-[var(--color-accent)]'),
  )
  const iPadActive = await iPadCard.evaluate((el) =>
    el.className.includes('border-[var(--color-accent)]'),
  )

  if (iPhoneActive && !devices.includes('iphone')) await iPhoneCard.click()
  if (!iPhoneActive && devices.includes('iphone')) await iPhoneCard.click()
  if (iPadActive && !devices.includes('ipad')) await iPadCard.click()
  if (!iPadActive && devices.includes('ipad')) await iPadCard.click()

  if (slideCount !== undefined) {
    const input = page.locator('input[type="number"]')
    await input.fill(String(slideCount))
  }

  await page.getByRole('button', { name: '다음 →' }).click()
}
