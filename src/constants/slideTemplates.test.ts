import { describe, expect, it } from 'vitest'
import type { Background } from '../types/project'
import { makeSlide, makeTextBlock, presetFromSlide } from './defaults'

const IMG_BG: Background = { type: 'image', imageKey: 'img:bg-1', imageObjectFit: 'cover' }

describe('presetFromSlide', () => {
  it('deep-clones the background so the preset never aliases the live slide', () => {
    const slide = makeSlide(0)
    slide.background = { ...IMG_BG }
    const preset = presetFromSlide(slide, 'My preset')

    expect(preset.background).toEqual(slide.background)
    expect(preset.background).not.toBe(slide.background)

    // Mutating the slide afterwards must not bleed into the stored preset.
    slide.background = { type: 'solid', color: '#000000' }
    expect(preset.background.type).toBe('image')
  })

  it('captures the slide text colors', () => {
    const slide = makeSlide(0)
    slide.texts.push(makeTextBlock(1, slide.template))
    slide.texts[0].style.color = '#111111'
    slide.texts[1].style.color = '#222222'
    const preset = presetFromSlide(slide, 'c')
    expect(preset.headlineColor).toBe('#111111')
    expect(preset.subheadlineColor).toBe('#222222')
  })
})
