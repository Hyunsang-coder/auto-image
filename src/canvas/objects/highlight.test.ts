import { describe, expect, it } from 'vitest'
import { makeHighlight } from '../../constants/defaults'
import { canvasPointToRegionOrigin, markerOf, regionCenterOnCanvas } from './highlight'

describe('lens highlight', () => {
  it('new highlights are lenses with no visible marker', () => {
    const h = makeHighlight()
    expect(h.popup.lens).toBe(true)
    expect(markerOf(h).show).toBe(false)
  })

  it('markerOf hides the marker of a lens even when one is requested', () => {
    const h = makeHighlight({ marker: { show: true, color: '#fff' } })
    expect(markerOf(h).show).toBe(false)
    const legacy = makeHighlight({
      marker: { show: true, color: '#fff' },
      popup: { width: 0.5 },
    })
    expect(markerOf(legacy).show).toBe(true)
  })

  it('dragging the lens center maps back to the region origin, tilt included', () => {
    const sb = { left: 48, top: 210, width: 343, height: 746 }
    const size = { w: 0.4, h: 0.16 }
    for (const rotation of [0, 15]) {
      const region = { x: 0.3, y: 0.42, ...size }
      const center = regionCenterOnCanvas(sb, region, rotation)
      const origin = canvasPointToRegionOrigin(sb, size, center, rotation)
      expect(origin.x).toBeCloseTo(region.x, 6)
      expect(origin.y).toBeCloseTo(region.y, 6)
    }
  })

  it('clamps the region inside the screenshot when the lens is dragged past an edge', () => {
    const sb = { left: 0, top: 0, width: 100, height: 200 }
    const origin = canvasPointToRegionOrigin(sb, { w: 0.4, h: 0.2 }, { x: 500, y: -50 })
    expect(origin).toEqual({ x: 0.6, y: 0 })
  })
})
