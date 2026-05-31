import { useEffect, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { save } from '@tauri-apps/plugin-dialog'
import { isTauri, writeFileToDir } from '../../lib/tauri'
import { useProjectStore } from '../../store/useProjectStore'
import { useApiKeyStore } from '../../store/useApiKeyStore'
import { translateBatch } from '../../lib/translate'
import { fileToImageKey, loadImageObjectUrl } from '../../lib/imageStore'
import { gcImages } from '../../lib/imageRefs'
import { serializeTemplate, parseTemplate, type LocaleFileFormat } from '../../lib/localeIO'
import { parseImageName } from '../../lib/imageImport'
import { SUPPORTED_LOCALES } from '../../constants/defaults'
import { detectDeviceFromAspect } from '../../constants/deviceSpecs'
import type { Slide, TranslationAPI } from '../../types/project'

type FieldKey = 'image' | 'headline' | 'subheadline' | `badge:${number}`

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
    if (slide.screenshot)
      fields.push({ field: 'image', label: '이미지', sourceText: '' })
    if (slide.headline.text)
      fields.push({ field: 'headline', label: '헤드라인', sourceText: slide.headline.text })
    if (slide.subheadline.text)
      fields.push({ field: 'subheadline', label: '서브', sourceText: slide.subheadline.text })
    slide.badges?.forEach((b, bi) => {
      if (b.text)
        fields.push({
          field: `badge:${bi}`,
          label: slide.badges.length > 1 ? `배지${bi + 1}` : '배지',
          sourceText: b.text,
        })
    })
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
  if (field.startsWith('badge:')) {
    const bi = Number(field.slice(6))
    return slide.badges?.[bi]?.translations[locale] ?? ''
  }
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
  if (field.startsWith('badge:')) {
    const bi = Number(field.slice(6))
    if (!slide.badges?.[bi]) return null
    return {
      badges: slide.badges.map((b, i) =>
        i === bi ? { ...b, translations: { ...b.translations, [locale]: value } } : b,
      ),
    }
  }
  return null
}

/** Thumbnail that loads its blob from IndexedDB by imageKey. */
function ImageThumb({ imageKey }: { imageKey: string }) {
  const [url, setUrl] = useState<string | undefined>()
  useEffect(() => {
    let revoked = false
    let current: string | undefined
    loadImageObjectUrl(imageKey).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      current = u
      setUrl(u)
    })
    return () => {
      revoked = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [imageKey])
  if (!url) return <div className="h-14 w-9 rounded bg-[var(--color-surface-2)]" />
  return <img src={url} alt="" className="h-14 w-auto rounded border border-[var(--color-border)] object-contain" />
}

/** Per-locale screenshot override cell: thumbnail + upload/change/clear. */
function OverrideCell({
  imageKey,
  onUpload,
  onClear,
}: {
  imageKey?: string
  onUpload: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-2">
      {imageKey ? (
        <ImageThumb imageKey={imageKey} />
      ) : (
        <span className="text-xs text-[var(--color-text-dim)]">기본 이미지</span>
      )}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {imageKey ? '변경' : '업로드'}
        </button>
        {imageKey && (
          <button
            onClick={onClear}
            className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] hover:border-red-500 hover:text-red-500"
          >
            지우기
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
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
  const [ioMsg, setIoMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [imgMsg, setImgMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  if (!project) return null

  const slides = project.slides
  const { sourceLocale, targetLocales, translationApi: api } = project
  const apiKey = keys[api]?.apiKey ?? ''
  const rows = buildRows(slides)
  // Image-override rows carry no translatable text — exclude them from translation.
  const textRows = rows.filter(r => r.field !== 'image')
  const localeLabel = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code

  function handleCellChange(slideId: string, field: FieldKey, locale: string, value: string) {
    // Read the latest committed slides, not the render-time closure: a single
    // translate run writes many cells back-to-back (every field × every locale)
    // with no re-render between them. buildPatch rebuilds whole sub-objects
    // (headline/badges), so building from a stale snapshot makes each write clobber
    // the previous one — only the last locale / last badge would survive.
    const fresh = useProjectStore.getState().project?.slides ?? slides
    const patch = buildPatch(fresh, slideId, field, locale, value)
    if (patch) updateSlide(slideId, patch)
  }

  async function handleOverrideUpload(slideId: string, locale: string, file: File) {
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setErrors(prev => ({ ...prev, [locale]: '이미지를 읽을 수 없습니다 (PNG/JPG 권장)' }))
      return
    }
    const { key, width, height } = result
    const slide = useProjectStore.getState().project?.slides.find(s => s.id === slideId)
    if (!slide?.screenshot) return
    const prev = slide.screenshot.localeOverrides?.[locale]
    updateSlide(slideId, {
      screenshot: {
        ...slide.screenshot,
        localeOverrides: {
          ...slide.screenshot.localeOverrides,
          [locale]: { imageKey: key, originalWidth: width, originalHeight: height },
        },
      },
    })
    if (prev) gcImages()
  }

  function handleOverrideClear(slideId: string, locale: string) {
    const slide = useProjectStore.getState().project?.slides.find(s => s.id === slideId)
    if (!slide?.screenshot?.localeOverrides) return
    const rest = { ...slide.screenshot.localeOverrides }
    delete rest[locale]
    updateSlide(slideId, { screenshot: { ...slide.screenshot, localeOverrides: rest } })
    gcImages()
  }

  async function runTranslate(locale: string) {
    const texts = textRows.map(r => r.sourceText)
    if (!texts.length) return
    setTranslatingLocales(prev => new Set([...prev, locale]))
    setErrors(prev => { const n = { ...prev }; delete n[locale]; return n })
    try {
      const results = await translateBatch(texts, sourceLocale, locale, api, apiKey)
      textRows.forEach((row, i) => handleCellChange(row.slideId, row.field, locale, results[i]))
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

  async function exportTemplate(format: LocaleFileFormat) {
    const serRows = textRows.map(r => ({
      slideId: r.slideId,
      slideIndex: r.slideIndex,
      field: r.field,
      sourceText: r.sourceText,
    }))
    const text = serializeTemplate(
      format,
      serRows,
      (slideId, field, locale) => getCellValue(slides, slideId, field as FieldKey, locale),
      sourceLocale,
      targetLocales,
    )
    const filename = `${project!.name?.trim() || 'translations'}-translations.${format}`
    // WKWebView ignores programmatic <a download> clicks, so the desktop build
    // saves through the native dialog + Rust writer (same split as ExportPanel).
    if (isTauri()) {
      const picked = await save({
        defaultPath: filename,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (typeof picked !== 'string') return
      const slash = picked.lastIndexOf('/')
      const dir = slash >= 0 ? picked.slice(0, slash) : '.'
      const name = slash >= 0 ? picked.slice(slash + 1) : picked
      await writeFileToDir(dir, name, text)
      setIoMsg({ kind: 'ok', text: `저장됨: ${name}` })
      return
    }
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    saveAs(blob, filename)
  }

  async function handleImportFile(file: File) {
    const format: LocaleFileFormat = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'
    const text = await file.text()
    const { rows: parsed, warnings } = parseTemplate(text, format)
    const known = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
    const fresh = useProjectStore.getState().project?.slides ?? slides
    const localesSeen = new Set<string>()
    let written = 0
    const issues = [...warnings]
    for (const row of parsed) {
      const slide =
        (row.slideId && fresh.find(s => s.id === row.slideId)) ||
        (row.slide != null ? fresh[row.slide - 1] : undefined)
      if (!slide) {
        issues.push(`행 매칭 실패 (slide ${row.slideId ?? row.slide})`)
        continue
      }
      const fieldOk =
        row.field === 'headline' ||
        row.field === 'subheadline' ||
        (row.field.startsWith('badge:') && !!slide.badges?.[Number(row.field.slice(6))])
      if (!fieldOk) {
        issues.push(`알 수 없는 필드 "${row.field}" (slide ${row.slide ?? ''})`)
        continue
      }
      for (const [locale, value] of Object.entries(row.values)) {
        if (!value || locale === sourceLocale) continue
        if (!known.has(locale)) {
          issues.push(`지원하지 않는 언어 "${locale}"`)
          continue
        }
        handleCellChange(slide.id, row.field as FieldKey, locale, value)
        localesSeen.add(locale)
        written++
      }
    }
    // Surface any locale that arrived with values but wasn't selected yet.
    const toAdd = [...localesSeen].filter(l => !targetLocales.includes(l))
    if (toAdd.length) updateProject({ targetLocales: [...targetLocales, ...toAdd] })
    if (written === 0 && issues.length === 0) {
      setIoMsg({ kind: 'err', text: '가져올 번역이 없습니다' })
    } else if (issues.length) {
      setIoMsg({ kind: 'err', text: `${written}개 적용 · 경고 ${issues.length}건: ${issues.slice(0, 3).join(' / ')}` })
    } else {
      setIoMsg({ kind: 'ok', text: `${written}개 번역을 가져왔습니다` })
    }
  }

  async function handleBulkImages(files: File[]) {
    const known = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
    const issues: string[] = []
    // Resolve filenames first; base screenshots before overrides so an override
    // can attach to a base imported in the same batch.
    const targets: { file: File; slide: number; locale?: string }[] = []
    for (const file of files) {
      const parsed = parseImageName(file.name, known)
      if ('error' in parsed) issues.push(parsed.error)
      else targets.push({ file, ...parsed })
    }
    targets.sort((a, b) => (a.locale ? 1 : 0) - (b.locale ? 1 : 0))

    let applied = 0
    for (const { file, slide: slideNum, locale } of targets) {
      const slide = useProjectStore.getState().project?.slides[slideNum - 1]
      if (!slide) {
        issues.push(`슬라이드 ${slideNum} 없음: "${file.name}"`)
        continue
      }
      if (!locale && slide.template === 'hero') {
        issues.push(`슬라이드 ${slideNum}는 텍스트 전용(hero)이라 스크린샷 불가`)
        continue
      }
      if (locale && !slide.screenshot) {
        issues.push(`슬라이드 ${slideNum}에 베이스 스크린샷이 없어 ${locale} override를 붙일 수 없음`)
        continue
      }
      let result
      try {
        result = await fileToImageKey(file)
      } catch {
        issues.push(`이미지를 읽을 수 없음: "${file.name}"`)
        continue
      }
      const { key, width, height } = result
      if (!locale) {
        const detected = detectDeviceFromAspect(width, height)
        updateSlide(slide.id, {
          screenshot: {
            id: key,
            imageKey: key,
            originalWidth: width,
            originalHeight: height,
            ...(slide.screenshot?.localeOverrides && { localeOverrides: slide.screenshot.localeOverrides }),
          },
          ...(detected !== slide.deviceFrame.model && { deviceFrame: { ...slide.deviceFrame, model: detected } }),
        })
      } else {
        updateSlide(slide.id, {
          screenshot: {
            ...slide.screenshot!,
            localeOverrides: {
              ...slide.screenshot!.localeOverrides,
              [locale]: { imageKey: key, originalWidth: width, originalHeight: height },
            },
          },
        })
      }
      applied++
    }
    gcImages()
    if (applied === 0 && issues.length === 0) {
      setImgMsg({ kind: 'err', text: '가져올 이미지가 없습니다' })
    } else if (issues.length) {
      setImgMsg({ kind: 'err', text: `${applied}개 적용 · 경고 ${issues.length}건: ${issues.slice(0, 3).join(' / ')}` })
    } else {
      setImgMsg({ kind: 'ok', text: `${applied}개 이미지를 가져왔습니다` })
    }
  }

  function toggleLocale(code: string) {
    updateProject({
      targetLocales: targetLocales.includes(code)
        ? targetLocales.filter(l => l !== code)
        : [...targetLocales, code],
    })
  }

  const selectableLocales = SUPPORTED_LOCALES.filter(l => l.code !== sourceLocale).map(l => l.code)
  const allSelected =
    selectableLocales.length > 0 && selectableLocales.every(c => targetLocales.includes(c))

  const isTranslating = translatingLocales.size > 0
  const canTranslate = !!apiKey && targetLocales.length > 0 && textRows.length > 0

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
            <button
              onClick={() => updateProject({ targetLocales: allSelected ? [] : selectableLocales })}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-text-dim)]"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
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

        {/* Template import/export */}
        <div>
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">번역 양식</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportTemplate('csv')}
              disabled={textRows.length === 0 || targetLocales.length === 0}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              CSV 내보내기
            </button>
            <button
              onClick={() => exportTemplate('json')}
              disabled={textRows.length === 0 || targetLocales.length === 0}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              JSON 내보내기
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              가져오기
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleImportFile(f)
                e.target.value = ''
              }}
            />
          </div>
          {ioMsg && (
            <p className={`mt-1 max-w-72 truncate text-xs ${ioMsg.kind === 'ok' ? 'text-[var(--color-accent)]' : 'text-red-600'}`} title={ioMsg.text}>
              {ioMsg.text}
            </p>
          )}
        </div>

        {/* Bulk image import */}
        <div>
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">이미지 일괄</div>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            title="파일명: 1.png 또는 01-home.png (베이스), 1.ja.png 또는 01-home.ja.png (언어별 override)"
          >
            이미지 가져오기
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) handleBulkImages(files)
              e.target.value = ''
            }}
          />
          {imgMsg && (
            <p className={`mt-1 max-w-72 truncate text-xs ${imgMsg.kind === 'ok' ? 'text-[var(--color-accent)]' : 'text-red-600'}`} title={imgMsg.text}>
              {imgMsg.text}
            </p>
          )}
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
            에디터에서 이미지나 텍스트를 먼저 추가하세요
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
              {rows.map(row => {
                const slide = slides.find(s => s.id === row.slideId)
                const baseImageKey = slide?.screenshot?.imageKey
                return (
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
                    {row.field === 'image'
                      ? baseImageKey && <ImageThumb imageKey={baseImageKey} />
                      : row.sourceText}
                  </td>
                  {targetLocales.map(locale => (
                    <td key={locale} className="border-r border-[var(--color-border)] px-2 py-1.5">
                      {row.field === 'image' ? (
                        <OverrideCell
                          imageKey={slide?.screenshot?.localeOverrides?.[locale]?.imageKey}
                          onUpload={file => handleOverrideUpload(row.slideId, locale, file)}
                          onClear={() => handleOverrideClear(row.slideId, locale)}
                        />
                      ) : (
                        <textarea
                          value={getCellValue(slides, row.slideId, row.field, locale)}
                          onChange={e => handleCellChange(row.slideId, row.field, locale, e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
                          placeholder="번역 없음"
                        />
                      )}
                    </td>
                  ))}
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
