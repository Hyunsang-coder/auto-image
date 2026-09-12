import { describe, it, expect } from 'vitest'
import { previewRenderWidth } from './exportPreview'

describe('previewRenderWidth [H-V8]', () => {
  it('[H-V8] caps sizes 1..4 and leaves 5 at full export resolution', () => {
    expect(previewRenderWidth(1)).toBe(320)
    expect(previewRenderWidth(2)).toBe(480)
    expect(previewRenderWidth(3)).toBe(660)
    expect(previewRenderWidth(4)).toBe(900)
    expect(previewRenderWidth(5)).toBeUndefined()
  })

  it('[H-V8] falls back to full resolution outside 1..5', () => {
    expect(previewRenderWidth(0)).toBeUndefined()
    expect(previewRenderWidth(99)).toBeUndefined()
  })
})
