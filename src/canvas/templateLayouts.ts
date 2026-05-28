import type { Canvas } from 'fabric'
import type { Slide } from '../types/project'
import { EDITOR_CANVAS_WIDTH, deviceSpecOf } from '../constants/deviceSpecs'
import { renderBackground } from './objects/background'
import { renderCaption } from './objects/caption'
import { renderDeviceFrame } from './objects/deviceFrame'
import { LAYER_NAMES } from './layerNames'

function getCanvasHeight(): number {
  // Use iphone as default aspect ratio
  const spec = deviceSpecOf('iphone')
  return Math.round(
    (EDITOR_CANVAS_WIDTH / spec.exportWidth) * spec.exportHeight,
  )
}

function getDeviceDimensions(slide: Slide): { w: number; h: number } {
  const spec = deviceSpecOf(slide.deviceFrame.model === 'ipad-pro-13' ? 'ipad' : 'iphone')
  const w = EDITOR_CANVAS_WIDTH * 0.6
  const h = Math.round((w / spec.exportWidth) * spec.exportHeight)
  return { w, h }
}

export function applyTemplate(canvas: Canvas, slide: Slide): void {
  canvas.clear()

  const cw = EDITOR_CANVAS_WIDTH
  const ch = getCanvasHeight()

  canvas.setDimensions({ width: cw, height: ch })

  const { template } = slide
  const device = getDeviceDimensions(slide)

  // Background always present
  const bg = renderBackground(cw, ch, slide.background)
  canvas.add(bg)

  if (template === 'hero') {
    applyHero(canvas, slide, cw, ch)
  } else if (template === 'text-top') {
    applyTextTop(canvas, slide, cw, ch, device)
  } else if (template === 'text-bottom') {
    applyTextBottom(canvas, slide, cw, ch, device)
  } else if (template === 'split') {
    applySplit(canvas, slide, cw, ch, device)
  }

  canvas.renderAll()
}

function applyHero(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
): void {
  // headline at 40% vertical, centered horizontally
  const headlineTop = ch * 0.4
  const headline = renderCaption(slide.headline, {
    left: cw / 2,
    top: headlineTop,
    width: cw * 0.85,
    layerName: LAYER_NAMES.HEADLINE,
  })
  canvas.add(headline)

  // subheadline just below headline
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
): void {
  // headline/sub at top 25%
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

  // device frame at bottom
  if (slide.deviceFrame.show) {
    const deviceTop = ch * 0.32
    const frame = renderDeviceFrame(slide.deviceFrame, {
      left: cw / 2,
      top: deviceTop,
      width: device.w,
      height: device.h,
    })
    if (frame) canvas.add(frame)
  }
}

function applyTextBottom(
  canvas: Canvas,
  slide: Slide,
  cw: number,
  ch: number,
  device: { w: number; h: number },
): void {
  // device frame at top
  if (slide.deviceFrame.show) {
    const deviceTop = ch * 0.03
    const frame = renderDeviceFrame(slide.deviceFrame, {
      left: cw / 2,
      top: deviceTop,
      width: device.w,
      height: device.h,
    })
    if (frame) canvas.add(frame)
  }

  // headline/sub at bottom 20%
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
): void {
  // headline/sub on left half
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

  // device on right half
  if (slide.deviceFrame.show) {
    const deviceW = cw * 0.45
    const deviceH = Math.round((deviceW / device.w) * device.h)
    const deviceLeft = cw * 0.73
    const deviceTop = (ch - deviceH) / 2
    const frame = renderDeviceFrame(slide.deviceFrame, {
      left: deviceLeft,
      top: deviceTop,
      width: deviceW,
      height: deviceH,
    })
    if (frame) canvas.add(frame)
  }
}
