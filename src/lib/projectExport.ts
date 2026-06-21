// Reverse of projectImport: a live Project → an authored manifest (the file
// schema parseManifest reads) + a localize caption template, so an agent can
// bulk-extract or rewrite the text and re-import it. Lossy by nature — the
// manifest can't express per-locale look overrides, image backgrounds, custom
// fonts, cross-type frames, etc. — so everything that won't survive the
// round-trip is reported in `issues` rather than dropped silently. (Lossless
// edits are the surgical-patch path; this is for bulk text extract/rewrite.)
// Pure: no store/React/idb. Issue strings are plain English, like projectPatch.

import type {
  Background,
  Badge,
  Caption,
  DeviceFrame,
  DeviceType,
  Highlight,
  Ornament,
  Project,
  ScreenshotStyle,
  Slide,
} from '../types/project'
import { DEFAULT_BACKGROUND } from '../constants/defaults'
import { DEFAULT_MODEL, typeOfModel } from '../constants/deviceSpecs'
import { serializeTemplate, type SerializeRow } from './localeIO'

const DEFAULT_FONT_FAMILY = 'Pretendard'

export interface ProjectExportResult {
  /** Authored manifest (version 1) — round-trips through parseManifest. */
  manifest: Record<string, unknown>
  /** Localize template (CSV) carrying every text:N / badge:N field × locale. */
  captions: string
  /** Screenshot filenames to supply alongside on re-import (`{n}.{locale}.png`). */
  screenshotPlan: string[]
  /** Everything the manifest can't represent, so the loss is never silent. */
  issues: string[]
}

function reverseBackground(bg: Background, where: string, issues: string[]): Background | undefined {
  if (bg.type === 'image') {
    issues.push(`${where}: image background can't be expressed in a manifest — dropped`)
    return undefined
  }
  return structuredClone(bg)
}

function reverseDeviceFrame(df: DeviceFrame, where: string, issues: string[]): Record<string, unknown> {
  if (df.frameModel) issues.push(`${where}: deviceFrame.frameModel (cross-type frame) can't be expressed — dropped`)
  return {
    show: df.show,
    color: df.color,
    ...(df.offsetX !== undefined ? { offsetX: df.offsetX } : {}),
    ...(df.offsetY !== undefined ? { offsetY: df.offsetY } : {}),
    ...(df.scale !== undefined ? { scale: df.scale } : {}),
    ...(df.rotation !== undefined ? { rotation: df.rotation } : {}),
  }
}

function reverseScreenshotStyle(ss: ScreenshotStyle | undefined): Record<string, unknown> | undefined {
  if (!ss) return undefined
  return {
    cornerRadiusRatio: ss.cornerRadiusRatio,
    shadow: ss.shadow,
    ...(ss.crop ? { crop: { ...ss.crop } } : {}),
  }
}

function reverseOrnaments(orns: Ornament[] | undefined): Record<string, unknown>[] | undefined {
  if (!orns?.length) return undefined
  return orns.map((o) => ({ shape: o.shape, x: o.x, y: o.y, size: o.size, rotation: o.rotation, color: o.color, opacity: o.opacity }))
}

function reverseHighlights(hls: Highlight[] | undefined): Record<string, unknown>[] | undefined {
  if (!hls?.length) return undefined
  return hls.map((h) => ({ sourceRegion: { ...h.sourceRegion }, popup: { ...h.popup } }))
}

function reverseTextOverride(c: Caption, where: string, issues: string[]): Record<string, unknown> {
  const s = c.style
  if (s.fontFamily && s.fontFamily !== DEFAULT_FONT_FAMILY)
    issues.push(`${where}: fontFamily "${s.fontFamily}" can't be expressed — falls back to ${DEFAULT_FONT_FAMILY}`)
  if (s.box?.border) issues.push(`${where}: caption box border can't be expressed — dropped`)
  if (s.box?.shadow) issues.push(`${where}: caption box shadow can't be expressed — dropped`)
  return {
    fontSize: s.fontSize,
    color: s.color,
    weight: s.fontWeight,
    align: s.textAlign,
    ...(s.letterSpacing !== undefined ? { letterSpacing: s.letterSpacing } : {}),
    ...(s.lineHeight !== undefined ? { lineHeight: s.lineHeight } : {}),
    ...(s.fitToBox !== undefined ? { fitToBox: s.fitToBox } : {}),
    ...(c.pos ? { pos: { ...c.pos } } : {}),
    ...(c.boxWidth !== undefined ? { boxWidth: c.boxWidth } : {}),
    ...(s.box ? { box: { fill: s.box.fill, opacity: s.box.opacity, paddingX: s.box.paddingX, paddingY: s.box.paddingY, borderRadius: s.box.borderRadius } } : {}),
    ...(s.outline ? { outline: { color: s.outline.color, width: s.outline.width } } : {}),
    ...(s.shadow ? { shadow: { ...s.shadow } } : {}),
  }
}

function reverseBadge(b: Badge, where: string, issues: string[]): Record<string, unknown> {
  if (b.style.icon) issues.push(`${where}: badge icon/iconPosition can't be expressed — dropped`)
  return {
    ...(b.left !== undefined ? { left: b.left } : {}),
    top: b.top,
    style: {
      backgroundColor: b.style.backgroundColor,
      textColor: b.style.textColor,
      borderRadius: b.style.borderRadius,
      paddingX: b.style.paddingX,
      paddingY: b.style.paddingY,
      fontSize: b.style.fontSize,
      fontWeight: b.style.fontWeight,
    },
  }
}

function reverseSlide(slide: Slide, n: number, issues: string[]): Record<string, unknown> {
  const where = `slide ${n}`
  // A span follower's shared layers (background, device frame, screenshot,
  // ornaments, highlights, badges, per-locale look) are leader-owned and
  // ignored while grouped — reversing the follower's own (stale) copies would
  // emit phantom lossy-issues and write follower look that diverges from the
  // leader on re-import. Only its texts are per-slide.
  if (slide.spanGroupId && slide.spanRole === 'follower') {
    return {
      layout: slide.template,
      textBlocks: slide.texts.length,
      ...(slide.texts.length ? { texts: slide.texts.map((c, i) => reverseTextOverride(c, `${where} text:${i}`, issues)) } : {}),
      span: { group: slide.spanGroupId, role: slide.spanRole },
    }
  }
  if (slide.localeOverrides && Object.keys(slide.localeOverrides).length)
    issues.push(`${where}: per-locale look overrides (localeOverrides) can't be expressed — dropped (text translations stay in the caption file)`)
  if (slide.screenshot?.localeSource && Object.keys(slide.screenshot.localeSource).length)
    issues.push(`${where}: screenshot localeSource (borrowed-locale screenshots) can't be expressed — dropped`)
  const bg = reverseBackground(slide.background, where, issues)
  const ss = reverseScreenshotStyle(slide.screenshotStyle)
  const orn = reverseOrnaments(slide.ornaments)
  const hl = reverseHighlights(slide.highlights)
  return {
    layout: slide.template,
    textBlocks: slide.texts.length,
    deviceFrame: reverseDeviceFrame(slide.deviceFrame, where, issues),
    ...(bg ? { background: bg } : {}),
    ...(ss ? { screenshotStyle: ss } : {}),
    ...(orn ? { ornaments: orn } : {}),
    ...(slide.texts.length ? { texts: slide.texts.map((c, i) => reverseTextOverride(c, `${where} text:${i}`, issues)) } : {}),
    ...(hl ? { highlights: hl } : {}),
    ...(slide.badges?.length ? { badges: slide.badges.map((b, i) => reverseBadge(b, `${where} badge:${i}`, issues)) } : {}),
    ...(slide.spanGroupId && slide.spanRole ? { span: { group: slide.spanGroupId, role: slide.spanRole } } : {}),
  }
}

/**
 * Serialize a project back to a re-importable manifest + caption template.
 * The manifest is single-device (the import format is) — a project mixing
 * iPhone and iPad slides keeps only the dominant type and warns.
 */
export function exportProject(project: Project): ProjectExportResult {
  const issues: string[] = []

  // The manifest is single-device. Keep the DOMINANT (majority) type so the
  // fewest slides re-import under the wrong frame; ties keep first-seen order.
  const typeCounts = new Map<DeviceType, number>()
  for (const s of project.slides) {
    const ty = typeOfModel(s.deviceFrame.model)
    typeCounts.set(ty, (typeCounts.get(ty) ?? 0) + 1)
  }
  const device: DeviceType =
    [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? typeOfModel(DEFAULT_MODEL.iphone)
  const firstModel =
    project.slides.find((s) => typeOfModel(s.deviceFrame.model) === device)?.deviceFrame.model ??
    project.deviceModels?.[device] ??
    DEFAULT_MODEL[device]
  const types = new Set(typeCounts.keys())
  if (types.size > 1)
    issues.push(`project mixes ${[...types].join('/')} devices; the manifest keeps only ${device} — other slides re-import as ${device}`)

  const themeBackground =
    reverseBackground(project.themeBackground, 'themeBackground', issues) ?? structuredClone(DEFAULT_BACKGROUND)
  const targetLocales = [...new Set(project.targetLocales)].filter((l) => l !== project.sourceLocale)

  const manifest: Record<string, unknown> = {
    version: 1,
    name: project.name,
    device,
    deviceModel: firstModel,
    sourceLocale: project.sourceLocale,
    targetLocales,
    themeBackground,
    slides: project.slides.map((s, i) => reverseSlide(s, i + 1, issues)),
  }

  // One caption row per text:N / badge:N field; every locale is a labeled column.
  const rows: SerializeRow[] = []
  for (const slide of project.slides) {
    slide.texts.forEach((c, i) => rows.push({ slideId: slide.id, slideIndex: slide.index, field: `text:${i}`, sourceText: c.text }))
    slide.badges?.forEach((b, i) => rows.push({ slideId: slide.id, slideIndex: slide.index, field: `badge:${i}`, sourceText: b.text }))
  }
  const getCell = (slideId: string, field: string, locale: string): string => {
    const slide = project.slides.find((s) => s.id === slideId)
    if (!slide) return ''
    if (field.startsWith('text:')) return slide.texts[Number(field.slice(5))]?.translations[locale] ?? ''
    if (field.startsWith('badge:')) return slide.badges?.[Number(field.slice(6))]?.translations[locale] ?? ''
    return ''
  }
  const captions = serializeTemplate('csv', rows, getCell, project.sourceLocale, targetLocales)

  // Screenshots can't ride in the manifest — list the filenames the agent
  // supplies on re-import (the bulk-import naming convention).
  const screenshotPlan: string[] = []
  project.slides.forEach((s, i) => {
    // A span follower's screenshot is leader-owned — the leader's plan entry
    // covers both pages.
    if (!s.screenshot || s.spanRole === 'follower') return
    screenshotPlan.push(`${i + 1}.${project.sourceLocale}.png`)
    for (const loc of Object.keys(s.screenshot.localeOverrides ?? {})) screenshotPlan.push(`${i + 1}.${loc}.png`)
  })

  return { manifest, captions, screenshotPlan, issues }
}
