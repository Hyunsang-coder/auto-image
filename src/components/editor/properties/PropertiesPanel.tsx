import type {
  Badge,
  Highlight,
  Slide,
  Background,
  Caption,
  DeviceFrame,
  ExternalImage,
  Ornament,
  ScreenshotImage,
  ScreenshotStyle,
  Shape,
  TemplateType,
  TextStyle,
} from '../../../types/project'
import type { ThemePreset } from '../../../constants/defaults'
import { BackgroundPanel } from './BackgroundPanel'
import { BadgePanel } from './BadgePanel'
import { CaptionPanel } from './CaptionPanel'
import { ScreenshotPanel } from './ScreenshotPanel'
import { ExternalImagePanel } from './ExternalImagePanel'
import { OrnamentPanel } from './OrnamentPanel'
import { ShapePanel } from './ShapePanel'
import { HighlightPanel } from './HighlightPanel'
import { useT } from '../../../i18n'

export type PanelTab =
  | 'background'
  | 'caption'
  | 'screenshot'
  | 'externalImages'
  | 'badge'
  | 'ornaments'
  | 'shapes'
  | 'highlights'

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'background',  label: '배경' },
  { id: 'caption',     label: '텍스트' },
  { id: 'screenshot',  label: '디바이스' },
  { id: 'externalImages', label: '이미지' },
  { id: 'highlights',  label: '하이라이트' },
  { id: 'shapes',      label: '도형' },
  { id: 'ornaments',   label: '장식' },
  { id: 'badge',       label: '배지' },
]

interface Props {
  slide: Slide
  /**
   * Span: caption ownership follows the clicked slide. When set (the follower
   * half is active), the caption tab edits THIS slide's texts while every
   * other tab keeps editing `slide` (the leader's shared layers).
   */
  captionSlide?: Slide | null
  tab: PanelTab
  onTabChange: (t: PanelTab) => void
  onBackgroundChange: (bg: Background) => void
  onTextsChange: (texts: Caption[]) => void
  onScreenshotChange: (screenshot: ScreenshotImage | null) => void
  onBadgesChange: (badges: Badge[]) => void
  onDeviceFrameChange: (df: DeviceFrame) => void
  onScreenshotStyleChange: (style: ScreenshotStyle) => void
  onTemplateChange: (next: TemplateType) => void
  onExternalImagesChange: (next: ExternalImage[]) => void
  onOrnamentsChange: (next: Ornament[]) => void
  onShapesChange: (next: Shape[]) => void
  onHighlightsChange: (next: Highlight[]) => void
  onApplyThemePreset: (preset: ThemePreset) => void
  onSavePreset: (name: string) => void
  /** Bulk apply ("all"/"selected"). Hidden in locale mode. */
  bulkEnabled: boolean
  /** Size of the live multi-selection (includes the active slide). */
  selectedCount: number
  /** Total base slides — the "전체" target count. */
  slideCount: number
  onApplyThemePresetToSlides: (preset: ThemePreset, scope: 'all' | 'selected') => void
  onApplyTextStyleToSlides: (style: Partial<TextStyle>, scope: 'all' | 'selected') => void
}

export function PropertiesPanel({
  slide,
  captionSlide,
  tab,
  onTabChange,
  onBackgroundChange,
  onTextsChange,
  onScreenshotChange,
  onBadgesChange,
  onDeviceFrameChange,
  onScreenshotStyleChange,
  onTemplateChange,
  onExternalImagesChange,
  onOrnamentsChange,
  onShapesChange,
  onHighlightsChange,
  onApplyThemePreset,
  onSavePreset,
  bulkEnabled,
  selectedCount,
  slideCount,
  onApplyThemePresetToSlides,
  onApplyTextStyleToSlides,
}: Props) {
  const t = useT()
  const screenshotStyle: ScreenshotStyle =
    slide.screenshotStyle ?? { cornerRadiusRatio: 0.06, shadow: true }

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      {/*
        Natural widths in a scroller, not `flex-1`: eight equal shares of a
        resizable ~340px panel collapse below the label width and the tab names
        run together. The strip scrolls instead, and the active tab is scrolled
        back into view so it can never end up off-screen.
      */}
      <div
        aria-label={t('속성')}
        className="flex shrink-0 overflow-x-auto border-b border-[var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab_) => (
          <button
            key={tab_.id}
            type="button"
            // Plain buttons, not role="tab": the full tab pattern also owes a
            // tabpanel and arrow-key roving focus, and half of it announces
            // "3 of 8" to a screen reader while the arrows do nothing.
            aria-current={tab === tab_.id ? 'true' : undefined}
            ref={(el) => {
              if (el && tab === tab_.id) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }}
            onClick={() => onTabChange(tab_.id)}
            className={[
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[length:var(--text-ui-sm)] font-medium transition',
              tab === tab_.id
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {t(tab_.label)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'background' && (
          <BackgroundPanel
            value={slide.background}
            onChange={onBackgroundChange}
            onApplyPreset={onApplyThemePreset}
            onSavePreset={onSavePreset}
            bulkEnabled={bulkEnabled}
            selectedCount={selectedCount}
            slideCount={slideCount}
            onApplyPresetToSlides={onApplyThemePresetToSlides}
          />
        )}
        {tab === 'caption' && (
          <CaptionPanel
            texts={(captionSlide ?? slide).texts}
            template={(captionSlide ?? slide).template}
            onChange={onTextsChange}
            bulkEnabled={bulkEnabled}
            selectedCount={selectedCount}
            slideCount={slideCount}
            onApplyTextStyleToSlides={onApplyTextStyleToSlides}
          />
        )}
        {tab === 'screenshot' && (
          <ScreenshotPanel
            value={slide.screenshot}
            onChange={onScreenshotChange}
            deviceFrame={slide.deviceFrame}
            onDeviceFrameChange={onDeviceFrameChange}
            screenshotStyle={screenshotStyle}
            onScreenshotStyleChange={onScreenshotStyleChange}
            template={slide.template}
            onTemplateChange={onTemplateChange}
          />
        )}
        {tab === 'externalImages' && (
          <ExternalImagePanel
            value={slide.externalImages ?? []}
            onChange={onExternalImagesChange}
          />
        )}
        {tab === 'highlights' && (
          <HighlightPanel
            value={slide.highlights ?? []}
            hasScreenshot={!!slide.screenshot}
            onChange={onHighlightsChange}
          />
        )}
        {tab === 'shapes' && (
          <ShapePanel
            value={slide.shapes ?? []}
            onChange={onShapesChange}
          />
        )}
        {tab === 'ornaments' && (
          <OrnamentPanel
            value={slide.ornaments ?? []}
            onChange={onOrnamentsChange}
          />
        )}
        {tab === 'badge' && (
          <BadgePanel value={slide.badges} onChange={onBadgesChange} />
        )}
      </div>
    </aside>
  )
}
