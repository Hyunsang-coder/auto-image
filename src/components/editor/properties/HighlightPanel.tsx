import type { Highlight } from '../../../types/project'
import { makeHighlight } from '../../../constants/defaults'

interface Props {
  value: Highlight[]
  hasScreenshot: boolean
  onChange: (next: Highlight[]) => void
}

export function HighlightPanel({ value, hasScreenshot, onChange }: Props) {
  function add() {
    onChange([...value, makeHighlight()])
  }
  function update(id: string, patch: Partial<Highlight>) {
    onChange(value.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  }
  function updatePopup(id: string, patch: Partial<Highlight['popup']>) {
    onChange(
      value.map((h) => (h.id === id ? { ...h, popup: { ...h.popup, ...patch } } : h)),
    )
  }
  function remove(id: string) {
    onChange(value.filter((h) => h.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          하이라이트
        </p>
        <button
          type="button"
          onClick={add}
          disabled={!hasScreenshot}
          title={hasScreenshot ? '하이라이트 추가' : '먼저 스크린샷을 업로드하세요'}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-white transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + 추가
        </button>
      </div>

      {!hasScreenshot && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-dim)]">
          하이라이트는 스크린샷 영역을 확대해 보여주는 기능이에요. 먼저 스크린샷을 업로드해야 추가할 수 있어요.
        </p>
      )}

      {value.length === 0 && hasScreenshot && (
        <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-text-dim)]">
          "+ 추가"로 하이라이트를 만드세요.
          <br />
          캔버스에서 드래그해 위치/크기 조정.
        </p>
      )}

      {value.map((h, i) => (
        <div
          key={h.id}
          className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white">하이라이트 {i + 1}</p>
            <button
              type="button"
              onClick={() => remove(h.id)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              삭제
            </button>
          </div>

          <Group label="원본 영역 (스크린샷 안)">
            <Slider
              label="X"
              value={h.sourceRegion.x}
              min={0}
              max={1 - h.sourceRegion.w}
              step={0.01}
              onChange={(v) =>
                update(h.id, { sourceRegion: { ...h.sourceRegion, x: v } })
              }
            />
            <Slider
              label="Y"
              value={h.sourceRegion.y}
              min={0}
              max={1 - h.sourceRegion.h}
              step={0.01}
              onChange={(v) =>
                update(h.id, { sourceRegion: { ...h.sourceRegion, y: v } })
              }
            />
            <Slider
              label="W"
              value={h.sourceRegion.w}
              min={0.05}
              max={1 - h.sourceRegion.x}
              step={0.01}
              onChange={(v) =>
                update(h.id, { sourceRegion: { ...h.sourceRegion, w: v } })
              }
            />
            <Slider
              label="H"
              value={h.sourceRegion.h}
              min={0.05}
              max={1 - h.sourceRegion.y}
              step={0.01}
              onChange={(v) =>
                update(h.id, { sourceRegion: { ...h.sourceRegion, h: v } })
              }
            />
          </Group>

          <Group label="확대 카드">
            <Slider
              label="가로 위치"
              value={h.popup.x}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updatePopup(h.id, { x: v })}
            />
            <Slider
              label="세로 위치"
              value={h.popup.y}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updatePopup(h.id, { y: v })}
            />
            <Slider
              label="크기"
              value={h.popup.width}
              min={0.2}
              max={1}
              step={0.01}
              onChange={(v) => updatePopup(h.id, { width: v })}
            />
          </Group>

          <Group label="원본 표시">
            <label className="flex items-center justify-between text-xs text-white">
              <span>테두리 굵기</span>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={h.borderWidth}
                onChange={(e) => update(h.id, { borderWidth: Number(e.target.value) })}
                className="ml-2 w-28 accent-[var(--color-accent)]"
              />
              <span className="w-6 text-right text-[var(--color-text-dim)]">
                {h.borderWidth}
              </span>
            </label>
            <label className="flex items-center justify-between text-xs text-white">
              <span>테두리 색</span>
              <input
                type="color"
                value={h.borderColor}
                onChange={(e) => update(h.id, { borderColor: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
              />
            </label>
          </Group>
        </div>
      ))}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between text-xs text-white">
      <span className="w-16 text-[var(--color-text-dim)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-2 flex-1 accent-[var(--color-accent)]"
      />
      <span className="w-10 text-right text-[var(--color-text-dim)]">
        {Math.round(value * 100)}%
      </span>
    </label>
  )
}
