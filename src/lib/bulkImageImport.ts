// Shared bulk screenshot-import core, used by both the Localize page (step 3)
// and the Editor's ScreenshotPanel (step 2). Pure-ish: it parses filenames,
// routes base vs per-locale override by the project's sourceLocale, persists
// blobs to IndexedDB, and RETURNS the per-slide patches + warnings without
// touching the store. Callers apply the patches (`updateSlides`) and auto-add
// any new override locales. Behavior mirrors the original LocalizeEditor
// handler exactly, including base-before-override ordering, the device-match
// skip-with-warning, dedupe, the "override needs a base" skip, and locale
// auto-add.

import type { Slide } from '../types/project'
import { fileToImageKey } from './imageStore'
import { parseImageName } from './imageImport'
import { detectDeviceFromAspect } from '../constants/deviceSpecs'

export interface BulkImageImportResult {
  /** Per-slide screenshot patch, keyed by slide id — apply via `updateSlides`. */
  patches: Record<string, Partial<Slide>>
  /** Override locales seen that the caller should add to `targetLocales`. */
  addedLocales: string[]
  /** Number of files successfully routed onto a slide. */
  applied: number
  /** Human-readable warnings (skips, dupes, unreadable files, bad names). */
  issues: string[]
}

const devLabel = (m: string) => (m === 'ipad-pro-13' ? 'iPad' : 'iPhone')

/**
 * Import a batch of screenshot files. `slides` is the current slide snapshot,
 * `sourceLocale` decides which locale lands as the slide base, and `knownLocales`
 * is the set of supported locale codes. `labelOf` formats a locale code for
 * warnings. Returns the patches/issues for the caller to apply.
 */
export async function importBulkImages(
  files: File[],
  opts: {
    slides: Slide[]
    sourceLocale: string
    targetLocales: string[]
    knownLocales: Set<string>
    labelOf: (code: string) => string
  },
): Promise<BulkImageImportResult> {
  const { sourceLocale, targetLocales, knownLocales, labelOf } = opts
  const issues: string[] = []

  // Every file carries a locale; the one matching the project's sourceLocale
  // becomes the slide's base screenshot, the rest become per-locale overrides.
  // Two files landing on the same slot would silently clobber, so detect that
  // and keep the first deterministically.
  const parsedTargets: { file: File; slide: number; locale?: string }[] = []
  for (const file of files) {
    const parsed = parseImageName(file.name, knownLocales)
    if ('error' in parsed) issues.push(parsed.error)
    else
      parsedTargets.push({
        file,
        slide: parsed.slide,
        locale: parsed.locale === sourceLocale ? undefined : parsed.locale,
      })
  }
  const bySlot = new Map<string, (typeof parsedTargets)[number]>()
  for (const t of parsedTargets) {
    const key = `${t.slide}:${t.locale ?? 'base'}`
    const prev = bySlot.get(key)
    if (!prev) {
      bySlot.set(key, t)
      continue
    }
    issues.push(
      `슬라이드 ${t.slide} ${t.locale ?? '기준 언어'} 중복 — "${t.file.name}" 무시, "${prev.file.name}" 사용`,
    )
  }
  // Base screenshots before overrides so an override can attach to a base
  // imported in the same batch.
  const targets = [...bySlot.values()].sort((a, b) => (a.locale ? 1 : 0) - (b.locale ? 1 : 0))

  // Working copy of slides so an override sees a base patched earlier in the
  // batch (mirrors the original loop's live getState() re-read), and so two
  // overrides on the same slide compose into one localeOverrides map.
  const working = new Map(opts.slides.map((s) => [s.id, s] as const))
  const byIndex = opts.slides // 1-based slideNum -> index slideNum-1
  const patches: Record<string, Partial<Slide>> = {}
  const overrideLocalesSeen = new Set<string>()
  let applied = 0

  for (const { file, slide: slideNum, locale } of targets) {
    const base = byIndex[slideNum - 1]
    const slide = base ? working.get(base.id) : undefined
    if (!slide) {
      issues.push(`슬라이드 ${slideNum} 없음: "${file.name}"`)
      continue
    }
    if (!locale && slide.template === 'hero') {
      issues.push(`슬라이드 ${slideNum}는 텍스트 전용(hero)이라 스크린샷 불가`)
      continue
    }
    if (locale && !slide.screenshot) {
      issues.push(
        `슬라이드 ${slideNum}: 기준 언어(${labelOf(sourceLocale)}) 스크린샷이 없어 ${labelOf(locale)} 추가본을 붙일 수 없음`,
      )
      continue
    }
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      issues.push(`이미지를 읽을 수 없음: "${file.name}"`)
      continue
    }
    const { key, width, height } = result
    const detected = detectDeviceFromAspect(width, height)
    // Don't let a stray file from the other device's set silently overwrite a
    // populated slide and flip its device (e.g. an iPad shot landing on an
    // iPhone slide). An empty base slot is the first upload, so it may set the
    // device; overrides must match the slide's existing device.
    if ((locale || slide.screenshot) && detected !== slide.deviceFrame.model) {
      issues.push(
        `슬라이드 ${slideNum}(${devLabel(slide.deviceFrame.model)})에 ${devLabel(detected)} 이미지 — 건너뜀: "${file.name}"`,
      )
      continue
    }
    let patch: Partial<Slide>
    if (!locale) {
      patch = {
        screenshot: {
          id: key,
          imageKey: key,
          originalWidth: width,
          originalHeight: height,
          ...(slide.screenshot?.localeOverrides && {
            localeOverrides: slide.screenshot.localeOverrides,
          }),
        },
        ...(detected !== slide.deviceFrame.model && {
          deviceFrame: { ...slide.deviceFrame, model: detected },
        }),
      }
    } else {
      patch = {
        screenshot: {
          ...slide.screenshot!,
          localeOverrides: {
            ...slide.screenshot!.localeOverrides,
            [locale]: { imageKey: key, originalWidth: width, originalHeight: height },
          },
        },
      }
      overrideLocalesSeen.add(locale)
    }
    // Compose onto the working copy so later targets for this slide (a second
    // override, or an override after this base) build on the fresh screenshot.
    const merged = { ...slide, ...patch }
    working.set(slide.id, merged)
    patches[slide.id] = { ...patches[slide.id], ...patch }
    applied++
  }

  const addedLocales = [...overrideLocalesSeen].filter((l) => !targetLocales.includes(l))
  return { patches, addedLocales, applied, issues }
}
