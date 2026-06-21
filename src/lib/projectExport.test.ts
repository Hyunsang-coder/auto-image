import { describe, it, expect } from 'vitest'
import { exportProject } from './projectExport'
import { buildProjectFromManifest, parseManifest } from './projectImport'
import { parseTemplate } from './localeIO'
import { applyCaptionRows } from './localePatch'
import { makeProject, SUPPORTED_LOCALES } from '../constants/defaults'
import type { Background, Badge, Project } from '../types/project'

const KNOWN = new Set(SUPPORTED_LOCALES.map((l) => l.code))
const SOLID: Background = { type: 'solid', color: '#101015' }
const GRADIENT: Background = {
  type: 'gradient',
  gradient: { direction: 145, stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }] },
}

function coreProject(): Project {
  const p = makeProject({ name: 'Round Trip', devices: ['iphone'], screenshotCount: 2, themeBackground: SOLID })
  p.sourceLocale = 'en'
  p.targetLocales = ['ja']
  p.slides[0] = {
    ...p.slides[0],
    template: 'text-top',
    background: SOLID,
    deviceFrame: { ...p.slides[0].deviceFrame, show: true, scale: 0.9 },
    texts: [{ ...p.slides[0].texts[0], text: 'Hello', translations: { ja: 'こんにちは' } }],
  }
  p.slides[1] = { ...p.slides[1], template: 'text-bottom', background: GRADIENT, texts: [{ ...p.slides[1].texts[0], text: 'World', translations: {} }] }
  return p
}

/** Re-import an export result the way runProjectImport does (manifest → captions). */
function reimport(result: ReturnType<typeof exportProject>): Project {
  const { manifest } = parseManifest(JSON.stringify(result.manifest))
  expect(manifest).not.toBeNull()
  const project = buildProjectFromManifest(manifest!)
  const { rows } = parseTemplate(result.captions, 'csv')
  const { patches } = applyCaptionRows(project.slides, rows, project.sourceLocale, KNOWN)
  project.slides = project.slides.map((s) => (patches[s.id] ? { ...s, ...patches[s.id] } : s))
  return project
}

describe('exportProject round-trip', () => {
  it('round-trips layout, textBlocks, deviceFrame, background, and text', () => {
    const out = exportProject(coreProject())
    const p2 = reimport(out)

    expect(p2.sourceLocale).toBe('en')
    expect(p2.targetLocales).toContain('ja')

    const a = p2.slides[0]
    expect(a.template).toBe('text-top')
    expect(a.texts).toHaveLength(1)
    expect(a.deviceFrame.show).toBe(true)
    expect(a.deviceFrame.scale).toBe(0.9)
    expect(a.background).toEqual(SOLID)
    expect(a.texts[0].text).toBe('Hello')
    expect(a.texts[0].translations.ja).toBe('こんにちは')

    const b = p2.slides[1]
    expect(b.template).toBe('text-bottom')
    expect(b.background.type).toBe('gradient')
    expect(b.texts[0].text).toBe('World')
  })

  it('reports nothing lossy for a plain project', () => {
    const out = exportProject(coreProject())
    expect(out.issues).toEqual([])
  })

  it('plans a screenshot filename per slide with a screenshot', () => {
    const p = coreProject()
    p.slides[0].screenshot = { id: 's', imageKey: 'img:a', originalWidth: 100, originalHeight: 200 }
    const out = exportProject(p)
    expect(out.screenshotPlan).toContain('1.en.png')
  })

  it('round-trips caption letterSpacing and lineHeight (no silent loss)', () => {
    const p = coreProject()
    p.slides[0].texts[0].style = { ...p.slides[0].texts[0].style, letterSpacing: -3.5, lineHeight: 1.4 }
    const out = exportProject(p)
    expect(out.issues).toEqual([])
    const p2 = reimport(out)
    expect(p2.slides[0].texts[0].style.letterSpacing).toBe(-3.5)
    expect(p2.slides[0].texts[0].style.lineHeight).toBe(1.4)
  })

  it('keeps the dominant device type when slide 0 is the odd one out', () => {
    const p = makeProject({ name: 'Mixed', devices: ['iphone'], screenshotCount: 3, themeBackground: SOLID })
    // Slide 0 iPad, slides 1-2 iPhone → majority is iPhone.
    p.slides[0] = { ...p.slides[0], deviceFrame: { ...p.slides[0].deviceFrame, model: 'ipad-pro-13' } }
    const out = exportProject(p)
    expect(out.manifest.device).toBe('iphone')
    expect(typeof out.manifest.deviceModel).toBe('string')
    expect(String(out.manifest.deviceModel).startsWith('iphone')).toBe(true)
  })
})

describe('exportProject span follower', () => {
  function spanProject(): Project {
    const text = JSON.stringify({
      version: 1,
      name: 'Span',
      device: 'iphone',
      sourceLocale: 'en',
      targetLocales: [],
      slides: [
        { layout: 'text-top', textBlocks: 1, deviceFrame: true, span: { group: 'g', role: 'leader' } },
        { layout: 'text-top', textBlocks: 1, deviceFrame: true, span: { group: 'g', role: 'follower' } },
      ],
    })
    const parsed = parseManifest(text)
    if (!parsed.manifest) throw new Error(parsed.issues.join('; '))
    return buildProjectFromManifest(parsed.manifest)
  }

  it('does not reverse a follower leader-owned layers or emit phantom issues', () => {
    const p = spanProject()
    // A stale image background on the follower (leader-owned, ignored while
    // grouped) must NOT produce a phantom "image background" loss issue.
    p.slides[1] = { ...p.slides[1], background: { type: 'image', imageKey: 'img:stale' } }
    const out = exportProject(p)
    expect(out.issues.join('\n')).not.toContain('image background')
    const slides = out.manifest.slides as Record<string, unknown>[]
    const followerManifest = slides[1]
    expect(followerManifest.background).toBeUndefined()
    const span = followerManifest.span as { group: string; role: string }
    expect(span.role).toBe('follower')
    // Leader and follower share the (re-generated) group id.
    expect(span.group).toBe((slides[0].span as { group: string }).group)
  })
})

describe('exportProject lossy reporting', () => {
  it('lists every field the manifest cannot represent', () => {
    const badge: Badge = {
      id: 'bd',
      text: 'New',
      translations: {},
      top: 0.1,
      style: { backgroundColor: '#fff', textColor: '#000', borderRadius: 100, paddingX: 16, paddingY: 8, fontSize: 48, fontWeight: 600, icon: 'star', iconPosition: 'left' },
    }
    const p = makeProject({ name: 'Lossy', devices: ['iphone'], screenshotCount: 2, themeBackground: SOLID })
    p.slides[0] = {
      ...p.slides[0],
      background: { type: 'image', imageKey: 'img:bg' },
      deviceFrame: { ...p.slides[0].deviceFrame, frameModel: 'ipad-11' },
      texts: [{ ...p.slides[0].texts[0], style: { ...p.slides[0].texts[0].style, fontFamily: 'Inter', box: { fill: '#000', opacity: 1, paddingX: 8, paddingY: 4, borderRadius: 8, border: { color: '#fff', width: 1 } } } }],
      badges: [badge],
      screenshot: { id: 's', imageKey: 'img:a', originalWidth: 100, originalHeight: 200, localeSource: { ja: 'en' } },
      localeOverrides: { ja: { template: 'hero' } },
    }
    // Second slide of a different device type → mixed-device warning.
    p.slides[1] = { ...p.slides[1], deviceFrame: { ...p.slides[1].deviceFrame, model: 'ipad-pro-13' } }

    const joined = exportProject(p).issues.join('\n')
    expect(joined).toContain('image background')
    expect(joined).toContain('frameModel')
    expect(joined).toContain('fontFamily')
    expect(joined).toContain('caption box border')
    expect(joined).toContain('badge icon')
    expect(joined).toContain('localeSource')
    expect(joined).toContain('localeOverrides')
    expect(joined).toContain('mixes')
  })
})
