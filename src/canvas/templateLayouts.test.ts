import { describe, it, expect } from 'vitest'
import { getDeviceDimensions, getDeviceLayout } from './templateLayouts'
import type { Slide } from '../types/project'

function makeSlide(template: Slide['template']): Slide {
  return {
    id: 's1',
    template,
    deviceFrame: { model: 'iphone-16-pro', show: true, color: 'graphite', scale: 1 },
    headline: { text: '', style: { fontSize: 10, color: '#000', textAlign: 'center' } },
    subheadline: { text: '', style: { fontSize: 10, color: '#000', textAlign: 'center' } },
    background: { type: 'solid', color: '#fff' },
  } as Slide
}

function layout(template: Slide['template'], cw: number, ch: number, spanCentered: boolean) {
  const slide = makeSlide(template)
  return getDeviceLayout(slide, cw, ch, getDeviceDimensions(slide, cw), spanCentered)
}

describe('device layout span centering', () => {
  it('hero-bleed snaps to the seam when spanCentered', () => {
    const cw = 1000
    const seam = cw / 2
    expect(layout('hero-bleed', cw, 2000, true)?.centerX).toBe(seam)
  })

  it('split snaps to the seam when spanCentered', () => {
    expect(layout('split', 1000, 2000, true)?.centerX).toBe(500)
  })
})
