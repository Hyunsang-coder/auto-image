import { useRef, useEffect } from 'react'
import { useProjectStore, spanLeaderOf } from '../../store/useProjectStore'
import { SlideList } from './SlideList'
import { FabricCanvas, type FabricCanvasHandle } from './FabricCanvas'
import { CanvasToolbar } from './CanvasToolbar'
import { PropertiesPanel } from './properties/PropertiesPanel'
import type {
  Badge,
  Highlight,
  Slide,
  TemplateType,
  Background,
  Caption,
  DeviceFrame,
  Ornament,
  ScreenshotImage,
  ScreenshotStyle,
} from '../../types/project'
import { TEMPLATE_FONT_SIZES, type ThemePreset } from '../../constants/defaults'
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
  const clickedSlide = project.slides.find((s) => s.id === activeSlideId) ?? null
  // When the clicked slide is part of a span group, the leader owns all the
  // layer data — route both the canvas render and every update target there.
  // `clickedSlide` is still useful for SlideList highlighting (kept in store).
  const slide = spanLeaderOf(project.slides, clickedSlide)
  const editTargetId = slide?.id ?? null
  const isGrouped = !!slide?.spanGroupId

  function handleSlideChange(patch: Partial<Slide>) {
    if (!editTargetId) return
    updateSlide(editTargetId, patch)
  }

  function handleTemplateChange(t: TemplateType) {
    if (!editTargetId || !slide) return
    const sizes = TEMPLATE_FONT_SIZES[t]
    updateSlide(editTargetId, {
      template: t,
      headline: { ...slide.headline, style: { ...slide.headline.style, fontSize: sizes.headline } },
      subheadline: { ...slide.subheadline, style: { ...slide.subheadline.style, fontSize: sizes.subheadline } },
    })
  }

  function handleBackgroundChange(bg: Background) {
    if (!editTargetId) return
    updateSlide(editTargetId, { background: bg })
  }

  function handleHeadlineChange(c: Caption) {
    if (!editTargetId) return
    updateSlide(editTargetId, { headline: c })
  }

  function handleSubheadlineChange(c: Caption) {
    if (!editTargetId) return
    updateSlide(editTargetId, { subheadline: c })
  }

  function handleScreenshotChange(screenshot: ScreenshotImage | null) {
    if (!editTargetId) return
    const oldKey = slide?.screenshot?.imageKey
    if (oldKey && oldKey !== screenshot?.imageKey) {
      deleteImage(oldKey)
    }
    updateSlide(editTargetId, { screenshot })
  }

  function handleBadgeChange(badge: Badge | null) {
    if (!editTargetId) return
    updateSlide(editTargetId, { badge })
  }

  function handleDeviceFrameChange(df: DeviceFrame) {
    if (!editTargetId) return
    updateSlide(editTargetId, { deviceFrame: df })
  }

  function handleScreenshotStyleChange(style: ScreenshotStyle) {
    if (!editTargetId) return
    updateSlide(editTargetId, { screenshotStyle: style })
  }

  function handleOrnamentsChange(ornaments: Ornament[]) {
    if (!editTargetId) return
    updateSlide(editTargetId, { ornaments })
  }

  function handleHighlightsChange(highlights: Highlight[]) {
    if (!editTargetId) return
    updateSlide(editTargetId, { highlights })
  }

  function handleApplyThemePreset(preset: ThemePreset) {
    if (!editTargetId || !slide) return
    updateSlide(editTargetId, {
      background: preset.background,
      headline: {
        ...slide.headline,
        style: { ...slide.headline.style, color: preset.headlineColor },
      },
      subheadline: {
        ...slide.subheadline,
        style: { ...slide.subheadline.style, color: preset.subheadlineColor },
      },
    })
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
            isGrouped={isGrouped}
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
          onBadgeChange={handleBadgeChange}
          onDeviceFrameChange={handleDeviceFrameChange}
          onScreenshotStyleChange={handleScreenshotStyleChange}
          onOrnamentsChange={handleOrnamentsChange}
          onHighlightsChange={handleHighlightsChange}
          onApplyThemePreset={handleApplyThemePreset}
        />
      ) : (
        <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm text-[var(--color-text-dim)]">슬라이드를 선택하세요</p>
        </aside>
      )}
    </div>
  )
}
