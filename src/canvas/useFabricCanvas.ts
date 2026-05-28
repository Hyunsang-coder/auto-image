import { useEffect, useRef, useCallback } from 'react'
import { Canvas } from 'fabric'
import type { Slide } from '../types/project'
import { applyTemplate } from './templateLayouts'
import { useCanvasSync } from './useCanvasSync'

const HISTORY_LIMIT = 50

interface UseFabricCanvasOptions {
  activeSlide: Slide | null
  onSlideChange?: (patch: Partial<Slide>) => void
}

interface FabricCanvasHandle {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  undo: () => void
  redo: () => void
}

export function useFabricCanvas(
  opts: UseFabricCanvasOptions,
): FabricCanvasHandle {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)

  // History stacks: each entry is canvas object snapshot
  const undoStack = useRef<object[]>([])
  const redoStack = useRef<object[]>([])
  const isApplyingHistory = useRef(false)

  const { syncToZustand } = useCanvasSync({
    fabricRef,
    activeSlide: opts.activeSlide,
    onSlideChange: opts.onSlideChange,
  })

  function pushHistory(canvas: Canvas) {
    if (isApplyingHistory.current) return
    // toObject accepts propertiesToInclude array for custom props
    const snapshot = canvas.toObject(['layerName'])
    undoStack.current.push(snapshot)
    if (undoStack.current.length > HISTORY_LIMIT) {
      undoStack.current.shift()
    }
    redoStack.current = []
  }

  const undo = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || undoStack.current.length === 0) return
    isApplyingHistory.current = true

    const current = canvas.toObject(['layerName'])
    redoStack.current.push(current)

    const snapshot = undoStack.current.pop()!
    canvas.loadFromJSON(snapshot).then(() => {
      canvas.renderAll()
      isApplyingHistory.current = false
      syncToZustand()
    })
  }, [syncToZustand])

  const redo = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || redoStack.current.length === 0) return
    isApplyingHistory.current = true

    const current = canvas.toObject(['layerName'])
    undoStack.current.push(current)

    const snapshot = redoStack.current.pop()!
    canvas.loadFromJSON(snapshot).then(() => {
      canvas.renderAll()
      isApplyingHistory.current = false
      syncToZustand()
    })
  }, [syncToZustand])

  // Initialize canvas
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    const canvas = new Canvas(el, {
      selection: true,
      preserveObjectStacking: true,
    })
    fabricRef.current = canvas

    canvas.on('object:modified', () => {
      pushHistory(canvas)
      syncToZustand()
    })

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-apply template when activeSlide changes
  const prevSlideId = useRef<string | null>(null)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !opts.activeSlide) return

    const slideChanged = prevSlideId.current !== opts.activeSlide.id
    if (!slideChanged) return

    prevSlideId.current = opts.activeSlide.id
    undoStack.current = []
    redoStack.current = []

    ;(async () => {
      await applyTemplate(canvas, opts.activeSlide!)
      pushHistory(canvas)
    })()
  }, [opts.activeSlide])

  return { canvasRef, undo, redo }
}
