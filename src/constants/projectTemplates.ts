import type { Background, Badge, Caption, DeviceType, Ornament, Project, ScreenshotStyle, Slide } from '../types/project'
import { makeProject, newId } from './defaults'

/**
 * A built-in starter that is a whole *set* of slides (a curated multi-slide
 * composition), not a single-slide look. Picking one creates a fresh project
 * pre-filled with these slides; the user replaces the placeholder text and
 * drops in screenshots. Distinct from `SlideTemplate` ("내 템플릿"), which
 * restyles one existing slide.
 */
interface TemplateSlide {
  template: Slide['template']
  background: Background
  deviceFrame: Slide['deviceFrame']
  texts: Caption[]
  badges?: Badge[]
  ornaments?: Ornament[]
  screenshotStyle?: ScreenshotStyle
  /**
   * Span-group marker shared by the two members of a 2-page spanning pair.
   * `group` is a per-template tag (any stable string); it's rewritten to a fresh
   * shared id at build time so two loads never collide.
   */
  span?: { group: string; role: 'leader' | 'follower' }
}

export interface ProjectTemplate {
  id: string
  label: string
  description: string
  devices: DeviceType[]
  /** Becomes the project's themeBackground (default bg for slides added later). */
  themeBackground: Background
  slides: TemplateSlide[]
}

const REFERENCE_BG: Background = {
  type: 'gradient',
  gradient: {
    direction: 145,
    stops: [
      { color: '#ECEAF3', position: 0 },
      { color: '#F2EEE7', position: 1 },
    ],
  },
}

export const BUILTIN_PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'builtin-reference',
    label: '추천 시작 세트',
    description: '히어로 상·하단 + 2페이지 스팬(기울인 기기)',
    devices: ['iphone'],
    themeBackground: REFERENCE_BG,
    slides: [
      {
        template: 'hero-bleed',
        background: REFERENCE_BG,
        deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: -85, offsetY: -72, scale: 1 },
        texts: [
          {
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 500, color: '#000000', textAlign: 'center', letterSpacing: -2.2, lineHeight: 1.02 },
            pos: { x: 0.5073, y: 0.0885 },
            boxWidth: 0.8941,
          },
        ],
      },
      {
        template: 'hero-bleed',
        background: REFERENCE_BG,
        deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: -88, offsetY: -232, scale: 1 },
        texts: [
          {
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 500, color: '#000000', textAlign: 'center', letterSpacing: -2.2, lineHeight: 1.02 },
            pos: { x: 0.4898, y: 0.8331 },
            boxWidth: 0.8966,
          },
        ],
      },
      {
        template: 'text-bottom',
        background: REFERENCE_BG,
        deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: 31, offsetY: 41, scale: 0.55, rotation: 28 },
        texts: [
          {
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 700, color: '#1C1C24', textAlign: 'left', letterSpacing: -2.2, lineHeight: 1 },
            pos: { x: 0.2542, y: 0.1704 },
            boxWidth: 0.4312,
          },
          {
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 700, color: '#000000', textAlign: 'right', letterSpacing: -0.4, lineHeight: 1.22 },
            pos: { x: 0.7355, y: 0.8873 },
            boxWidth: 0.4267,
          },
        ],
        span: { group: 'a', role: 'leader' },
      },
      {
        template: 'text-top',
        background: REFERENCE_BG,
        deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black' },
        texts: [
          {
            text: '당신의 헤드라인',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 40, fontWeight: 900, color: '#1C1C24', textAlign: 'center', letterSpacing: -2.2, lineHeight: 1.02 },
          },
        ],
        span: { group: 'a', role: 'follower' },
      },
    ],
  },
]

/**
 * Instantiate a template into a fresh project ready for `loadProject`. Reuses
 * makeProject for the project skeleton (locales, translation API, timestamps)
 * and swaps in the template's slides with fresh IDs. Span members of the same
 * `group` get one shared fresh spanGroupId so the pairing survives the copy.
 */
export function buildProjectFromTemplate(tpl: ProjectTemplate, name: string): Project {
  const base = makeProject({
    name: name.trim() || tpl.label,
    devices: tpl.devices,
    screenshotCount: tpl.slides.length,
    themeBackground: tpl.themeBackground,
  })
  const groupIds = new Map<string, string>()
  const slides: Slide[] = tpl.slides.map((s, i) => {
    let spanGroupId: string | undefined
    let spanRole: 'leader' | 'follower' | undefined
    if (s.span) {
      spanGroupId = groupIds.get(s.span.group) ?? newId('span')
      groupIds.set(s.span.group, spanGroupId)
      spanRole = s.span.role
    }
    return {
      id: newId('slide'),
      index: i,
      template: s.template,
      background: structuredClone(s.background),
      deviceFrame: { ...s.deviceFrame },
      screenshot: null,
      texts: structuredClone(s.texts),
      badges: (s.badges ?? []).map((b) => ({ ...structuredClone(b), id: newId('badge') })),
      highlights: [],
      ornaments: (s.ornaments ?? []).map((o) => ({ ...structuredClone(o), id: newId('orn') })),
      screenshotStyle: s.screenshotStyle ? { ...s.screenshotStyle } : undefined,
      spanGroupId,
      spanRole,
    }
  })
  return { ...base, slides }
}

/**
 * Capture the current project's whole *look* as a reusable template: every
 * slide's layout/background/device/text/badges/ornaments, minus the content
 * that's specific to this project (screenshots, highlights). Span pairs are
 * recorded with per-template group tags so buildProjectFromTemplate can mint a
 * fresh shared id on the way back. The inverse of buildProjectFromTemplate.
 */
export function projectTemplateFromProject(project: Project, label: string): ProjectTemplate {
  const groupTags = new Map<string, string>()
  const slides: TemplateSlide[] = project.slides.map((s) => {
    let span: TemplateSlide['span']
    if (s.spanGroupId && s.spanRole) {
      let tag = groupTags.get(s.spanGroupId)
      if (!tag) {
        tag = `g${groupTags.size}`
        groupTags.set(s.spanGroupId, tag)
      }
      span = { group: tag, role: s.spanRole }
    }
    return {
      template: s.template,
      background: structuredClone(s.background),
      deviceFrame: { ...s.deviceFrame },
      texts: structuredClone(s.texts),
      badges: structuredClone(s.badges ?? []),
      ornaments: structuredClone(s.ornaments ?? []),
      screenshotStyle: s.screenshotStyle ? { ...s.screenshotStyle } : undefined,
      span,
    }
  })
  return {
    id: newId('utpl'),
    label,
    description: `${project.slides.length}장`,
    devices: project.devices,
    themeBackground: structuredClone(project.themeBackground),
    slides,
  }
}
