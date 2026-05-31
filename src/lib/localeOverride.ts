import type { Caption, CaptionLayout, LocaleLayout, Slide } from '../types/project'

// The write side of copy-on-write per-locale editing. The canvas edits a
// *resolved* slide (base + this locale's overrides) and emits a normal
// Partial<Slide> patch; these helpers translate that into writes against the
// shared base slide so only what the user actually changed for this locale is
// stored. resolveSlideForLocale is the read side that flattens it back.

const CAPTION_KEYS = ['headline', 'subheadline'] as const

// Geometry the canvas can change for a caption in locale mode. Font size is
// intentionally not captured here (auto-fit makes the synced size ambiguous);
// per-locale font size is a later, explicit control.
function captionGeometry(prev: CaptionLayout | undefined, patch: Caption): CaptionLayout | null {
  const next: CaptionLayout = { ...prev }
  let changed = false
  if (patch.pos) { next.pos = patch.pos; changed = true }
  if (patch.boxWidth != null) { next.boxWidth = patch.boxWidth; changed = true }
  return changed ? next : null
}

/**
 * Convert a canvas patch (relative to the locale-resolved slide) into override
 * writes against the shared base. Returns a Partial<Slide> ready for the store:
 * text edits land in `translations[locale]`, caption placement and the device
 * transform land in `localeLayout[locale]`. Anything the patch didn't carry is
 * left untouched, so other locales and the shared base are preserved.
 */
export function routeLocalePatch(base: Slide, locale: string, patch: Partial<Slide>): Partial<Slide> {
  const result: Partial<Slide> = {}
  const prevLayout: LocaleLayout = base.localeLayout?.[locale] ?? {}
  const nextLayout: LocaleLayout = { ...prevLayout }
  let layoutChanged = false

  for (const key of CAPTION_KEYS) {
    const pc = patch[key]
    if (!pc) continue
    // Text → translations[locale], but only when it differs from what this
    // locale currently shows (its translation, or the base text as fallback).
    if (typeof pc.text === 'string') {
      const current = base[key].translations?.[locale] ?? base[key].text
      if (pc.text !== current) {
        result[key] = {
          ...base[key],
          translations: { ...base[key].translations, [locale]: pc.text },
        }
      }
    }
    const geo = captionGeometry(prevLayout[key], pc)
    if (geo) { nextLayout[key] = geo; layoutChanged = true }
  }

  if (patch.deviceFrame) {
    const d = patch.deviceFrame
    const df = { ...prevLayout.deviceFrame }
    if (d.offsetX != null) df.offsetX = d.offsetX
    if (d.offsetY != null) df.offsetY = d.offsetY
    if (d.scale != null) df.scale = d.scale
    if (d.rotation != null) df.rotation = d.rotation
    nextLayout.deviceFrame = df
    layoutChanged = true
  }

  if (layoutChanged) {
    result.localeLayout = { ...base.localeLayout, [locale]: nextLayout }
  }
  return result
}

/** Drop a locale's layout overrides so it falls back to the shared base. */
export function clearLocaleLayout(base: Slide, locale: string): Partial<Slide> {
  if (!base.localeLayout?.[locale]) return {}
  const next = { ...base.localeLayout }
  delete next[locale]
  return { localeLayout: next }
}
