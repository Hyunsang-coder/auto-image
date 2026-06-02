import { test, expect } from '@playwright/test'

// Real-behavior check: drive the actual export render pipeline (Fabric + canvas
// + toBlob) inside a real Chromium page via the Vite-served modules, and prove
// the per-locale screenshot override swaps the rendered image — a locale WITH an
// override renders a different PNG than the base, while a locale WITHOUT one
// renders byte-identical to the base (fallback). Avoids fragile UI clicking.
test('per-locale screenshot override swaps the rendered image; absent locale falls back', async ({
  page,
}) => {
  await page.goto('/')

  const measure = () =>
    page.evaluate(async () => {
    const imageStore = await import('/src/lib/imageStore.ts')
    const { makeProject } = await import('/src/constants/defaults.ts')
    const { renderSlide } = await import('/src/lib/renderSlide.ts')

    const solidPng = (r: number, g: number, b: number): Promise<Blob> => {
      const c = document.createElement('canvas')
      c.width = 60
      c.height = 130
      const ctx = c.getContext('2d')!
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(0, 0, 60, 130)
      return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
    }

    const baseKey = await imageStore.saveImage(await solidPng(220, 40, 40)) // red
    const jaKey = await imageStore.saveImage(await solidPng(40, 80, 220)) // blue

    const proj = makeProject({
      name: 'V',
      devices: ['iphone'],
      screenshotCount: 1,
      themeBackground: { type: 'solid', color: '#102030' },
    })
    const slide = proj.slides[0]
    slide.screenshot = {
      id: 'shot',
      imageKey: baseKey,
      originalWidth: 60,
      originalHeight: 130,
      localeOverrides: {
        ja: { imageKey: jaKey, originalWidth: 60, originalHeight: 130 },
      },
    }
    slide.headline = { ...slide.headline, text: 'Hi', translations: { ja: 'Hi' } }

    // Decode a rendered PNG and read the center pixel's RGB — that's inside the
    // device/screenshot area, so it reflects which screenshot got composited.
    const centerColor = async (blob: Blob): Promise<{ r: number; g: number; b: number }> => {
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      const [r, g, b] = ctx.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2), 1, 1).data
      return { r, g, b }
    }

    const base = await centerColor(await renderSlide(slide, 'iphone', null))
    const ja = await centerColor(await renderSlide(slide, 'iphone', 'ja'))
    const en = await centerColor(await renderSlide(slide, 'iphone', 'en')) // no override → fallback
    return { base, ja, en }
    })

  // The first dynamic import of fabric/idb-keyval makes Vite pre-bundle deps and
  // full-reload the page (sometimes more than once), which destroys the evaluate
  // context. Retry until it lands in a stable context — IndexedDB survives the
  // reloads, so re-running the measurement is harmless.
  let result: Awaited<ReturnType<typeof measure>> | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await measure()
      break
    } catch (e) {
      if (!/context was destroyed|Execution context/.test(String(e))) throw e
      await page.waitForLoadState('load')
    }
  }
  if (!result) throw new Error('render measurement never ran in a stable context')

  // Base screenshot is red → center pixel is red-dominant.
  expect(result.base.r).toBeGreaterThan(result.base.b)
  // The 'ja' override is blue → center pixel flips to blue-dominant.
  expect(result.ja.b).toBeGreaterThan(result.ja.r)
  // A locale with no override falls back to the base (red).
  expect(result.en.r).toBeGreaterThan(result.en.b)
})
