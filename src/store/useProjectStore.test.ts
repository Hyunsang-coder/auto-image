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
  shape: 'rect',
  borderColor: '#fff',
  borderWidth: 2,
  popup: { x: 0.5, y: 0.5, width: 0.3 },
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
