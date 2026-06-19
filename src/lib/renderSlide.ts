import { Canvas } from 'fabric'
import type { Slide } from '../types/project'
import { DEVICE_SPECS, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'
import { applyTemplate } from '../canvas/templateLayouts'
import { createImageUrlCache } from './imageStore'
import { encodeOpaquePng } from './encodePng'
import { resolveSlideForLocale } from './resolveSlide'
import { awaitSlideFonts } from './fonts'
import { captureLayoutReportEntry, type LayoutReportEntry } from './layoutReport'

// Scale must stay exact (no rounding) and letterSpacing must NOT be scaled:
// Fabric's charSpacing is em-relative so it already tracks fontSize, and
// rounding fontSize at non-integer scales (thumbnail 0.5×, iPad ~4.7×) shifts
// wrap/fit/grapheme decisions away from what the 1× editor canvas shows.
export function withScaledFonts(slide: Slide, scale: number): Slide {
  return {
    ...slide,
    texts: slide.texts.map((c) => ({
      ...c,
      style: {
        ...c.style,
        fontSize: c.style.fontSize * scale,
        ...(c.style.outline && {
          outline: { ...c.style.outline, width: c.style.outline.width * scale },
        }),
        ...(c.style.shadow && {
          shadow: {
            ...c.style.shadow,
            offsetX: c.style.shadow.offsetX * scale,
            offsetY: c.style.shadow.offsetY * scale,
            blur: c.style.shadow.blur * scale,
          },
        }),
        ...(c.style.box && {
          box: {
            ...c.style.box,
            paddingX: c.style.box.paddingX * scale,
            paddingY: c.style.box.paddingY * scale,
            borderRadius: c.style.box.borderRadius * scale,
            ...(c.style.box.border && {
              border: { ...c.style.box.border, width: c.style.box.border.width * scale },
            }),
            ...(c.style.box.shadow && {
              shadow: {
                ...c.style.box.shadow,
                offsetX: c.style.box.shadow.offsetX * scale,
                offsetY: c.style.box.shadow.offsetY * scale,
                blur: c.style.box.shadow.blur * scale,
              },
            }),
          },
        }),
      },
    })),
    badges: slide.badges.map((b) => ({
      ...b,
      style: {
        ...b.style,
        fontSize: b.style.fontSize * scale,
        paddingX: b.style.paddingX * scale,
        paddingY: b.style.paddingY * scale,
        borderRadius: b.style.borderRadius * scale,
      },
    })),
  }
}

export interface RenderedSlideWithReport {
  blob: Blob
  report: LayoutReportEntry
}

async function renderSlideResult(
  slide: Slide,
  locale: string | null,
  previewWidth?: number,
  reportLocale?: string,
): Promise<{ blob: Blob; report?: LayoutReportEntry }> {
  const spec = DEVICE_SPECS[slide.deviceFrame.model]
  const width = previewWidth ?? spec.exportWidth
  const height = previewWidth
    ? Math.round(previewWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  const scale = width / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(resolveSlideForLocale(slide, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    // Fonts must be loaded BEFORE applyTemplate: it measures text for fit-to-box
    // sizing and badge width, and Fabric caches those dimensions at layout time
    // (a later renderAll repaints glyphs but won't recompute them). Measuring
    // against an unloaded Noto JP would bake fallback-font metrics into the export.
    await awaitSlideFonts(exportSlide)
    await applyTemplate(canvas, exportSlide, { width, height }, { resolveUrl: urls.get })

    const report = reportLocale
      ? captureLayoutReportEntry(canvas, {
          slide: exportSlide,
          locale: reportLocale,
          page: { x: 0, y: 0, width, height },
        })
      : undefined
    return { blob: encodeOpaquePng(el), report }
  } finally {
    canvas.dispose()
    urls.revokeAll()
  }
}

export async function renderSlide(
  slide: Slide,
  locale: string | null,
  previewWidth?: number,
): Promise<Blob> {
  return (await renderSlideResult(slide, locale, previewWidth)).blob
}

export async function renderSlideWithReport(
  slide: Slide,
  locale: string | null,
  reportLocale: string,
  previewWidth?: number,
): Promise<RenderedSlideWithReport> {
  const result = await renderSlideResult(slide, locale, previewWidth, reportLocale)
  if (!result.report) throw new Error('layout report was not produced')
  return { blob: result.blob, report: result.report }
}

/**
 * Render a 2-page span group: produces a single 2×-wide canvas — the leader's
 * shared layers plus each slide's own texts on its own page — then slices it
 * into two device-sized PNGs. Sequential render → cheaper than two separate
 * full renders, and guarantees objects crossing the seam (device frame, text)
 * line up pixel-perfect across the split.
 */
export interface RenderedSpanGroupWithReport {
  leader: Blob
  follower: Blob
  reports: [LayoutReportEntry, LayoutReportEntry]
}

async function renderSpanGroupResult(
  leader: Slide,
  follower: Slide,
  locale: string | null,
  previewHalfWidth?: number,
  reportLocale?: string,
): Promise<{ leader: Blob; follower: Blob; reports?: [LayoutReportEntry, LayoutReportEntry] }> {
  const spec = DEVICE_SPECS[leader.deviceFrame.model]
  const halfWidth = previewHalfWidth ?? spec.exportWidth
  const fullWidth = halfWidth * 2
  const height = previewHalfWidth
    ? Math.round(previewHalfWidth * spec.exportHeight / spec.exportWidth)
    : spec.exportHeight
  // The editor renders grouped slides on a 2× canvas (880px wide); each axis
  // scales by the same single-slide ratio (halfWidth / EDITOR_CANVAS_WIDTH).
  const scale = halfWidth / EDITOR_CANVAS_WIDTH
  const exportSlide = withScaledFonts(resolveSlideForLocale(leader, locale), scale)
  const exportFollower = withScaledFonts(resolveSlideForLocale(follower, locale), scale)

  const el = document.createElement('canvas')
  const canvas = new Canvas(el, { enableRetinaScaling: false })
  const urls = createImageUrlCache()

  try {
    // Load fonts before layout — applyTemplate measures text for fit/badge sizing
    // and Fabric won't recompute those dimensions on a later render (see renderSlide).
    await awaitSlideFonts(exportSlide)
    await awaitSlideFonts(exportFollower)
    await applyTemplate(canvas, exportSlide, { width: fullWidth, height }, {
      spanCentered: true,
      resolveUrl: urls.get,
      spanFollower: { texts: exportFollower.texts, template: exportFollower.template },
    })

    // Slice — read pixel data from the wide DOM canvas (Fabric writes its render
    // there) into two half-size canvases, then toBlob each.
    const makeHalf = (sourceOffset: number): Blob => {
      const half = document.createElement('canvas')
      half.width = halfWidth
      half.height = height
      const ctx = half.getContext('2d')!
      ctx.drawImage(el, -sourceOffset, 0)
      return encodeOpaquePng(half)
    }
    const leftBlob = makeHalf(0)
    const rightBlob = makeHalf(halfWidth)
    const groupId = leader.spanGroupId ?? follower.spanGroupId ?? ''
    const reports = reportLocale
      ? [
          captureLayoutReportEntry(canvas, {
            slide: exportSlide,
            locale: reportLocale,
            page: { x: 0, y: 0, width: halfWidth, height },
            span: { groupId, role: 'leader', seamX: halfWidth },
            ownerSlides: { leader: exportSlide, follower: exportFollower },
          }),
          captureLayoutReportEntry(canvas, {
            slide: exportFollower,
            locale: reportLocale,
            page: { x: halfWidth, y: 0, width: halfWidth, height },
            span: { groupId, role: 'follower', seamX: halfWidth },
            ownerSlides: { leader: exportSlide, follower: exportFollower },
          }),
        ] as [LayoutReportEntry, LayoutReportEntry]
      : undefined

    return { leader: leftBlob, follower: rightBlob, reports }
  } finally {
    canvas.dispose()
    urls.revokeAll()
  }
}

export async function renderSpanGroup(
  leader: Slide,
  follower: Slide,
  locale: string | null,
  previewHalfWidth?: number,
): Promise<{ leader: Blob; follower: Blob }> {
  const { reports, ...blobs } = await renderSpanGroupResult(leader, follower, locale, previewHalfWidth)
  void reports
  return blobs
}

export async function renderSpanGroupWithReport(
  leader: Slide,
  follower: Slide,
  locale: string | null,
  reportLocale: string,
  previewHalfWidth?: number,
): Promise<RenderedSpanGroupWithReport> {
  const result = await renderSpanGroupResult(leader, follower, locale, previewHalfWidth, reportLocale)
  if (!result.reports) throw new Error('layout report was not produced')
  return { leader: result.leader, follower: result.follower, reports: result.reports }
}
