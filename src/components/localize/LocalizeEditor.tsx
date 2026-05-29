import { useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { useApiKeyStore } from '../../store/useApiKeyStore'
import { translateBatch } from '../../lib/translate'
import { SUPPORTED_LOCALES } from '../../constants/defaults'
import type { Slide, TranslationAPI } from '../../types/project'

type FieldKey = 'headline' | 'subheadline' | 'badge'

type GridRow = {
  slideId: string
  slideIndex: number
  slideRowSpan: number
  field: FieldKey
  label: string
  sourceText: string
  /** True when this row's slide is a span leader — the cell label should
   * indicate the translation covers both halves. */
  isSpanLeader: boolean
}

function buildRows(slides: Slide[]): GridRow[] {
  const rows: GridRow[] = []
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    // Followers in a span group inherit text from the leader. Don't emit any
    // rows for them — the leader's rows govern both halves.
    if (slide.spanRole === 'follower') continue
    const fields: { field: FieldKey; label: string; sourceText: string }[] = []
    if (slide.headline.text)
      fields.push({ field: 'headline', label: '헤드라인', sourceText: slide.headline.text })
    if (slide.subheadline.text)
      fields.push({ field: 'subheadline', label: '서브', sourceText: slide.subheadline.text })
    if (slide.badge?.text)
      fields.push({ field: 'badge', label: '배지', sourceText: slide.badge.text })
    const isSpanLeader = slide.spanRole === 'leader'
    fields.forEach((f, j) =>
      rows.push({
        slideId: slide.id,
        slideIndex: i,
        slideRowSpan: j === 0 ? fields.length : 0,
        isSpanLeader,
        ...f,
      }),
    )
  }
  return rows
}

function getCellValue(slides: Slide[], slideId: string, field: FieldKey, locale: string): string {
  const slide = slides.find(s => s.id === slideId)
  if (!slide) return ''
  if (field === 'headline') return slide.headline.translations[locale] ?? ''
  if (field === 'subheadline') return slide.subheadline.translations[locale] ?? ''
  if (field === 'badge') return slide.badge?.translations[locale] ?? ''
  return ''
}

function buildPatch(
  slides: Slide[],
  slideId: string,
  field: FieldKey,
  locale: string,
  value: string,
): Partial<Slide> | null {
  const slide = slides.find(s => s.id === slideId)
  if (!slide) return null
  if (field === 'headline')
    return { headline: { ...slide.headline, translations: { ...slide.headline.translations, [locale]: value } } }
  if (field === 'subheadline')
    return { subheadline: { ...slide.subheadline, translations: { ...slide.subheadline.translations, [locale]: value } } }
  if (field === 'badge' && slide.badge)
    return { badge: { ...slide.badge, translations: { ...slide.badge.translations, [locale]: value } } }
  return null
}

export function LocalizeEditor() {
  const project = useProjectStore(s => s.project)
  const updateProject = useProjectStore(s => s.updateProject)
  const updateSlide = useProjectStore(s => s.updateSlide)
  const setStep = useProjectStore(s => s.setStep)
  const { keys, setKey } = useApiKeyStore()

  const [translatingLocales, setTranslatingLocales] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState(false)

  if (!project) return null

  const slides = project.slides
  const { sourceLocale, targetLocales, translationApi: api } = project
  const apiKey = keys[api]?.apiKey ?? ''
  const rows = buildRows(slides)
  const localeLabel = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code

  function handleCellChange(slideId: string, field: FieldKey, locale: string, value: string) {
    const patch = buildPatch(slides, slideId, field, locale, value)
    if (patch) updateSlide(slideId, patch)
  }

  async function runTranslate(locale: string) {
    const texts = rows.map(r => r.sourceText)
    if (!texts.length) return
    setTranslatingLocales(prev => new Set([...prev, locale]))
    setErrors(prev => { const n = { ...prev }; delete n[locale]; return n })
    try {
      const results = await translateBatch(texts, sourceLocale, locale, api, apiKey)
      rows.forEach((row, i) => handleCellChange(row.slideId, row.field, locale, results[i]))
    } catch (e) {
      setErrors(prev => ({ ...prev, [locale]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setTranslatingLocales(prev => { const n = new Set(prev); n.delete(locale); return n })
    }
  }

  async function translateAll() {
    for (const locale of targetLocales) {
      await runTranslate(locale)
    }
  }

  function toggleLocale(code: string) {
    updateProject({
      targetLocales: targetLocales.includes(code)
        ? targetLocales.filter(l => l !== code)
        : [...targetLocales, code],
    })
  }

  const isTranslating = translatingLocales.size > 0
  const canTranslate = !!apiKey && targetLocales.length > 0 && rows.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">로컬라이즈</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setStep(2)}
            className="rounded px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← 에디터
          </button>
          <button
            onClick={() => setStep(4)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:brightness-125"
          >
            내보내기 →
          </button>
        </div>
      </div>

      {/* Config row */}
      <div className="flex flex-shrink-0 flex-wrap items-start gap-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        {/* Source locale */}
        <div>
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">원본 언어</div>
          <select
            value={sourceLocale}
            onChange={e => updateProject({ sourceLocale: e.target.value })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {SUPPORTED_LOCALES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Target locales */}
        <div className="flex-1">
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">번역 언어</div>
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_LOCALES.filter(l => l.code !== sourceLocale).map(locale => {
              const checked = targetLocales.includes(locale.code)
              return (
                <label
                  key={locale.code}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 text-xs transition-colors ${
                    checked
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text-dim)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--color-accent)]"
                    checked={checked}
                    onChange={() => toggleLocale(locale.code)}
                  />
                  {locale.label}
                </label>
              )
            })}
          </div>
        </div>

        {/* API + key + translate button */}
        <div className="flex items-end gap-3">
          <div>
            <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">번역 API</div>
            <div className="flex gap-3">
              {(['claude', 'openai', 'gemini'] as TranslationAPI[]).map(a => (
                <label key={a} className="flex cursor-pointer items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="translationApi"
                    checked={api === a}
                    onChange={() => updateProject({ translationApi: a })}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className={api === a ? 'text-[var(--color-text)]' : 'text-[var(--color-text-dim)]'}>
                    {a === 'claude' ? 'Claude' : a === 'openai' ? 'OpenAI' : 'Gemini'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">API 키</div>
            <div className="flex">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setKey(api, e.target.value)}
                placeholder="API 키 입력"
                className="w-44 rounded-l border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="rounded-r border border-l-0 border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                {showKey ? '숨김' : '표시'}
              </button>
            </div>
          </div>

          <button
            onClick={translateAll}
            disabled={!canTranslate || isTranslating}
            className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isTranslating ? '번역 중…' : '전체 번역'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {targetLocales.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
            번역할 언어를 선택하세요
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
            에디터에서 텍스트를 먼저 입력하세요
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-14 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  슬라이드
                </th>
                <th className="w-16 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  필드
                </th>
                <th className="min-w-44 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  {localeLabel(sourceLocale)}{' '}
                  <span className="opacity-50">(원본)</span>
                </th>
                {targetLocales.map(locale => (
                  <th key={locale} className="min-w-44 border-r border-[var(--color-border)] px-3 py-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--color-text-dim)]">
                        {localeLabel(locale)}
                      </span>
                      <button
                        onClick={() => runTranslate(locale)}
                        disabled={!apiKey || translatingLocales.has(locale)}
                        className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
                      >
                        {translatingLocales.has(locale) ? '…' : '번역'}
                      </button>
                    </div>
                    {errors[locale] && (
                      <p className="mt-1 truncate text-xs text-red-600" title={errors[locale]}>
                        {errors[locale]}
                      </p>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={`${row.slideId}-${row.field}`}
                  className="border-b border-[var(--color-border)]/40 hover:bg-[var(--color-surface-2)]"
                >
                  {row.slideRowSpan > 0 && (
                    <td
                      rowSpan={row.slideRowSpan}
                      className="border-r border-[var(--color-border)] px-3 py-2 text-center text-xs font-semibold text-[var(--color-text-dim)]"
                      title={row.isSpanLeader ? '2-page span — 양쪽 슬라이드에 적용됩니다' : undefined}
                    >
                      {row.isSpanLeader
                        ? `${row.slideIndex + 1}·${row.slideIndex + 2}`
                        : row.slideIndex + 1}
                    </td>
                  )}
                  <td className="border-r border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-dim)]">
                    {row.label}
                  </td>
                  <td className="border-r border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text)]/60">
                    {row.sourceText}
                  </td>
                  {targetLocales.map(locale => (
                    <td key={locale} className="border-r border-[var(--color-border)] px-2 py-1.5">
                      <textarea
                        value={getCellValue(slides, row.slideId, row.field, locale)}
                        onChange={e => handleCellChange(row.slideId, row.field, locale, e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
                        placeholder="번역 없음"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
