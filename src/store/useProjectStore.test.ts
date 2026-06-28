import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './useProjectStore'
import type { Highlight, Ornament } from '../types/project'

function setup(slideCount = 2) {
  useProjectStore.getState().createProject({
    name: 'Dup Test',
    devices: ['iphone'],
    screenshotCount: slideCount,
    themeBackground: { type: 'solid', color: '#000000' },
  })
  return useProjectStore.getState().project!
}

const sampleHighlight: Highlight = {
  id: 'hl-old',
  sourceRegion: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  popup: { width: 0.3 },
}
const sampleOrnament: Ornament = {
  id: 'orn-old',
  shape: 'star',
  x: 0.5,
  y: 0.5,
  size: 0.1,
  rotation: 0,
  color: '#fff',
  opacity: 1,
}

describe('duplicateSlide', () => {
  beforeEach(() => setup())

  it('inserts a copy right after the source and selects it', () => {
    const { project, updateSlide, duplicateSlide } = useProjectStore.getState()
    const src = project!.slides[0]
    updateSlide(src.id, { texts: [{ ...src.texts[0], text: 'Hello' }] })
    duplicateSlide(src.id)

    const after = useProjectStore.getState().project!
    expect(after.slides).toHaveLength(3)
    expect(after.slides[1].texts[0].text).toBe('Hello') // copy sits at index 1
    expect(after.slides.map((s) => s.index)).toEqual([0, 1, 2]) // reindexed
    expect(useProjectStore.getState().activeSlideId).toBe(after.slides[1].id)
  })

  it('gives the copy fresh IDs for the slide and every IDed sub-object', () => {
    const { project, updateSlide, duplicateSlide } = useProjectStore.getState()
    const src = project!.slides[0]
    updateSlide(src.id, {
      screenshot: { id: 'shot-old', imageKey: 'img:abc', originalWidth: 100, originalHeight: 200 },
      badges: [{ id: 'badge-old', text: 'New', translations: {}, style: {} as never, top: 0.1 }],
      highlights: [sampleHighlight],
      ornaments: [sampleOrnament],
    })
    duplicateSlide(src.id)

    const [orig, copy] = useProjectStore.getState().project!.slides
    expect(copy.id).not.toBe(orig.id)
    expect(copy.screenshot!.id).not.toBe(orig.screenshot!.id)
    expect(copy.badges[0].id).not.toBe(orig.badges[0].id)
    expect(copy.highlights[0].id).not.toBe(orig.highlights[0].id)
    expect(copy.ornaments![0].id).not.toBe(orig.ornaments![0].id)
  })

  it('shares the image blob (same imageKey) but deep-copies translatable text', () => {
    const { project, updateSlide, duplicateSlide } = useProjectStore.getState()
    const src = project!.slides[0]
    updateSlide(src.id, {
      screenshot: { id: 'shot-old', imageKey: 'img:abc', originalWidth: 1, originalHeight: 1 },
      texts: [{ ...src.texts[0], text: 'Base', translations: { ja: 'ベース' } }],
    })
    duplicateSlide(src.id)

    const [orig, copy] = useProjectStore.getState().project!.slides
    expect(copy.screenshot!.imageKey).toBe('img:abc') // blob shared
    expect(copy.texts[0].translations).toEqual({ ja: 'ベース' })
    expect(copy.texts[0].translations).not.toBe(orig.texts[0].translations) // not the same ref
  })

  it('clears span markers on the copy', () => {
    const { project, updateSlide, duplicateSlide } = useProjectStore.getState()
    const src = project!.slides[0]
    updateSlide(src.id, { spanGroupId: 'grp', spanRole: 'leader' })
    duplicateSlide(src.id)
    const copy = useProjectStore.getState().project!.slides[1]
    expect(copy.spanGroupId).toBeUndefined()
    expect(copy.spanRole).toBeUndefined()
  })

  it('is a no-op at the 10-slide cap', () => {
    setup(10)
    const id = useProjectStore.getState().project!.slides[0].id
    useProjectStore.getState().duplicateSlide(id)
    expect(useProjectStore.getState().project!.slides).toHaveLength(10)
  })
})

describe('span link/unlink — per-slide texts', () => {
  beforeEach(() => setup())

  it('link moves no data; unlink keeps the follower’s own texts under the leader’s look', async () => {
    const { project, updateSlide, linkSpanWithNext } = useProjectStore.getState()
    const [a, b] = project!.slides
    updateSlide(a.id, { texts: [{ ...a.texts[0], text: 'Left page' }] })
    updateSlide(b.id, {
      template: 'split',
      texts: [{ ...b.texts[0], text: 'Right page', translations: { ja: '右' } }],
    })

    expect(linkSpanWithNext(a.id)).toBeNull()
    const linked = useProjectStore.getState().project!
    expect(linked.slides[1].texts[0].text).toBe('Right page')

    await useProjectStore.getState().unlinkSpan(linked.slides[0].spanGroupId!)
    const after = useProjectStore.getState().project!
    expect(after.slides.every((s) => !s.spanGroupId && !s.spanRole)).toBe(true)
    // Follower keeps its own caption — not a clone of the leader's…
    expect(after.slides[1].texts[0].text).toBe('Right page')
    expect(after.slides[1].texts[0].translations).toEqual({ ja: '右' })
    expect(after.slides[0].texts[0].text).toBe('Left page')
    // …while the shared look IS cloned from the leader.
    expect(after.slides[1].template).toBe(after.slides[0].template)
  })

  it('unlink keeps the follower’s own screenshot when it had one before linking', async () => {
    const { project, updateSlide, linkSpanWithNext } = useProjectStore.getState()
    const [a, b] = project!.slides
    updateSlide(a.id, {
      screenshot: { id: 'shot-a', imageKey: 'img:a', originalWidth: 1320, originalHeight: 2868 },
    })
    updateSlide(b.id, {
      screenshot: { id: 'shot-b', imageKey: 'img:b', originalWidth: 1320, originalHeight: 2868 },
    })

    expect(linkSpanWithNext(a.id)).toBeNull()
    const linked = useProjectStore.getState().project!
    await useProjectStore.getState().unlinkSpan(linked.slides[0].spanGroupId!)

    const after = useProjectStore.getState().project!
    expect(after.slides[0].screenshot?.imageKey).toBe('img:a')
    expect(after.slides[1].screenshot?.imageKey).toBe('img:b')
  })
})

describe('setDeviceSize', () => {
  beforeEach(() => setup())

  it('within-type pick re-sizes every slide of the type, devices unchanged', () => {
    useProjectStore.getState().setDeviceSize('iphone', 'iphone-6-5')
    const p = useProjectStore.getState().project!
    expect(p.slides.every((s) => s.deviceFrame.model === 'iphone-6-5')).toBe(true)
    expect(p.devices).toEqual(['iphone'])
    expect(p.deviceModels?.iphone).toBe('iphone-6-5')
  })

  it('cross-type pick converts every slide and swaps the devices entry', () => {
    useProjectStore.getState().setDeviceSize('iphone', 'ipad-pro-13')
    const p = useProjectStore.getState().project!
    expect(p.slides.every((s) => s.deviceFrame.model === 'ipad-pro-13')).toBe(true)
    expect(p.devices).toEqual(['ipad'])
    expect(p.deviceModels?.ipad).toBe('ipad-pro-13')
  })

  it('converted slide keeps a mismatched screenshot’s visual frame via frameModel', () => {
    const { project, updateSlide } = useProjectStore.getState()
    const [withShot, noShot] = project!.slides
    updateSlide(withShot.id, {
      // iPhone-aspect shot (1320×2868 ≈ 0.46)
      screenshot: { id: 'shot', imageKey: 'img:a', originalWidth: 1320, originalHeight: 2868 },
    })
    useProjectStore.getState().setDeviceSize('iphone', 'ipad-pro-13')
    const slides = useProjectStore.getState().project!.slides
    expect(slides.find((s) => s.id === withShot.id)!.deviceFrame.frameModel).toBe('iphone-16-pro')
    expect(slides.find((s) => s.id === noShot.id)!.deviceFrame.frameModel).toBeUndefined()
  })

  it('clears a stale frameModel when the shot matches the new type', () => {
    const { project, updateSlide } = useProjectStore.getState()
    const slide = project!.slides[0]
    // iPad shot on an iPhone canvas — the cross-type-upload state.
    updateSlide(slide.id, {
      screenshot: { id: 'shot', imageKey: 'img:b', originalWidth: 2064, originalHeight: 2752 },
      deviceFrame: { ...slide.deviceFrame, frameModel: 'ipad-pro-13' },
    })
    useProjectStore.getState().setDeviceSize('iphone', 'ipad-11')
    const after = useProjectStore.getState().project!.slides[0]
    expect(after.deviceFrame.model).toBe('ipad-11')
    expect(after.deviceFrame.frameModel).toBeUndefined()
  })
})

describe('changeSourceLocale', () => {
  beforeEach(() => setup())

  it('re-localizes untouched placeholder text and badges to the new source locale', () => {
    const { project, updateSlide, changeSourceLocale } = useProjectStore.getState()
    const src = project!.slides[0]
    expect(src.texts[0].text).toBe('당신의 헤드라인')
    updateSlide(src.id, {
      badges: [{ id: 'b1', text: '새 기능', translations: {}, style: {} as never, top: 0.1 }],
    })

    changeSourceLocale('en')

    const after = useProjectStore.getState().project!
    expect(after.sourceLocale).toBe('en')
    expect(after.slides[0].texts[0].text).toBe('Your headline')
    expect(after.slides[0].badges[0].text).toBe('New')
  })

  it('keeps user-written text and promotes an existing translation over the placeholder', () => {
    const { project, updateSlide, changeSourceLocale } = useProjectStore.getState()
    const [a, b] = project!.slides
    updateSlide(a.id, { texts: [{ ...a.texts[0], text: '내가 쓴 카피' }] })
    updateSlide(b.id, { texts: [{ ...b.texts[0], translations: { en: 'Track your day' } }] })

    changeSourceLocale('en')

    const after = useProjectStore.getState().project!
    expect(after.slides[0].texts[0].text).toBe('내가 쓴 카피') // user text passes through
    expect(after.slides[0].texts[0].translations.ko).toBe('내가 쓴 카피')
    expect(after.slides[1].texts[0].text).toBe('Track your day') // translation wins
  })

  it('round-trips: flipping back restores the original placeholder', () => {
    const { changeSourceLocale } = useProjectStore.getState()
    changeSourceLocale('en')
    useProjectStore.getState().changeSourceLocale('ko')
    const after = useProjectStore.getState().project!
    expect(after.sourceLocale).toBe('ko')
    expect(after.slides[0].texts[0].text).toBe('당신의 헤드라인')
  })
})
