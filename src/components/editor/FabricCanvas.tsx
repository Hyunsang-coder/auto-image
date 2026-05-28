import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Canvas, IText } from 'fabric'
import type { Slide } from '../../types/project'
import { applyTemplate } from '../../canvas/templateLayouts'
import { LAYER_NAMES } from '../../canvas/layerNames'

export interface FabricCanvasHandle {
  undo: () => void
  redo: () => void
}

interface Props {
  activeSlide: Slide | null
  onSlideChange: (patch: Partial<Slide>) => void
}

const HISTORY_LIMIT = 50

export const FabricCanvas = forwardRef<FabricCanvasHandle, Props>(
  function FabricCanvas({ activeSlide, onSlideChange }, ref) {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<Canvas | null>(null)
    // History stacks store canvas object snapshots (with custom props)
    const undoStack = useRef<object[]>([])
    const redoStack = useRef<object[]>([])
    const isApplyingHistory = useRef(false)
    const prevSlideId = useRef<string | null>(null)
    const onSlideChangeRef = useRef(onSlideChange)
    const activeSlideRef = useRef(activeSlide)

    useEffect(() => {
      onSlideChangeRef.current = onSlideChange
    })
    useEffect(() => {
      activeSlideRef.current = activeSlide
    })

    function pushHistory(canvas: Canvas) {
      if (isApplyingHistory.current) return
      // toObject accepts propertiesToInclude for custom properties
      const snapshot = canvas.toObject(['layerName'])
      undoStack.current.push(snapshot)
      if (undoStack.current.length > HISTORY_LIMIT) {
        undoStack.current.shift()
      }
      redoStack.current = []
    }

    function syncToZustand(canvas: Canvas) {
      const slide = activeSlideRef.current
      if (!slide) return

      const objects = canvas.getObjects()
      const slidePatch: Partial<Slide> = {}

      for (const obj of objects) {
        const ln = (obj as IText & { layerName?: string }).layerName
        if (ln === LAYER_NAMES.HEADLINE || ln === LAYER_NAMES.SUBHEADLINE) {
          const itext = obj as IText
          const captionKey = ln === LAYER_NAMES.HEADLINE ? 'headline' : 'subheadline'
          const existing = slide[captionKey]
          slidePatch[captionKey] = {
            ...existing,
            text: itext.text ?? existing.text,
            style: {
              ...existing.style,
              fontSize: itext.fontSize ?? existing.style.fontSize,
              color: typeof itext.fill === 'string' ? itext.fill : existing.style.color,
              textAlign: (itext.textAlign as 'left' | 'center' | 'right') ?? existing.style.textAlign,
            },
          }
        }
      }

      if (Object.keys(slidePatch).length > 0) {
        onSlideChangeRef.current(slidePatch)
      }
    }

    useImperativeHandle(ref, () => ({
      undo() {
        const canvas = fabricRef.current
        if (!canvas || undoStack.current.length === 0) return
        isApplyingHistory.current = true

        const current = canvas.toObject(['layerName'])
        redoStack.current.push(current)

        const snapshot = undoStack.current.pop()!
        canvas.loadFromJSON(snapshot).then(() => {
          canvas.renderAll()
          isApplyingHistory.current = false
          syncToZustand(canvas)
        })
      },
      redo() {
        const canvas = fabricRef.current
        if (!canvas || redoStack.current.length === 0) return
        isApplyingHistory.current = true

        const current = canvas.toObject(['layerName'])
        undoStack.current.push(current)

        const snapshot = redoStack.current.pop()!
        canvas.loadFromJSON(snapshot).then(() => {
          canvas.renderAll()
          isApplyingHistory.current = false
          syncToZustand(canvas)
        })
      },
    }))

    // Initialize Fabric canvas once
    useEffect(() => {
      const el = canvasElRef.current
      if (!el) return

      const canvas = new Canvas(el, {
        selection: true,
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas

      canvas.on('object:modified', () => {
        pushHistory(canvas)
        syncToZustand(canvas)
      })

      // Sync text edits when editing exits
      canvas.on('text:editing:exited', () => {
        pushHistory(canvas)
        syncToZustand(canvas)
      })

      return () => {
        canvas.dispose()
        fabricRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Apply template when slide switches
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas || !activeSlide) return

      if (prevSlideId.current === activeSlide.id) return
      prevSlideId.current = activeSlide.id

      undoStack.current = []
      redoStack.current = []
      ;(async () => { await applyTemplate(canvas, activeSlide!) })()
    }, [activeSlide])

    // Re-render when slide data changes (without switching slide)
    const prevSlideDataRef = useRef<string>('')
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas || !activeSlide) return
      // Only re-render if this is the same slide but data changed
      if (prevSlideId.current !== activeSlide.id) return

      const serialized = JSON.stringify({
        background: activeSlide.background,
        template: activeSlide.template,
        headline: activeSlide.headline,
        subheadline: activeSlide.subheadline,
        deviceFrame: activeSlide.deviceFrame,
        screenshotKey: activeSlide.screenshot?.imageKey ?? null,
      })
      if (prevSlideDataRef.current === serialized) return
      prevSlideDataRef.current = serialized

      ;(async () => { await applyTemplate(canvas, activeSlide!) })()
    }, [activeSlide])

    return (
      <div className="relative flex items-start justify-center">
        <canvas ref={canvasElRef} />
      </div>
    )
  },
)
