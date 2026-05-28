import { Canvas, FabricImage, Rect } from 'fabric'
import type { Slide, ScreenshotImage } from '../types/project'
import { EDITOR_CANVAS_WIDTH, DEVICE_SPECS, deviceSpecOf } from '../constants/deviceSpecs'
import { renderBackground } from './objects/background'
import { renderBadge } from './objects/badge'
import { renderCaption } from './objects/caption'
import { renderDeviceFrame } from './objects/deviceFrame'
import { LAYER_NAMES } from './layerNames'
import { loadImageObjectUrl } from '../lib/imageStore'

function getCanvasHeight(): number {
  // Use iphone as default aspect ratio
  const spec = deviceSpecOf('iphone')
  return Math.round(
    (EDITOR_CANVAS_WIDTH / spec.exportWidth) * spec.exportHeight,
  )
}

function getDeviceDimensions(slide: Slide, canvasWidth: number): { w: number; h: number } {
  const spec = deviceSpecOf(slide.deviceFrame.model === 'ipad-pro-13' ? 'ipad' : 'iphone')
  const w = canvasWidth * 0.6
  const h = Math.round((w / spec.exportWidth) * spec.exportHeight)
  return { w, h }
}

type FrameBounds = { left: number; top: number; w: number; h: number }

function getFrameBounds(
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
): FrameBounds | null {
  if (slide.template === 'hero') {
    return { left: 0, top: 0, w: cw, h: ch }
  }
  if (!slide.deviceFrame.show) return null
  if (slide.template === 'text-top') {
    return { left: cw / 2 - device.w / 2, top: ch * 0.32, w: device.w, h: device.h }
  }
  if (slide.template === 'text-bottom') {
    return { left: cw / 2 - device.w / 2, top: ch * 0.03, w: device.w, h: device.h }
  }
  if (slide.template === 'split') {
    const deviceW = cw * 0.45
    const deviceH = Math.round((deviceW / device.w) * device.h)
    return { left: cw * 0.73 - deviceW / 2, top: (ch - deviceH) / 2, w: deviceW, h: deviceH }
  }
  return null
}

async function renderScreenshotLayer(
  canvas: Canvas,
  screenshot: ScreenshotImage,
  bounds: FrameBounds,
  rx: number,
): Promise<void> {
  const url = await loadImageObjectUrl(screenshot.imageKey)
  if (!url) return

  const img = await FabricImage.fromURL(url)

  const { originalWidth: srcW, originalHeight: srcH } = screenshot
  const imgScale = Math.max(bounds.w / srcW, bounds.h / srcH)
  const scaledW = srcW * imgScale

  img.set({
    left: bounds.left + (bounds.w - scaledW) / 2,
    top: bounds.top,
    scaleX: imgScale,
    scaleY: imgScale,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })

  img.clipPath = new Rect({
    left: bounds.left,
    top: bounds.top,
    width: bounds.w,
    height: bounds.h,
    rx,
    ry: rx,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
  })

  ;(img as FabricImage & { layerName: string }).layerName = LAYER_NAMES.SCREENSHOT
  canvas.add(img)
}

export async function applyTemplate(
  canvas: Canvas,
  slide: Slide,
  dims?: { width: number; height: number },
): Promise<void> {
  canvas.clear()

  const cw = dims?.width ?? EDITOR_CANVAS_WIDTH
  const ch = dims?.height ?? getCanvasHeight()
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  const rx = Math.round(spec.cornerRadius * cw / spec.exportWidth)

  canvas.setDimensions({ width: cw, height: ch })

  const { template } = slide
  const device = getDeviceDimensions(slide, cw)

  // 1. Background
  canvas.add(renderBackground(cw, ch, slide.background))

  // 2. Screenshot clipped to device frame area (async)
  if (slide.screenshot) {
    const bounds = getFrameBounds(slide, cw, ch, device)
    if (bounds) {
      const screenshotRx = slide.template === 'hero' ? 0 : rx
      await renderScreenshotLayer(canvas, slide.screenshot, bounds, screenshotRx)
    }
  }

  // 3. Text + device frame border (screenshot sits beneath)
  if (template === 'hero') {
    applyHero(canvas, slide, cw, ch)
  } else if (template === 'text-top') {
    applyTextTop(canvas, slide, cw, ch, device, rx)
  } else if (template === 'text-bottom') {
    applyTextBottom(canvas, slide, cw, ch, device, rx)
  } else if (template === 'split') {
    applySplit(canvas, slide, cw, ch, device, rx)
  }

  // 4. Badge (always on top)
  if (slide.badge) {
    renderBadge(slide.badge, { centerX: cw / 2, top: ch * slide.badge.top }).forEach((obj) =>
      canvas.add(obj),
    )
  }

  canvas.renderAll()
}

function applyHero(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
): void {
  const headlineTop = ch * 0.4
  const headline = renderCaption(slide.headline, {
    left: cw / 2,
    top: headlineTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.HEADLINE,
  })
  canvas.add(headline)

  const subTop = headlineTop + slide.headline.style.fontSize * 1.15 + 12
  const subheadline = renderCaption(slide.subheadline, {
    left: cw / 2,
    top: subTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.SUBHEADLINE,
  })
  canvas.add(subheadline)
}

function applyTextTop(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
  rx: number,
): void {
  const headlineTop = ch * 0.05
  const headline = renderCaption(slide.headline, {
    left: cw / 2,
    top: headlineTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.HEADLINE,
  })
  canvas.add(headline)

  const subTop = headlineTop + slide.headline.style.fontSize * 1.15 + 8
  const subheadline = renderCaption(slide.subheadline, {
    left: cw / 2,
    top: subTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.SUBHEADLINE,
  })
  canvas.add(subheadline)

  renderDeviceFrame(slide.deviceFrame, {
    left: cw / 2,
    top: ch * 0.32,
    width: device.w,
    height: device.h,
    rx,
  }).forEach((obj) => canvas.add(obj))
}

function applyTextBottom(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
  rx: number,
): void {
  renderDeviceFrame(slide.deviceFrame, {
    left: cw / 2,
    top: ch * 0.03,
    width: device.w,
    height: device.h,
    rx,
  }).forEach((obj) => canvas.add(obj))

  const headlineTop = ch * 0.78
  const headline = renderCaption(slide.headline, {
    left: cw / 2,
    top: headlineTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.HEADLINE,
  })
  canvas.add(headline)

  const subTop = headlineTop + slide.headline.style.fontSize * 1.15 + 8
  const subheadline = renderCaption(slide.subheadline, {
    left: cw / 2,
    top: subTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.SUBHEADLINE,
  })
  canvas.add(subheadline)
}

function applySplit(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
  rx: number,
): void {
  const leftCenterX = cw * 0.25
  const headlineTop = ch * 0.35
  const headline = renderCaption(slide.headline, {
    left: leftCenterX,
    top: headlineTop,
    width: cw * 0.42,
    layerName: LAYER_NAMES.HEADLINE,
  })
  headline.set('textAlign', slide.headline.style.textAlign ?? 'left')
  canvas.add(headline)

  const subTop = headlineTop + slide.headline.style.fontSize * 1.15 + 10
  const subheadline = renderCaption(slide.subheadline, {
    left: leftCenterX,
    top: subTop,
    width: cw * 0.42,
    layerName: LAYER_NAMES.SUBHEADLINE,
  })
  subheadline.set('textAlign', slide.subheadline.style.textAlign ?? 'left')
  canvas.add(subheadline)

  const deviceW = cw * 0.45
  const deviceH = Math.round((deviceW / device.w) * device.h)
  renderDeviceFrame(slide.deviceFrame, {
    left: cw * 0.73,
    top: (ch - deviceH) / 2,
    width: deviceW,
    height: deviceH,
    rx,
  }).forEach((obj) => canvas.add(obj))
}
