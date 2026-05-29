import { describe, expect, it } from 'vitest'
import type { Slide, TemplateType } from '../types/project'
import { getDeviceBaseAnchor } from './templateLayouts'

// getDeviceBaseAnchor only reads slide.template + slide.deviceFrame.model, so a
// thin stub is enough — building a full Slide would only add noise.
function slideWith(template: TemplateType): Slide {
  return {
    template,
    deviceFrame: { model: 'iphone-16-pro' },
  } as unknown as Slide
}

const CW = 880 // span-group canvas width (2× the 440 single-slide width)
const CH = 956
const SEAM = CW / 2

describe('getDeviceBaseAnchor — seam centering (TESTING.md §3)', () => {
  it('hero-bleed biases off-center on a single slide', () => {
    expect(getDeviceBaseAnchor(slideWith('hero-bleed'), CW, CH, false)?.centerX).toBe(CW * 0.7)
  })

  it('hero-bleed snaps to the seam when spanCentered', () => {
    expect(getDeviceBaseAnchor(slideWith('hero-bleed'), CW, CH, true)?.centerX).toBe(SEAM)
  })

  it('split biases off-center on a single slide', () => {
    expect(getDeviceBaseAnchor(slideWith('split'), CW, CH, false)?.centerX).toBe(CW * 0.76)
  })

  it('split snaps to the seam when spanCentered', () => {
    expect(getDeviceBaseAnchor(slideWith('split'), CW, CH, true)?.centerX).toBe(SEAM)
  })

  it('text templates are already centered regardless of spanCentered', () => {
    for (const t of ['text-top', 'text-bottom'] as const) {
      expect(getDeviceBaseAnchor(slideWith(t), CW, CH, false)?.centerX).toBe(CW / 2)
      expect(getDeviceBaseAnchor(slideWith(t), CW, CH, true)?.centerX).toBe(CW / 2)
    }
  })

  it('returns null for templates without a device area (hero)', () => {
    expect(getDeviceBaseAnchor(slideWith('hero'), CW, CH, false)).toBeNull()
  })
})
