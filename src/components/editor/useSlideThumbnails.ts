import { useEffect, useRef, useState } from 'react'
import type { Slide } from '../../types/project'
import { renderSlide, renderSpanGroup } from '../../lib/renderSlide'

const DEBOUNCE_MS = 300

/** Rendered width of the slide-tray / canvas-board thumbnails, in px. */
export const THUMB_WIDTH = 220

function spanMemberOf(slide: Slide, slides: Slide[], role: 'leader' | 'follower'): Slide | undefined {
  if (slide.spanRole === role) return slide
  return slides.find((s) => s.spanGroupId === slide.spanGroupId && s.spanRole === role)
}

// Cache identity for one rendered slide. A stale key means the preview shows
// pixels that no longer match the project — which, on the export step, is what
// the user checks before shipping. A slide re-renders only when its
// render-relevant data changes. For span
// members the pixels come from one shared wide render (leader's layers + both
// slides' texts), so fold both members' content (and which half) into the key
// instead of just the slide's own data.
export function renderKey(slide: Slide, slides: Slide[], locale: string, width?: number): string {
  if (slide.spanGroupId) {
    const leader = spanMemberOf(slide, slides, 'leader')
    const follower = spanMemberOf(slide, slides, 'follower')
    return JSON.stringify({
      locale,
      width,
      role: slide.spanRole,
      leader: leader ?? null,
      follower: follower ?? null,
    })
  }
  return JSON.stringify({ locale, width, slide })
}

/**
 * Live-rendered previews of every slide for the given locale ('' = base), one
 * PNG each. Renders are debounced and cached by a content hash, so editing one
 * slide only re-renders that slide; unchanged images are reused. Each finished
 * render commits on its own, so a run cut short by an edit still leaves every
 * image it had already produced on screen.
 *
 * `width` is the rendered pixel width; omit it for full export resolution
 * (byte-identical to the exported PNG — absolute-pixel constants like the
 * fit-to-box floor otherwise diverge between preview and export scale).
 *
 * Returns a slideId → object-URL map (undefined while an image has never been
 * rendered) plus whether a render is still outstanding.
 */
export function useSlideThumbnails(
  slides: Slide[],
  locale: string,
  width?: number,
): { thumbs: Record<string, string | undefined>; rendering: boolean } {
  const [thumbs, setThumbs] = useState<Record<string, string | undefined>>({})
  const [rendering, setRendering] = useState(false)
  // key → object URL, kept across renders; entries are revoked when their key
  // is no longer referenced by any slide.
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Mirror of `thumbs` so a run can carry over previous URLs (avoids a
  // placeholder flash on the edited slide) without depending on state.
  const thumbsRef = useRef(thumbs)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(run, DEBOUNCE_MS)

    function commit(next: Record<string, string | undefined>) {
      thumbsRef.current = next
      setThumbs(next)
    }

    async function run() {
      const cache = cacheRef.current
      const renderLocale = locale || null
      const usedKeys = new Set<string>()
      // Carry over the previous render's URLs so unchanged slides — and an
      // edited slide whose new image isn't ready yet — keep showing.
      const next: Record<string, string | undefined> = {}
      const todo: Slide[] = []
      for (const slide of slides) {
        const key = renderKey(slide, slides, locale, width)
        usedKeys.add(key)
        const hit = cache.get(key)
        next[slide.id] = hit ?? thumbsRef.current[slide.id]
        if (!hit) todo.push(slide)
      }
      if (cancelled) return
      commit({ ...next })
      setRendering(todo.length > 0)

      try {
        for (const slide of todo) {
          if (cancelled) return
          const key = renderKey(slide, slides, locale, width)
          try {
            let blob: Blob
            if (slide.spanGroupId) {
              const leader = spanMemberOf(slide, slides, 'leader')
              const follower = spanMemberOf(slide, slides, 'follower')
              if (!leader || !follower) continue
              const halves = await renderSpanGroup(leader, follower, renderLocale, width)
              blob = slide.spanRole === 'leader' ? halves.leader : halves.follower
            } else {
              blob = await renderSlide(slide, renderLocale, width)
            }
            if (cancelled) return
            const url = URL.createObjectURL(blob)
            cache.set(key, url)
            next[slide.id] = url
            commit({ ...next })
          } catch {
            // Leave the carried-over (or undefined) image in place.
          }
        }
      } finally {
        // A superseded run returns above without clearing this; the run that
        // superseded it owns the flag from its own setRendering(true).
        if (!cancelled) setRendering(false)
      }

      // Drop + revoke cache entries no slide references anymore.
      for (const [k, url] of cache) {
        if (!usedKeys.has(k)) {
          URL.revokeObjectURL(url)
          cache.delete(k)
        }
      }
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slides, locale, width])

  // Revoke everything on unmount.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  return { thumbs, rendering }
}
