import { describe, expect, it } from 'vitest'
import type { Background } from '../types/project'
import {
  makeSlide,
  makeBadge,
  presetFromSlide,
  templateFromSlide,
  applyTemplateToSlide,
} from './defaults'

const IMG_BG: Background = { type: 'image', imageKey: 'img:bg-1', imageObjectFit: 'cover' }

describe('presetFromSlide', () => {
  it('deep-clones the background so the preset never aliases the live slide', () => {
    const slide = makeSlide(0, '#102030')
    slide.background = { ...IMG_BG }
    const preset = presetFromSlide(slide, 'My preset')

    expect(preset.background).toEqual(slide.background)
    expect(preset.background).not.toBe(slide.background)

    // Mutating the slide afterwards must not bleed into the stored preset.
    slide.background = { type: 'solid', color: '#000000' }
    expect(preset.background.type).toBe('image')
  })

  it('captures the slide text colors', () => {
    const slide = makeSlide(0, '#102030')
    slide.headline.style.color = '#111111'
    slide.subheadline.style.color = '#222222'
    const preset = presetFromSlide(slide, 'c')
    expect(preset.headlineColor).toBe('#111111')
    expect(preset.subheadlineColor).toBe('#222222')
  })
})

describe('templateFromSlide', () => {
  it('deep-clones background + captions so later slide edits do not mutate it', () => {
    const slide = makeSlide(0, '#102030')
    slide.background = { ...IMG_BG }
    const tpl = templateFromSlide(slide, 'T')

    expect(tpl.background).not.toBe(slide.background)
    slide.background = { type: 'solid', color: '#fff' }
    slide.headline.style.color = '#abcdef'
    expect(tpl.background.type).toBe('image')
    expect(tpl.headline.style.color).not.toBe('#abcdef')
  })
})

describe('applyTemplateToSlide', () => {
  it('keeps the target slide device model (iPhone template onto iPad slide)', () => {
    const iphone = makeSlide(0, '#102030', 'iphone')
    const tpl = templateFromSlide(iphone, 'T')
    const ipad = makeSlide(1, '#102030', 'ipad')
    expect(ipad.deviceFrame.model).toBe('ipad-pro-13')

    const patch = applyTemplateToSlide(ipad, tpl)
    expect(patch.deviceFrame?.model).toBe('ipad-pro-13')
    expect(patch.template).toBe(iphone.template)
  })

  it('preserves the slide content (caption text + translations)', () => {
    const src = makeSlide(0, '#102030')
    const tpl = templateFromSlide(src, 'T')
    const target = makeSlide(1, '#102030')
    target.headline.text = '내 헤드라인'
    target.headline.translations = { en: 'My headline' }

    const patch = applyTemplateToSlide(target, tpl)
    expect(patch.headline?.text).toBe('내 헤드라인')
    expect(patch.headline?.translations).toEqual({ en: 'My headline' })
  })

  it('gives applied badges fresh ids and clones their nested objects', () => {
    const src = makeSlide(0, '#102030')
    src.badges = [makeBadge('NEW')]
    src.badges[0].translations = { en: 'NEW' }
    const tpl = templateFromSlide(src, 'T')
    const target = makeSlide(1, '#102030')

    const patch = applyTemplateToSlide(target, tpl)
    const applied = patch.badges![0]
    expect(applied.id).not.toBe(tpl.badges[0].id)

    // Editing the applied badge must not mutate the stored template.
    applied.translations.en = 'CHANGED'
    applied.style.backgroundColor = '#ff0000'
    expect(tpl.badges[0].translations.en).toBe('NEW')
    expect(tpl.badges[0].style.backgroundColor).not.toBe('#ff0000')
  })

  it('clones the background so editing the slide does not mutate the template', () => {
    const src = makeSlide(0, '#102030')
    src.background = { ...IMG_BG }
    const tpl = templateFromSlide(src, 'T')
    const target = makeSlide(1, '#102030')

    const patch = applyTemplateToSlide(target, tpl)
    ;(patch.background as Background).imageKey = 'img:mutated'
    expect(tpl.background.imageKey).toBe('img:bg-1')
  })
})
