import { useRef, useEffect } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { SlideList } from './SlideList'
import { FabricCanvas, type FabricCanvasHandle } from './FabricCanvas'
import { CanvasToolbar } from './CanvasToolbar'
import { PropertiesPanel } from './properties/PropertiesPanel'
import type { Slide, TemplateType, Background, Caption, ScreenshotImage } from '../../types/project'
import { deleteImage } from '../../lib/imageStore'

export function EditorLayout() {
  const project = useProjectStore((s) => s.project)
  const activeSlideId = useProjectStore((s) => s.activeSlideId)
  const setActiveSlide = useProjectStore((s) => s.setActiveSlide)
  const updateSlide = useProjectStore((s) => s.updateSlide)

  const canvasRef = useRef<FabricCanvasHandle>(null)

  // Keyboard undo/redo wired to canvas handle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? e.metaKey : e.ctrlKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        canvasRef.current?.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        canvasRef.current?.redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!project) return null
  const slide = project.slides.find((s) => s.id === activeSlideId) ?? null

  function handleSlideChange(patch: Partial<Slide>) {
    if (!activeSlideId) return
    updateSlide(activeSlideId, patch)
  }

  function handleTemplateChange(t: TemplateType) {
    if (!activeSlideId) return
    updateSlide(activeSlideId, { template: t })
  }

  function handleBackgroundChange(bg: Background) {
    if (!activeSlideId) return
    updateSlide(activeSlideId, { background: bg })
  }

  function handleHeadlineChange(c: Caption) {
    if (!activeSlideId) return
    updateSlide(activeSlideId, { headline: c })
  }

  function handleSubheadlineChange(c: Caption) {
    if (!activeSlideId) return
    updateSlide(activeSlideId, { subheadline: c })
  }

  function handleScreenshotChange(screenshot: ScreenshotImage | null) {
    if (!activeSlideId) return
    const oldKey = slide?.screenshot?.imageKey
    if (oldKey && oldKey !== screenshot?.imageKey) {
      deleteImage(oldKey)
    }
    updateSlide(activeSlideId, { screenshot })
  }

  return (
    <div className="grid h-full grid-cols-[200px_1fr_280px] gap-0 border-t border-[var(--color-border)] overflow-hidden">
      <SlideList
        slides={project.slides}
        activeSlideId={activeSlideId}
        onSelect={setActiveSlide}
      />

      <main className="flex flex-col items-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="sticky top-0 z-10 flex w-full justify-center border-b border-[var(--color-border)] bg-[var(--color-bg)] py-2">
          <CanvasToolbar
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
          />
        </div>
        <div className="flex flex-1 items-start justify-center p-6">
          <FabricCanvas
            ref={canvasRef}
            activeSlide={slide}
            onSlideChange={handleSlideChange}
          />
        </div>
      </main>

      {slide ? (
        <PropertiesPanel
          slide={slide}
          onTemplateChange={handleTemplateChange}
          onBackgroundChange={handleBackgroundChange}
          onHeadlineChange={handleHeadlineChange}
          onSubheadlineChange={handleSubheadlineChange}
          onScreenshotChange={handleScreenshotChange}
        />
      ) : (
        <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm text-[var(--color-text-dim)]">슬라이드를 선택하세요</p>
        </aside>
      )}
    </div>
  )
}
