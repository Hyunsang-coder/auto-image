import type { Background, Badge, Caption, DeviceType, Ornament, Project, ScreenshotStyle, Slide } from '../types/project'
import { makeProject, newId, relocalizePlaceholder } from './defaults'
import { splitLeaderTexts } from '../lib/spanTextMigration'
import { t } from '../i18n'

// Templates are authored in Korean; every text literal below must be a
// registered placeholder (HEADLINE_PLACEHOLDERS.ko) so build-time and
// changeSourceLocale relocalization recognize it.
const TEMPLATE_LOCALE = 'ko'

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
      // Span pair: texts are per-slide (each normalized to its own page) —
      // the leader holds the left page's caption, the follower the right's.
      {
        template: 'text-bottom',
        background: REFERENCE_BG,
        deviceFrame: { show: true, model: 'iphone-16-pro', color: 'black', offsetX: 31, offsetY: 41, scale: 0.55, rotation: 28 },
        texts: [
          {
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 700, color: '#1C1C24', textAlign: 'left', letterSpacing: -2.2, lineHeight: 1 },
            pos: { x: 0.5084, y: 0.1704 },
            boxWidth: 0.8624,
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
            text: '헤드라인을 작성하세요',
            translations: {},
            style: { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 700, color: '#000000', textAlign: 'right', letterSpacing: -0.4, lineHeight: 1.22 },
            pos: { x: 0.471, y: 0.8873 },
            boxWidth: 0.8534,
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
      // Seed placeholder copy in the project's source locale (same mechanism
      // changeSourceLocale uses), so the template isn't welded to Korean.
      texts: structuredClone(s.texts).map((c) => ({
        ...c,
        text: relocalizePlaceholder(c.text, TEMPLATE_LOCALE, base.sourceLocale),
      })),
      badges: (s.badges ?? []).map((b) => ({
        ...structuredClone(b),
        id: newId('badge'),
        text: relocalizePlaceholder(b.text, TEMPLATE_LOCALE, base.sourceLocale),
      })),
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
 * One-time custom-store v2→v3 transform: templates saved before the span
 * text-ownership change carry every span caption on the leader in wide-canvas
 * coordinates. Split them into per-slide ownership (right-half captions move
 * to the follower, fractions renormalize to the owning page).
 */
export function migrateTemplateSpanTexts(tpl: ProjectTemplate): ProjectTemplate {
  const byGroup = new Map<string, { leader?: number; follower?: number }>()
  tpl.slides.forEach((s, i) => {
    if (!s.span) return
    const entry = byGroup.get(s.span.group) ?? {}
    entry[s.span.role] = i
    byGroup.set(s.span.group, entry)
  })
  let changed = false
  const slides = tpl.slides.slice()
  for (const { leader, follower } of byGroup.values()) {
    if (leader == null || follower == null) continue
    const { leaderTexts, followerTexts } = splitLeaderTexts(slides[leader].texts)
    slides[leader] = { ...slides[leader], texts: leaderTexts }
    slides[follower] = { ...slides[follower], texts: followerTexts }
    changed = true
  }
  return changed ? { ...tpl, slides } : tpl
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
    description: t('{n}장', { n: project.slides.length }),
    devices: project.devices,
    themeBackground: structuredClone(project.themeBackground),
    slides,
  }
}
