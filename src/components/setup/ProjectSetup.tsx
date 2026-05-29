import { useState } from 'react'
import type { DeviceType } from '../../types/project'
import { DEFAULT_THEME_COLOR } from '../../constants/defaults'
import { DEVICE_SPECS } from '../../constants/deviceSpecs'
import { useProjectStore } from '../../store/useProjectStore'
import { ColorPickerPopover } from '../common/ColorPickerPopover'

const MIN_SLIDES = 1
const MAX_SLIDES = 10

export function ProjectSetup() {
  const createProject = useProjectStore((s) => s.createProject)
  const existingProject = useProjectStore((s) => s.project)
  const setStep = useProjectStore((s) => s.setStep)

  const [name, setName] = useState(existingProject?.name ?? '내 앱')
  const [devices, setDevices] = useState<DeviceType[]>(
    existingProject?.devices ?? ['iphone'],
  )
  const [count, setCount] = useState<number>(
    existingProject?.screenshotCount ?? 5,
  )
  const [themeColor, setThemeColor] = useState<string>(
    existingProject?.themeColor ?? DEFAULT_THEME_COLOR,
  )

  const canSubmit = name.trim().length > 0 && devices.length > 0
  const hasExisting = !!existingProject

  function toggleDevice(d: DeviceType) {
    setDevices((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d],
    )
  }

  function submit() {
    if (!canSubmit) return
    createProject({
      name: name.trim(),
      devices,
      screenshotCount: count,
      themeColor: themeColor.toUpperCase(),
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">
          새 스크린샷 프로젝트
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          App Store 제출용 스크린샷 세트를 만듭니다. 데이터는 이 브라우저에만
          저장됩니다.
        </p>
      </header>

      <Section title="앱 이름">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          placeholder="예: Dogo, Claude, ADHD"
        />
      </Section>

      <Section
        title="기기"
        hint="iPhone과 iPad를 동시에 만들 수 있습니다 (각자 별도 세트로 export됨)."
      >
        <div className="flex flex-wrap gap-3">
          {(['iphone', 'ipad'] as DeviceType[]).map((d) => {
            const spec = DEVICE_SPECS[d === 'iphone' ? 'iphone-16-pro' : 'ipad-pro-13']
            const active = devices.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDevice(d)}
                className={[
                  'flex flex-1 min-w-[200px] flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-dim)]',
                ].join(' ')}
              >
                <span className="text-base font-medium text-[var(--color-text)]">
                  {spec.label}
                </span>
                <span className="text-xs text-[var(--color-text-dim)]">
                  {spec.exportWidth} × {spec.exportHeight} px
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="슬라이드 수" hint="1~10장. 나중에 추가할 수도 있습니다.">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(MIN_SLIDES, c - 1))}
            className="h-10 w-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-lg leading-none hover:bg-[var(--color-border)]"
          >
            −
          </button>
          <input
            type="number"
            value={count}
            min={MIN_SLIDES}
            max={MAX_SLIDES}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10)
              if (Number.isNaN(v)) return
              setCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, v)))
            }}
            className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center text-base text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(MAX_SLIDES, c + 1))}
            className="h-10 w-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-lg leading-none hover:bg-[var(--color-border)]"
          >
            +
          </button>
          <span className="text-sm text-[var(--color-text-dim)]">장</span>
        </div>
      </Section>

      <Section title="테마 컬러" hint="배경 그라데이션과 배지 기본색에 사용됩니다.">
        <ColorPickerPopover color={themeColor} onChange={setThemeColor} />
      </Section>

      <footer className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-6">
        <p className="text-xs text-[var(--color-text-dim)]">
          {hasExisting
            ? '계속하면 기존 프로젝트를 덮어씁니다.'
            : '저장은 자동으로 이루어집니다.'}
        </p>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasExisting ? '새로 만들기 →' : '다음 →'}
        </button>
      </footer>

      {hasExisting && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <p className="mb-2 text-[var(--color-text-dim)]">
            이전에 만들던 프로젝트가 있습니다:
          </p>
          <p className="text-[var(--color-text)]">
            <span className="font-medium">{existingProject.name}</span>
            <span className="ml-2 text-[var(--color-text-dim)]">
              · {existingProject.slides.length}장 · 마지막 수정{' '}
              {formatTime(existingProject.updatedAt)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-3 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-text-dim)]"
          >
            계속 편집하기 →
          </button>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {title}
        </h2>
        {hint && (
          <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{hint}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}
