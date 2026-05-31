import { beforeEach, describe, expect, it } from 'vitest'
import type { Project, SlideTemplate } from '../types/project'
import { useProjectStore } from '../store/useProjectStore'
import { useLibraryStore } from '../store/useLibraryStore'
import { useCustomStore } from '../store/useCustomStore'
import { makeProject } from '../constants/defaults'
import { allReferencedImageKeys } from './imageRefs'

function projWithKeys(name: string, shotKey: string, bgKey: string): Project {
  const p = makeProject({ name, devices: ['iphone'], screenshotCount: 1, themeColor: '#102030' })
  p.slides[0].screenshot = { id: 's', imageKey: shotKey, originalWidth: 10, originalHeight: 10 }
  p.slides[0].background = { type: 'image', imageKey: bgKey }
  return p
}

beforeEach(() => {
  useProjectStore.setState({ project: null })
  useLibraryStore.setState({ projects: [] })
  useCustomStore.setState({ presets: [], templates: [] })
})

describe('allReferencedImageKeys', () => {
  it('includes the active project image keys', () => {
    useProjectStore.setState({ project: projWithKeys('A', 'img:shot-a', 'img:bg-a') })
    const keys = allReferencedImageKeys()
    expect(keys.has('img:shot-a')).toBe(true)
    expect(keys.has('img:bg-a')).toBe(true)
  })

  // The regression this guards: a saved project's blobs must NOT be pruned just
  // because the active project doesn't reference them.
  it('includes library project image keys (saved-project survival)', () => {
    useProjectStore.setState({ project: null })
    useLibraryStore.setState({ projects: [projWithKeys('Saved', 'img:shot-lib', 'img:bg-lib')] })
    const keys = allReferencedImageKeys()
    expect(keys.has('img:shot-lib')).toBe(true)
    expect(keys.has('img:bg-lib')).toBe(true)
  })

  // Per-locale screenshot overrides must survive the orphan sweep, same as the
  // base screenshot — otherwise switching slides would prune a localized image.
  it('includes per-locale screenshot override keys', () => {
    const p = projWithKeys('A', 'img:shot-a', 'img:bg-a')
    p.slides[0].screenshot!.localeOverrides = {
      ja: { imageKey: 'img:shot-ja', originalWidth: 10, originalHeight: 10 },
      en: { imageKey: 'img:shot-en', originalWidth: 10, originalHeight: 10 },
    }
    useProjectStore.setState({ project: p })
    const keys = allReferencedImageKeys()
    expect(keys.has('img:shot-a')).toBe(true)
    expect(keys.has('img:shot-ja')).toBe(true)
    expect(keys.has('img:shot-en')).toBe(true)
  })

  it('includes custom preset + template image backgrounds', () => {
    useCustomStore.setState({
      presets: [
        {
          id: 'p1',
          label: 'P',
          background: { type: 'image', imageKey: 'img:preset-bg' },
          headlineColor: '#fff',
          subheadlineColor: '#eee',
          accentColor: '#abc',
        },
      ],
      templates: [
        {
          id: 't1',
          label: 'T',
          template: 'hero',
          background: { type: 'image', imageKey: 'img:tpl-bg' },
        } as SlideTemplate,
      ],
    })
    const keys = allReferencedImageKeys()
    expect(keys.has('img:preset-bg')).toBe(true)
    expect(keys.has('img:tpl-bg')).toBe(true)
  })

  it('ignores non-image backgrounds', () => {
    const p = makeProject({ name: 'G', devices: ['iphone'], screenshotCount: 1, themeColor: '#102030' })
    p.slides[0].screenshot = null
    // default background is a gradient — carries no imageKey
    useProjectStore.setState({ project: p })
    expect(allReferencedImageKeys().size).toBe(0)
  })
})
