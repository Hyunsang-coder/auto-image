import type { Caption, CaptionOverride, LocaleOverride, Slide, TextStyle } from '../types/project'

// The write side of copy-on-write per-locale editing. The editor (panel +
// canvas) edits a *resolved* slide and emits a normal Partial<Slide>; this
// translates that into writes against the shared base so only what the user
// changed for this locale is stored. resolveSlideForLocale flattens it back.
//
// Per-locale: template, background, device transform, screenshot style, and
// caption text/style/placement. Shared (passed straight to the base): badges,
// ornaments, highlights, and the base screenshot image — their text stays
// per-locale via Caption.translations.

const CAPTION_KEYS = ['headline', 'subheadline'] as const
const DEVICE_OVERRIDE_KEYS = ['offsetX', 'offsetY', 'scale', 'rotation', 'color'] as const
const SHARED_KEYS = ['badges', 'ornaments', 'highlights', 'screenshot'] as const

// Only the style props that actually differ from the base, so changing one
// (e.g. font size) doesn't freeze the rest (e.g. colour) against base edits.
function diffStyle(base: TextStyle, next?: Partial<TextStyle>): Partial<TextStyle> | undefined {
  if (!next) return undefined
  const out: Record<string, unknown> = {}
  const b = base as unknown as Record<string, unknown>
  const n = next as Record<string, unknown>
  let changed = false
  for (const k of Object.keys(n)) {
    if (n[k] !== b[k]) { out[k] = n[k]; changed = true }
  }
  return changed ? (out as Partial<TextStyle>) : undefined
}

function captionOverride(base: Caption, patch: Caption): CaptionOverride | null {
  const ov: CaptionOverride = {}
  let changed = false
  const style = diffStyle(base.style, patch.style)
  if (style) { ov.style = style; changed = true }
  if (patch.pos) { ov.pos = patch.pos; changed = true }
  if (patch.boxWidth != null) { ov.boxWidth = patch.boxWidth; changed = true }
  return changed ? ov : null
}

/**
 * Convert an editor patch (relative to the locale-resolved slide) into writes
 * against the shared base: caption text → translations[locale], everything
 * per-locale → localeOverrides[locale], shared elements straight to the base.
 * Merges onto existing overrides and leaves other locales untouched.
 */
export function routeLocalePatch(base: Slide, locale: string, patch: Partial<Slide>): Partial<Slide> {
  const result: Partial<Slide> = {}
  const prev: LocaleOverride = base.localeOverrides?.[locale] ?? {}
  const next: LocaleOverride = { ...prev }
  let ovChanged = false

  for (const key of CAPTION_KEYS) {
    const pc = patch[key]
    if (!pc) continue
    if (typeof pc.text === 'string') {
      const cur = base[key].translations?.[locale] ?? base[key].text
      if (pc.text !== cur) {
        result[key] = { ...base[key], translations: { ...base[key].translations, [locale]: pc.text } }
      }
    }
    const co = captionOverride(base[key], pc)
    if (co) {
      next[key] = {
        ...prev[key],
        ...co,
        ...(co.style ? { style: { ...prev[key]?.style, ...co.style } } : {}),
      }
      ovChanged = true
    }
  }

  if (patch.template != null && patch.template !== base.template) { next.template = patch.template; ovChanged = true }
  if (patch.background) { next.background = patch.background; ovChanged = true }
  if (patch.screenshotStyle) { next.screenshotStyle = patch.screenshotStyle; ovChanged = true }
  if (patch.deviceFrame) {
    const df: Record<string, unknown> = { ...prev.deviceFrame }
    const pd = patch.deviceFrame as unknown as Record<string, unknown>
    let dfChanged = false
    for (const k of DEVICE_OVERRIDE_KEYS) {
      if (pd[k] != null) { df[k] = pd[k]; dfChanged = true }
    }
    if (dfChanged) { next.deviceFrame = df as LocaleOverride['deviceFrame']; ovChanged = true }
  }

  // Shared elements edit the base directly (apply to every locale).
  for (const key of SHARED_KEYS) {
    if (patch[key] !== undefined) (result as Record<string, unknown>)[key] = patch[key]
  }

  if (ovChanged) {
    result.localeOverrides = { ...base.localeOverrides, [locale]: next }
  }
  return result
}

/** Drop a locale's overrides so it falls back to the shared base. */
export function clearLocaleOverride(base: Slide, locale: string): Partial<Slide> {
  if (!base.localeOverrides?.[locale]) return {}
  const next = { ...base.localeOverrides }
  delete next[locale]
  return { localeOverrides: next }
}
