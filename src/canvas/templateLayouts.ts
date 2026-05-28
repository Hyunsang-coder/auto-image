import { Canvas, FabricImage, Rect, Shadow } from 'fabric'
import type { Slide, ScreenshotImage, ScreenshotStyle } from '../types/project'
import { EDITOR_CANVAS_WIDTH, DEVICE_SPECS, deviceSpecOf } from '../constants/deviceSpecs'
import { renderBackground } from './objects/background'
import { renderBadge } from './objects/badge'
import { renderCaption } from './objects/caption'
import { renderDeviceFrame, type ScreenBounds } from './objects/deviceFrame'
import { renderOrnament } from './objects/ornament'
import { LAYER_NAMES } from './layerNames'
import { loadImageObjectUrl } from '../lib/imageStore'

function getCanvasHeight(): number {
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

const DEFAULT_SHOT_STYLE: ScreenshotStyle = { cornerRadiusRatio: 0.06, shadow: true }

function effectiveShotStyle(slide: Slide): ScreenshotStyle {
  return slide.screenshotStyle ?? DEFAULT_SHOT_STYLE
}

async function renderScreenshotLayer(
  canvas: Canvas,
  screenshot: ScreenshotImage,
  bounds: ScreenBounds,
  opts?: { withShadow?: boolean },
): Promise<void> {
  const url = await loadImageObjectUrl(screenshot.imageKey)
  if (!url) return

  const img = await FabricImage.fromURL(url)

  const { originalWidth: srcW, originalHeight: srcH } = screenshot
  const imgScale = Math.max(bounds.width / srcW, bounds.height / srcH)
  const scaledW = srcW * imgScale
  const scaledH = srcH * imgScale

  img.set({
    left: bounds.left + (bounds.width - scaledW) / 2,
    top: bounds.top + (bounds.height - scaledH) / 2,
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
    width: bounds.width,
    height: bounds.height,
    rx: bounds.rx,
    ry: bounds.rx,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
  })

  if (opts?.withShadow) {
    // 캔버스 폭에 비례한 부드러운 그림자 — 떠 있는 카드 느낌.
    img.shadow = new Shadow({
      color: 'rgba(15, 23, 42, 0.28)',
      blur: Math.max(12, bounds.width * 0.05),
      offsetX: 0,
      offsetY: Math.max(8, bounds.width * 0.03),
      affectStroke: false,
      nonScaling: true,
    })
  }

  ;(img as FabricImage & { layerName: string }).layerName = LAYER_NAMES.SCREENSHOT
  canvas.add(img)
}

interface DeviceLayout {
  centerX: number
  top: number
  width: number
  height: number
  rx: number
}

/**
 * Layout for the screenshot/device area. Returns a layout for **every** non-hero
 * template, even when deviceFrame.show is false — that way the floating
 * screenshot still has a place to live.
 */
function getDeviceLayout(
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
  rx: number,
): DeviceLayout | null {
  const { offsetX = 0, offsetY = 0 } = slide.deviceFrame
  if (slide.template === 'text-top') {
    return { centerX: cw / 2 + offsetX, top: ch * 0.30 + offsetY, width: device.w, height: device.h, rx }
  }
  if (slide.template === 'text-bottom') {
    return { centerX: cw / 2 + offsetX, top: ch * 0.05 + offsetY, width: device.w, height: device.h, rx }
  }
  if (slide.template === 'split') {
    const deviceW = cw * 0.45
    const deviceH = Math.round((deviceW / device.w) * device.h)
    return { centerX: cw * 0.76 + offsetX, top: (ch - deviceH) / 2 + offsetY, width: deviceW, height: deviceH, rx }
  }
  if (slide.template === 'hero-bleed') {
    // 우측에서 캔버스 밖으로 살짝 흘려보내 임팩트 있는 컴포지션 만들기.
    // 디바이스 폭은 캔버스의 75%, 상단은 25%에서 시작 → 우측 컬럼을 꽉 채움.
    const deviceW = cw * 0.75
    const deviceH = Math.round((deviceW / device.w) * device.h)
    return {
      centerX: cw * 0.7 + offsetX,
      top: ch * 0.28 + offsetY,
      width: deviceW,
      height: deviceH,
      rx,
    }
  }
  return null
}

export function getDeviceBaseAnchor(
  slide: Slide,
  cw: number,
  ch: number,
): { centerX: number; top: number } | null {
  const device = getDeviceDimensions(slide, cw)
  if (slide.template === 'text-top') return { centerX: cw / 2, top: ch * 0.30 }
  if (slide.template === 'text-bottom') return { centerX: cw / 2, top: ch * 0.05 }
  if (slide.template === 'split') {
    const deviceW = cw * 0.45
    const deviceH = Math.round((deviceW / device.w) * device.h)
    return { centerX: cw * 0.76, top: (ch - deviceH) / 2 }
  }
  if (slide.template === 'hero-bleed') {
    return { centerX: cw * 0.7, top: ch * 0.28 }
  }
  return null
}

function heroScreenBounds(cw: number, ch: number): ScreenBounds {
  return { left: 0, top: 0, width: cw, height: ch, rx: 0 }
}

function deviceScreenBounds(layout: DeviceLayout, slide: Slide): ScreenBounds {
  const { screen } = renderDeviceFrame(slide.deviceFrame, {
    left: layout.centerX,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.rx,
  })
  return screen
}

/**
 * Floating-screenshot bounds (no device chrome): use the full device-layout
 * footprint as the screenshot box, with the slide's chosen corner-radius
 * ratio. Returns an extra "fullLayout" for use by the move handler.
 */
function floatingScreenBounds(layout: DeviceLayout, style: ScreenshotStyle): ScreenBounds {
  return {
    left: layout.centerX - layout.width / 2,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.width * style.cornerRadiusRatio,
  }
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
  const deviceLayout = getDeviceLayout(slide, cw, ch, device, rx)
  const baseAnchor = getDeviceBaseAnchor(slide, cw, ch)

  // 1. Background
  canvas.add(renderBackground(cw, ch, slide.background))

  // 2. Ornaments (above bg, below content). 우리가 화면 어디서든 dragging 할 수 있도록 selectable로 둔다.
  if (slide.ornaments) {
    for (const orn of slide.ornaments) {
      canvas.add(renderOrnament(orn, { canvasWidth: cw, canvasHeight: ch }))
    }
  }

  // 3. Screenshot — device-inset if frame is shown, floating w/ shadow otherwise.
  if (slide.screenshot) {
    const shotStyle = effectiveShotStyle(slide)
    let bounds: ScreenBounds | null = null
    if (template === 'hero') {
      bounds = heroScreenBounds(cw, ch)
    } else if (deviceLayout) {
      bounds = slide.deviceFrame.show
        ? deviceScreenBounds(deviceLayout, slide)
        : floatingScreenBounds(deviceLayout, shotStyle)
    }
    if (bounds) {
      const floating = template !== 'hero' && !slide.deviceFrame.show
      await renderScreenshotLayer(canvas, slide.screenshot, bounds, {
        withShadow: floating && shotStyle.shadow,
      })
    }
  }

  // 4. Text + device frame border
  if (template === 'hero') {
    applyHero(canvas, slide, cw, ch)
  } else if (template === 'hero-bleed') {
    applyHeroBleed(canvas, slide, cw, ch, deviceLayout, baseAnchor)
  } else if (template === 'text-top') {
    applyTextTop(canvas, slide, cw, ch, deviceLayout, baseAnchor)
  } else if (template === 'text-bottom') {
    applyTextBottom(canvas, slide, cw, ch, deviceLayout, baseAnchor)
  } else if (template === 'split') {
    applySplit(canvas, slide, cw, ch, deviceLayout, baseAnchor)
  }

  // 5. Badge (always on top)
  if (slide.badge) {
    renderBadge(slide.badge, { centerX: cw / 2, top: ch * slide.badge.top }).forEach((obj) =>
      canvas.add(obj),
    )
  }

  canvas.renderAll()
}

function addHeadlineAndSubheadline(
  canvas: Canvas,
  slide: Slide,
  opts: {
    headlineCenterX: number
    headlineTop: number
    width: number
    align?: 'left' | 'center' | 'right'
    gap?: number
  },
): void {
  const align = opts.align ?? 'center'
  const headline = renderCaption(slide.headline, {
    left: opts.headlineCenterX,
    top: opts.headlineTop,
    width: opts.width,
    layerName: LAYER_NAMES.HEADLINE,
  })
  // Layout-default align always wins — the slide's stored textAlign is a
  // user-facing toggle that should round-trip via the caption panel, not
  // silently override the template's intended composition.
  headline.set('textAlign', align)
  if (align === 'left') headline.set({ originX: 'left', left: opts.headlineCenterX - opts.width / 2 })
  else if (align === 'right') headline.set({ originX: 'right', left: opts.headlineCenterX + opts.width / 2 })
  canvas.add(headline)

  const subTop = opts.headlineTop + headline.height + (opts.gap ?? 12)
  const subheadline = renderCaption(slide.subheadline, {
    left: opts.headlineCenterX,
    top: subTop,
    width: opts.width,
    layerName: LAYER_NAMES.SUBHEADLINE,
  })
  subheadline.set('textAlign', align)
  if (align === 'left') subheadline.set({ originX: 'left', left: opts.headlineCenterX - opts.width / 2 })
  else if (align === 'right') subheadline.set({ originX: 'right', left: opts.headlineCenterX + opts.width / 2 })
  canvas.add(subheadline)
}

function applyHero(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.42,
    width: cw * 0.85,
  })
}

function addDeviceFrame(
  canvas: Canvas,
  slide: Slide,
  layout: DeviceLayout | null,
  baseAnchor: { centerX: number; top: number } | null,
): void {
  if (!layout || !slide.deviceFrame.show) return
  const { paths } = renderDeviceFrame(slide.deviceFrame, {
    left: layout.centerX,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    rx: layout.rx,
  })
  const baseLeft = baseAnchor ? baseAnchor.centerX - layout.width / 2 : layout.centerX - layout.width / 2
  const baseTop = baseAnchor ? baseAnchor.top : layout.top
  paths.forEach((obj, i) => {
    if (i === 0) {
      obj.set({
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: true,
        borderColor: '#6366F1',
        cornerColor: '#6366F1',
        hoverCursor: 'move',
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
      })
      ;(obj as typeof obj & { _baseLeft?: number; _baseTop?: number })._baseLeft = baseLeft
      ;(obj as typeof obj & { _baseLeft?: number; _baseTop?: number })._baseTop = baseTop
    }
    canvas.add(obj)
  })
}

function applyTextTop(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  baseAnchor: { centerX: number; top: number } | null,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.05,
    width: cw * 0.85,
    gap: 8,
  })
  addDeviceFrame(canvas, slide, layout, baseAnchor)
}

function applyTextBottom(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  baseAnchor: { centerX: number; top: number } | null,
): void {
  addDeviceFrame(canvas, slide, layout, baseAnchor)
  addHeadlineAndSubheadline(canvas, slide, {
    headlineCenterX: cw / 2,
    headlineTop: ch * 0.74,
    width: cw * 0.85,
    gap: 8,
  })
}

function applySplit(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  baseAnchor: { centerX: number; top: number } | null,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    headlineCenterX: cw * 0.21,
    headlineTop: ch * 0.32,
    width: cw * 0.37,
    align: 'left',
    gap: 10,
  })
  addDeviceFrame(canvas, slide, layout, baseAnchor)
}

/**
 * Hero-bleed: bold stacked text top-left, image extending to bottom-right
 * (with intentional bleed off the right edge if the screenshot is wide).
 */
function applyHeroBleed(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  layout: DeviceLayout | null,
  baseAnchor: { centerX: number; top: number } | null,
): void {
  addHeadlineAndSubheadline(canvas, slide, {
    headlineCenterX: cw * 0.25,
    headlineTop: ch * 0.06,
    width: cw * 0.46,
    align: 'left',
    gap: 10,
  })
  addDeviceFrame(canvas, slide, layout, baseAnchor)
}
