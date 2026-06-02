import { useEffect, useRef, useState } from 'react'
import type { DeviceType, Slide } from '../../types/project'
import { renderSlide, renderSpanGroup } from '../../lib/renderSlide'

const THUMB_WIDTH = 220
const DEBOUNCE_MS = 300

function deviceOf(slide: Slide): DeviceType {
  return slide.deviceFrame.model === 'ipad-pro-13' ? 'ipad' : 'iphone'
}

function leaderOf(slide: Slide, slides: Slide[]): Slide | undefined {
  if (slide.spanRole === 'leader') return slide
  return slides.find((s) => s.spanGroupId === slide.spanGroupId && s.spanRole === 'leader')
}

// A slide re-renders only when its render-relevant data changes. For span
// followers the pixels come from the leader, so fold the leader's content (and
// which half) into the key instead of the follower's own (mostly empty) data.
function renderKey(slide: Slide, slides: Slide[], locale: string): string {
  if (slide.spanGroupId) {
    const leader = leaderOf(slide, slides)
    return JSON.stringify({ locale, role: slide.spanRole, leader: leader ?? null })
  }
  return JSON.stringify({ locale, slide })
}

/**
 * Live-rendered thumbnails for the slide list, one PNG per slide for the given
 * locale ('' = base). Renders are debounced and cached by a content hash, so
 * editing one slide only re-renders that slide; unchanged thumbnails are reused.
 * Returns a slideId → object-URL map (undefined while a thumbnail is rendering).
 */
export function useSlideThumbnails(
  slides: Slide[],
  locale: string,
): Record<string, string | undefined> {
  const [thumbs, setThumbs] = useState<Record<string, string | undefined>>({})
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
      // edited slide whose new thumbnail isn't ready yet — keep showing.
      const next: Record<string, string | undefined> = {}
      for (const slide of slides) {
        const key = renderKey(slide, slides, locale)
        usedKeys.add(key)
        next[slide.id] = cache.get(key) ?? thumbsRef.current[slide.id]
      }
      if (cancelled) return
      commit({ ...next })

      for (const slide of slides) {
        if (cancelled) return
        const key = renderKey(slide, slides, locale)
        if (cache.has(key)) continue
        try {
          const device = deviceOf(slide)
          let blob: Blob
          if (slide.spanGroupId) {
            const leader = leaderOf(slide, slides)
            if (!leader) continue
            const halves = await renderSpanGroup(leader, device, renderLocale, THUMB_WIDTH)
            blob = slide.spanRole === 'leader' ? halves.leader : halves.follower
          } else {
            blob = await renderSlide(slide, device, renderLocale, THUMB_WIDTH)
          }
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          cache.set(key, url)
          next[slide.id] = url
          commit({ ...next })
        } catch {
          // Leave the carried-over (or undefined) thumbnail in place.
        }
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
  }, [slides, locale])

  // Revoke everything on unmount.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  return thumbs
}
