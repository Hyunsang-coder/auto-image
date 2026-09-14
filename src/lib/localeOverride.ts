import type { Badge, Caption, CaptionOverride, LocaleOverride, Slide, TextStyle } from '../types/project'

// The write side of copy-on-write per-locale editing. The editor (panel +
// canvas) edits a *resolved* slide and emits a normal Partial<Slide>; this
// translates that into writes against the shared base so only what the user
// changed for this locale is stored. resolveSlideForLocale flattens it back.
//
// Per-locale: template, background, device transform, screenshot style,
// ornaments, shapes, caption text/style/placement, and badge text. Shared
// (passed straight to the base): badge layout, highlights, external images,
// and the base screenshot image.

const DEVICE_OVERRIDE_KEYS = ['show', 'offsetX', 'offsetY', 'scale', 'rotation', 'color'] as const
const SHARED_KEYS = ['externalImages', 'highlights', 'screenshot'] as const

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

function shallowStyleEqual(a: Badge['style'], b: Badge['style']): boolean {
  return (
    a.backgroundColor === b.backgroundColor &&
    a.textColor === b.textColor &&
    a.borderRadius === b.borderRadius &&
    a.paddingX === b.paddingX &&
    a.paddingY === b.paddingY &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.icon === b.icon &&
    a.iconPosition === b.iconPosition &&
    a.variant === b.variant &&
    a.stars === b.stars
  )
}

/**
 * Badge text is per-locale via `translations` (resolveSlideForLocale reads it),
 * while badge layout (position/style) is shared. A locale-mode edit of the
 * resolved array therefore splits: text diffs become translations, layout diffs
 * stay a base copy, and a structural change (add/remove/reorder) is a shared
 * edit that passes through whole. Returns undefined when nothing differs, so a
 * no-op panel emit doesn't dirty the project.
 */
function routeBadgePatch(baseBadges: Badge[], next: Badge[], locale: string): Badge[] | undefined {
  const sameShape =
    baseBadges.length === next.length && next.every((b, i) => b.id === baseBadges[i]?.id)
  if (!sameShape) return next
  let changed = false
  const out = next.map((b, i) => {
    const bb = baseBadges[i]
    let cur = bb
    const shown = bb.translations?.[locale] ?? bb.text
    if (typeof b.text === 'string' && b.text !== shown) {
      cur = { ...cur, translations: { ...cur.translations, [locale]: b.text } }
      changed = true
    }
    if (b.top !== bb.top || b.left !== bb.left || !shallowStyleEqual(b.style, bb.style)) {
      cur = { ...cur, top: b.top, left: b.left, style: b.style }
      changed = true
    }
    return cur
  })
  return changed ? out : undefined
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

  if (patch.texts) {
    // Text divergence → translations[locale] on the whole array (only diverged
    // indices get a new translation write); style/pos/boxWidth → next.texts[i].
    const prevTexts = prev.texts ?? {}
    const nextTexts: Record<number, CaptionOverride> = { ...prevTexts }
    let textArr: Caption[] | null = null
    let textsOvChanged = false
    patch.texts.forEach((pc, i) => {
      const baseCap = base.texts[i]
      if (!baseCap) return
      if (typeof pc.text === 'string') {
        const cur = baseCap.translations?.[locale] ?? baseCap.text
        if (pc.text !== cur) {
          if (!textArr) textArr = base.texts.slice()
          textArr[i] = { ...baseCap, translations: { ...baseCap.translations, [locale]: pc.text } }
        }
      }
      const co = captionOverride(baseCap, pc)
      if (co) {
        nextTexts[i] = {
          ...prevTexts[i],
          ...co,
          ...(co.style ? { style: { ...prevTexts[i]?.style, ...co.style } } : {}),
        }
        textsOvChanged = true
      }
    })
    if (textArr) result.texts = textArr
    if (textsOvChanged) { next.texts = nextTexts; ovChanged = true }
  }

  if (patch.template != null && patch.template !== base.template) { next.template = patch.template; ovChanged = true }
  if (patch.background) { next.background = patch.background; ovChanged = true }
  if (patch.screenshotStyle) { next.screenshotStyle = patch.screenshotStyle; ovChanged = true }
  if (patch.ornaments) { next.ornaments = patch.ornaments; ovChanged = true }
  if (patch.shapes) { next.shapes = patch.shapes; ovChanged = true }
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
  // Badges split: text is per-locale, layout is shared (see routeBadgePatch).
  for (const key of SHARED_KEYS) {
    if (patch[key] !== undefined) (result as Record<string, unknown>)[key] = patch[key]
  }
  if (patch.badges) {
    const routed = routeBadgePatch(base.badges ?? [], patch.badges, locale)
    if (routed) result.badges = routed
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
