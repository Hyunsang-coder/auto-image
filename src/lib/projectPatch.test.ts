import { describe, it, expect } from 'vitest'
import { applyPatch } from './projectPatch'
import { buildProjectFromManifest, parseManifest } from './projectImport'
import type { Project } from '../types/project'

// A real project via the manifest factories, so ids/styles/placements are
// genuine (not hand-rolled). Slides 3 & 4 form an adjacent span pair.
function project(): Project {
  const text = JSON.stringify({
    version: 1,
    name: 'Test',
    device: 'iphone',
    sourceLocale: 'en',
    targetLocales: ['ja'],
    slides: [
      { layout: 'text-top', textBlocks: 2, deviceFrame: true, badges: [{ text: 'New' }] },
      { layout: 'text-bottom', textBlocks: 1, deviceFrame: true },
      { layout: 'text-top', textBlocks: 1, deviceFrame: true, span: { group: 'g', role: 'leader' } },
      { layout: 'text-top', textBlocks: 1, deviceFrame: true, span: { group: 'g', role: 'follower' } },
    ],
  })
  const parsed = parseManifest(text)
  if (!parsed.manifest) throw new Error('fixture manifest failed: ' + parsed.issues.join('; '))
  return buildProjectFromManifest(parsed.manifest)
}

const SHOT = { imageKey: 'img:abc', width: 1320, height: 2868 }

describe('setText', () => {
  it('routes the source locale to base text and a peer locale to translations', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'setText', slide: 1, field: 'headline', locale: 'en', value: 'Hi' },
      { op: 'setText', slide: 1, field: 'headline', locale: 'ja', value: 'やあ' },
    ])
    expect(issues).toEqual([])
    expect(p.slides[0].texts[0].text).toBe('Hi')
    expect(p.slides[0].texts[0].translations).toEqual({ ja: 'やあ' })
  })

  it('auto-adds a new peer locale to targetLocales', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'setText', slide: 1, field: 'subheadline', locale: 'de', value: 'Hallo' },
    ])
    expect(p.targetLocales).toContain('de')
  })

  it('writes a badge by badge:0', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'setText', slide: 1, field: 'badge:0', locale: 'en', value: 'Updated' },
    ])
    expect(p.slides[0].badges[0].text).toBe('Updated')
  })

  it('matches by slideId', () => {
    const base = project()
    const id = base.slides[1].id
    const { project: p } = applyPatch(base, [
      { op: 'setText', slideId: id, field: 'headline', locale: 'en', value: 'By id' },
    ])
    expect(p.slides[1].texts[0].text).toBe('By id')
  })

  it('reports unknown field / locale / out-of-range slide', () => {
    const { issues } = applyPatch(project(), [
      { op: 'setText', slide: 1, field: 'caption', locale: 'en', value: 'x' },
      { op: 'setText', slide: 1, field: 'headline', locale: 'zz', value: 'x' },
      { op: 'setText', slide: 9, field: 'headline', locale: 'en', value: 'x' },
    ])
    expect(issues).toHaveLength(3)
  })
})

describe('setScreenshot', () => {
  it('sets the base screenshot when locale === sourceLocale', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 1, locale: 'en', ...SHOT },
    ])
    expect(issues).toEqual([])
    expect(p.slides[0].screenshot?.imageKey).toBe('img:abc')
    expect(p.slides[0].screenshot?.originalWidth).toBe(1320)
  })

  it('attaches a per-locale override on top of an existing base', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 1, locale: 'en', ...SHOT },
      { op: 'setScreenshot', slide: 1, locale: 'ja', imageKey: 'img:ja', width: 1320, height: 2868 },
    ])
    expect(issues).toEqual([])
    expect(p.slides[0].screenshot?.localeOverrides?.ja?.imageKey).toBe('img:ja')
  })

  it('skips an override when there is no base screenshot', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 1, locale: 'ja', imageKey: 'img:ja', width: 1320, height: 2868 },
    ])
    expect(p.slides[0].screenshot).toBeNull()
    expect(issues.join()).toMatch(/no base screenshot/)
  })

  it('keeps the frame on a cross-type aspect by default, warning', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 1, locale: 'en', imageKey: 'img:pad', width: 2064, height: 2752 },
    ])
    expect(p.slides[0].deviceFrame.frameModel).toBeUndefined()
    expect(issues.join()).toMatch(/redetect/)
  })

  it('re-detects the frame on cross-type aspect with redetect:true', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 1, locale: 'en', imageKey: 'img:pad', width: 2064, height: 2752, redetect: true },
    ])
    expect(p.slides[0].deviceFrame.frameModel).toBeDefined()
  })
})

describe('set (whitelisted paths)', () => {
  it('clamps deviceFrame.scale and reports it', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'deviceFrame.scale', value: 5 },
    ])
    expect(p.slides[0].deviceFrame.scale).toBe(2)
    expect(issues.join()).toMatch(/scale/)
  })

  it('sets a solid background but rejects an image background', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'background', value: { type: 'solid', color: '#101015' } },
      { op: 'set', slide: 2, path: 'background', value: { type: 'image', imageKey: 'img:x' } },
    ])
    expect(p.slides[0].background).toEqual({ type: 'solid', color: '#101015' })
    expect(p.slides[1].background.type).not.toBe('image')
    expect(issues.join()).toMatch(/image/)
  })

  it('sets a known template and rejects an unknown one', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'template', value: 'split' },
      { op: 'set', slide: 1, path: 'template', value: 'nope' },
    ])
    expect(p.slides[0].template).toBe('split')
    expect(issues.join()).toMatch(/nope/)
  })

  it('applies a caption style via texts[i].style.color', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'texts[0].style.color', value: '#ffffff' },
    ])
    expect(p.slides[0].texts[0].style.color).toBe('#ffffff')
  })

  it('replaces ornaments and a badge style', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'ornaments', value: [{ shape: 'star', x: 0.2, y: 0.2 }] },
      { op: 'set', slide: 1, path: 'badges[0].style.backgroundColor', value: '#ff0000' },
    ])
    expect(p.slides[0].ornaments?.[0].shape).toBe('star')
    expect(p.slides[0].badges[0].style.backgroundColor).toBe('#ff0000')
  })

  it('sets project-scoped fields', () => {
    const { project: p } = applyPatch(project(), [
      { op: 'set', path: 'name', value: 'Renamed' },
      { op: 'set', path: 'targetLocales', value: ['ja', 'de'] },
    ])
    expect(p.name).toBe('Renamed')
    expect(p.targetLocales).toEqual(['ja', 'de'])
  })

  it('set deviceModels resizes every slide of that type (not just project.deviceModels)', () => {
    const base = project()
    expect(base.slides.every((s) => s.deviceFrame.model === 'iphone-16-pro')).toBe(true)
    const { project: p, issues } = applyPatch(base, [
      { op: 'set', path: 'deviceModels', value: { iphone: 'iphone-6-5' } },
    ])
    expect(issues).toEqual([])
    expect(p.deviceModels?.iphone).toBe('iphone-6-5')
    // The render target follows slide.deviceFrame.model, so the remap is what
    // actually changes the exported resolution.
    expect(p.slides.every((s) => s.deviceFrame.model === 'iphone-6-5')).toBe(true)
  })

  it('set sourceLocale prunes the new source from targetLocales', () => {
    const base = project()
    expect(base.targetLocales).toContain('ja')
    const { project: p } = applyPatch(base, [
      { op: 'set', path: 'sourceLocale', value: 'ja' },
    ])
    expect(p.sourceLocale).toBe('ja')
    expect(p.targetLocales).not.toContain('ja')
  })

  it('rejects forbidden identity/image paths', () => {
    const { issues } = applyPatch(project(), [
      { op: 'set', slide: 1, path: 'id', value: 'hacked' },
      { op: 'set', slide: 1, path: 'screenshot', value: {} },
    ])
    expect(issues).toHaveLength(2)
    expect(issues.join()).toMatch(/not patchable/)
  })
})

describe('span invariants', () => {
  it('rejects a shared-layer set on a follower but allows its texts', () => {
    const { project: p, issues } = applyPatch(project(), [
      { op: 'set', slide: 4, path: 'background', value: { type: 'solid', color: '#000' } },
      { op: 'set', slide: 4, path: 'texts[0].style.color', value: '#abcabc' },
    ])
    expect(issues.join()).toMatch(/leader-owned/)
    expect(p.slides[3].texts[0].style.color).toBe('#abcabc')
    expect(p.slides[3].background.type).not.toBe('solid')
  })

  it('rejects setScreenshot on a follower', () => {
    const { issues } = applyPatch(project(), [
      { op: 'setScreenshot', slide: 4, locale: 'en', ...SHOT },
    ])
    expect(issues.join()).toMatch(/leader-owned/)
  })
})

describe('purity', () => {
  it('does not mutate the input project', () => {
    const base = project()
    const snapshot = structuredClone(base)
    applyPatch(base, [{ op: 'setText', slide: 1, field: 'headline', locale: 'en', value: 'changed' }])
    expect(base).toEqual(snapshot)
  })
})
