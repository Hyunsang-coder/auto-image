import { useCallback, useRef } from 'react'
import type { Canvas, FabricObject, IText } from 'fabric'
import type { Slide } from '../types/project'
import { LAYER_NAMES } from './layerNames'

interface UseCanvasSyncOptions {
  fabricRef: React.RefObject<Canvas | null>
  activeSlide: Slide | null
  onSlideChange?: (patch: Partial<Slide>) => void
}

function getLayerName(obj: FabricObject): string | undefined {
  return (obj as FabricObject & { layerName?: string }).layerName
}

export function useCanvasSync(opts: UseCanvasSyncOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncToZustand = useCallback(() => {
    const canvas = opts.fabricRef.current
    if (!canvas || !opts.activeSlide || !opts.onSlideChange) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      doSync(canvas, opts.activeSlide!, opts.onSlideChange!)
    }, 300)
  }, [opts])

  return { syncToZustand }
}

function doSync(
  canvas: Canvas,
  activeSlide: Slide,
  onSlideChange: (patch: Partial<Slide>) => void,
) {
  const objects = canvas.getObjects()

  let headlinePatch: Partial<Slide['headline']> | null = null
  let subheadlinePatch: Partial<Slide['subheadline']> | null = null

  for (const obj of objects) {
    const ln = getLayerName(obj)
    if (ln === LAYER_NAMES.HEADLINE || ln === LAYER_NAMES.SUBHEADLINE) {
      const itext = obj as IText
      const text = itext.text ?? ''
      const patch = {
        text,
        style: {
          ...activeSlide[ln === LAYER_NAMES.HEADLINE ? 'headline' : 'subheadline'].style,
          fontSize: itext.fontSize ?? activeSlide.headline.style.fontSize,
          color: typeof itext.fill === 'string' ? itext.fill : activeSlide.headline.style.color,
          textAlign: (itext.textAlign as 'left' | 'center' | 'right') ?? 'center',
        },
      }
      if (ln === LAYER_NAMES.HEADLINE) {
        headlinePatch = patch
      } else {
        subheadlinePatch = patch
      }
    }
  }

  const slidePatch: Partial<Slide> = {}
  if (headlinePatch) {
    slidePatch.headline = { ...activeSlide.headline, ...headlinePatch }
  }
  if (subheadlinePatch) {
    slidePatch.subheadline = { ...activeSlide.subheadline, ...subheadlinePatch }
  }

  if (Object.keys(slidePatch).length > 0) {
    onSlideChange(slidePatch)
  }
}
