import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PROJECT_TEMPLATES,
  buildProjectFromTemplate,
  projectTemplateFromProject,
} from './projectTemplates'
import { relocalizePlaceholder } from './defaults'

const REF = BUILTIN_PROJECT_TEMPLATES[0]

describe('buildProjectFromTemplate', () => {
  it('instantiates every slide with unique ids, sequential indices, no screenshots', () => {
    const p = buildProjectFromTemplate(REF, 'My App')
    expect(p.slides).toHaveLength(REF.slides.length)
    expect(p.slides.map((s) => s.index)).toEqual(REF.slides.map((_, i) => i))
    expect(new Set(p.slides.map((s) => s.id)).size).toBe(p.slides.length)
    expect(p.name).toBe('My App')
    expect(p.slides.every((s) => s.screenshot === null)).toBe(true)
  })

  it('mints one shared fresh spanGroupId per group, keeping roles + adjacency', () => {
    const p = buildProjectFromTemplate(REF, 'X')
    const leader = p.slides.find((s) => s.spanRole === 'leader')
    const follower = p.slides.find((s) => s.spanRole === 'follower')
    expect(leader?.spanGroupId).toBeTruthy()
    expect(leader?.spanGroupId).toBe(follower?.spanGroupId)
    expect(follower?.index).toBe((leader?.index ?? -2) + 1)
  })

  it('does not share span ids between two builds', () => {
    const a = buildProjectFromTemplate(REF, 'A').slides.find((s) => s.spanGroupId)?.spanGroupId
    const b = buildProjectFromTemplate(REF, 'B').slides.find((s) => s.spanGroupId)?.spanGroupId
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })

  // Built projects start at sourceLocale 'ko'; flipping the locale later relies
  // on changeSourceLocale recognizing every template string as a placeholder.
  // If a template literal drifts out of the placeholder tables, the project
  // gets stranded with Korean text for non-ko users — pin the registration.
  it('every builtin template text is a registered ko placeholder', () => {
    for (const tpl of BUILTIN_PROJECT_TEMPLATES) {
      for (const s of tpl.slides) {
        for (const c of s.texts) {
          expect(relocalizePlaceholder(c.text, 'ko', 'en'), c.text).not.toBe(c.text)
        }
        for (const b of s.badges ?? []) {
          expect(relocalizePlaceholder(b.text, 'ko', 'en'), b.text).not.toBe(b.text)
        }
      }
    }
  })

  it('seeds template text through the placeholder mechanism for the project source locale', () => {
    const p = buildProjectFromTemplate(REF, 'Loc')
    for (const s of p.slides) {
      for (const c of s.texts) {
        // sourceLocale is ko today, so the seeded text must be the ko
        // placeholder the template declared (relocalize = identity).
        expect(relocalizePlaceholder(c.text, p.sourceLocale, 'en')).not.toBe(c.text)
      }
    }
  })
})

describe('projectTemplateFromProject', () => {
  it('round-trips a look back into a template — span preserved, screenshots dropped', () => {
    const project = buildProjectFromTemplate(REF, 'Round')
    // A screenshot on the live project must NOT survive into the saved template.
    project.slides[0].screenshot = { id: 'x', imageKey: 'img:x', originalWidth: 1, originalHeight: 1 }

    const tpl = projectTemplateFromProject(project, 'Saved')
    expect(tpl.label).toBe('Saved')
    expect(tpl.slides).toHaveLength(project.slides.length)

    const rebuilt = buildProjectFromTemplate(tpl, 'Again')
    expect(rebuilt.slides.every((s) => s.screenshot === null)).toBe(true)
    const leader = rebuilt.slides.find((s) => s.spanRole === 'leader')
    const follower = rebuilt.slides.find((s) => s.spanRole === 'follower')
    expect(leader?.spanGroupId).toBe(follower?.spanGroupId)
  })
})
