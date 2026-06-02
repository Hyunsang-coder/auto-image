import { useCallback, useEffect, useRef, useState } from 'react'

type Axis = 'x' | 'y'

interface Options {
  /** localStorage key the chosen size is persisted under. */
  storageKey: string
  /** Size used before the user has ever dragged (and the fallback on bad storage). */
  defaultSize: number
  min: number
  max: number
  /** Which axis the drag runs along. */
  axis: Axis
  /** 'normal' = size grows as the pointer moves in the positive axis direction
   *  (handle on the leading edge). 'invert' = size grows as the pointer moves
   *  in the negative direction (handle on the trailing edge: a panel docked
   *  right grows when you drag left; a tray docked bottom grows when you drag up). */
  direction?: 'normal' | 'invert'
}

function readStored(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  } catch {
    return fallback
  }
}

/**
 * Pointer-driven resize of a single dimension, persisted to localStorage.
 * Returns the live `size` and an `onPointerDown` to wire onto a drag handle.
 * The size is clamped to [min, max] on every move and on read-back.
 */
export function useResizable({ storageKey, defaultSize, min, max, axis, direction = 'normal' }: Options) {
  const [size, setSize] = useState(() => readStored(storageKey, defaultSize, min, max))
  const [dragging, setDragging] = useState(false)
  // Snapshot taken at pointer-down so the move handler is delta-based and never
  // reads stale React state mid-drag.
  const start = useRef({ pointer: 0, size: 0 })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      start.current = { pointer: axis === 'x' ? e.clientX : e.clientY, size }
      setDragging(true)
    },
    [axis, size],
  )

  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      const pointer = axis === 'x' ? e.clientX : e.clientY
      const delta = pointer - start.current.pointer
      const signed = direction === 'invert' ? -delta : delta
      setSize(Math.min(max, Math.max(min, start.current.size + signed)))
    }
    function onUp() {
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // Keep the resize cursor + suppress text selection for the whole drag.
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging, axis, min, max, direction])

  // Persist after each commit (cheap; size is a single number).
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(size))
    } catch {
      /* storage full / unavailable — keep the in-memory size */
    }
  }, [storageKey, size])

  return { size, dragging, onPointerDown }
}
