import { test, expect, type Locator } from '@playwright/test'
import { createProject } from './helpers'

// React maps onChange on a range input to the native 'input' event, so set the
// value through the prototype setter and dispatch 'input' to drive the store.
async function setSlider(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((el: HTMLInputElement, v: number) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    setter.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

function deviceAngle(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as { __editor?: { findByLayer(n: string): { angle?: number } | null } }).__editor
    return ed?.findByLayer('device-frame')?.angle ?? null
  })
}

test.describe('Device rotation', () => {
  test('tilting the device rotates the frame on canvas', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await createProject(page, { name: 'Rotate Test' })
    await page.getByRole('button', { name: '스크린샷' }).click()
    // With the frame shown (default) the screenshot tab has a single range
    // input: 기기 회전.
    await setSlider(page.getByRole('slider'), 15)
    await expect.poll(() => deviceAngle(page)).toBe(15)
    await page.evaluate(() => localStorage.clear())
  })

  test('rotation survives a full reload', async ({ page }) => {
    await page.goto('/')
    // Clear once up front — NOT clearAppState's addInitScript, which re-wipes
    // on every reload and would defeat this test.
    await page.evaluate(() => localStorage.clear())
    await createProject(page, { name: 'Rotate Test' })
    await page.getByRole('button', { name: '스크린샷' }).click()
    await setSlider(page.getByRole('slider'), -20)
    await expect.poll(() => deviceAngle(page)).toBe(-20)

    await page.reload()
    await page.getByRole('button', { name: '스크린샷' }).click()
    await expect(page.getByRole('slider')).toHaveValue('-20')
    await expect.poll(() => deviceAngle(page)).toBe(-20)
    await page.evaluate(() => localStorage.clear())
  })
})
