import { useEffect, useRef, useState } from 'react'
import { Modal } from '../common/Modal'
import { saveAs } from 'file-saver'
import { save } from '@tauri-apps/plugin-dialog'
import { isTauri, writeFileToDir } from '../../lib/tauri'
import { useProjectStore } from '../../store/useProjectStore'
import { fileToImageKey, loadImageObjectUrl } from '../../lib/imageStore'
import { gcImages } from '../../lib/imageRefs'
import { serializeTemplate, parseTemplate, buildTranslationPrompt, type LocaleFileFormat } from '../../lib/localeIO'
import { applyCaptionRows, buildTranslationPatch, type FieldKey } from '../../lib/localePatch'
import { buildImageNamingGuide } from '../../lib/imageImport'
import { importBulkImages } from '../../lib/bulkImageImport'
import { SUPPORTED_LOCALES } from '../../constants/defaults'
import { useT, t as i18nT } from '../../i18n'
import type { Slide } from '../../types/project'

type GridRow = {
  slideId: string
  slideIndex: number
  slideRowSpan: number
  field: FieldKey
  label: string
  sourceText: string
}

function buildRows(slides: Slide[]): GridRow[] {
  const rows: GridRow[] = []
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    // Span texts are per-slide: a follower emits its own text rows under its
    // own slide number. The screenshot and badges stay leader-owned, so those
    // rows are leader-only.
    const isFollower = slide.spanRole === 'follower'
    const fields: { field: FieldKey; label: string; sourceText: string }[] = []
    if (slide.screenshot && !isFollower)
      fields.push({ field: 'image', label: i18nT('이미지'), sourceText: '' })
    slide.texts.forEach((t, ti) => {
      if (t.text)
        fields.push({
          field: `text:${ti}`,
          label: slide.texts.length > 1 ? i18nT('텍스트 {n}', { n: ti + 1 }) : i18nT('텍스트'),
          sourceText: t.text,
        })
    })
    if (!isFollower)
      slide.badges?.forEach((b, bi) => {
        if (b.text)
          fields.push({
            field: `badge:${bi}`,
            label: slide.badges.length > 1 ? i18nT('배지 {n}', { n: bi + 1 }) : i18nT('배지'),
            sourceText: b.text,
          })
      })
    fields.forEach((f, j) =>
      rows.push({
        slideId: slide.id,
        slideIndex: i,
        slideRowSpan: j === 0 ? fields.length : 0,
        ...f,
      }),
    )
  }
  return rows
}

function getCellValue(slides: Slide[], slideId: string, field: FieldKey, locale: string): string {
  const slide = slides.find(s => s.id === slideId)
  if (!slide) return ''
  if (field.startsWith('text:')) {
    const ti = Number(field.slice(5))
    return slide.texts[ti]?.translations[locale] ?? ''
  }
  if (field.startsWith('badge:')) {
    const bi = Number(field.slice(6))
    return slide.badges?.[bi]?.translations[locale] ?? ''
  }
  return ''
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
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-2">
      {imageKey ? (
        <ImageThumb imageKey={imageKey} />
      ) : (
        <span className="text-xs text-[var(--color-text-dim)]">{t('기본 이미지')}</span>
      )}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {imageKey ? t('변경') : t('업로드')}
        </button>
        {imageKey && (
          <button
            onClick={onClear}
            className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-text-dim)] hover:border-red-500 hover:text-red-500"
          >
            {t('지우기')}
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
  const t = useT()
  const project = useProjectStore(s => s.project)
  const updateProject = useProjectStore(s => s.updateProject)
  const updateSlide = useProjectStore(s => s.updateSlide)
  const updateSlides = useProjectStore(s => s.updateSlides)
  const changeSourceLocale = useProjectStore(s => s.changeSourceLocale)
  const setStep = useProjectStore(s => s.setStep)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ioMsg, setIoMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [ioIssues, setIoIssues] = useState<string[]>([])
  const [imgMsg, setImgMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [imgIssues, setImgIssues] = useState<string[]>([])
  const [promptPreview, setPromptPreview] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  if (!project) return null

  const slides = project.slides
  const { sourceLocale, targetLocales } = project
  const rows = buildRows(slides)
  // Image-override rows carry no text — text-only rows drive the CSV/JSON template.
  const textRows = rows.filter(r => r.field !== 'image')
  const localeLabel = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code

  function handleCellChange(slideId: string, field: FieldKey, locale: string, value: string) {
    // Read the latest committed slides, not the render-time closure: a single
    // translate run writes many cells back-to-back (every field × every locale)
    // with no re-render between them. buildPatch rebuilds whole sub-objects
    // (headline/badges), so building from a stale snapshot makes each write clobber
    // the previous one — only the last locale / last badge would survive.
    const fresh = useProjectStore.getState().project?.slides ?? slides
    const patch = buildTranslationPatch(fresh, slideId, field, locale, value)
    if (patch) updateSlide(slideId, patch)
  }

  async function handleOverrideUpload(slideId: string, locale: string, file: File) {
    let result
    try {
      result = await fileToImageKey(file)
    } catch {
      setErrors(prev => ({ ...prev, [locale]: t('이미지를 읽을 수 없습니다 (PNG/JPG 권장)') }))
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
      setIoMsg({ kind: 'ok', text: t('저장됨: {name}', { name }) })
      return
    }
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    saveAs(blob, filename)
  }

  function openTranslationPrompt() {
    setPromptPreview(
      buildTranslationPrompt(
        { code: sourceLocale, label: localeLabel(sourceLocale) },
        targetLocales.map(c => ({ code: c, label: localeLabel(c) })),
      ),
    )
  }

  async function copyTranslationPrompt() {
    if (!promptPreview) return
    try {
      await navigator.clipboard.writeText(promptPreview)
      setIoMsg({ kind: 'ok', text: t('번역 프롬프트를 복사했습니다 — AI 도구에 붙여넣고 양식을 첨부하세요') })
    } catch {
      setIoMsg({ kind: 'err', text: t('복사 실패 — 클립보드 권한을 확인하세요') })
    }
    setPromptPreview(null)
  }

  async function copyImageNamingGuide() {
    const guide = buildImageNamingGuide(
      { code: sourceLocale, label: localeLabel(sourceLocale) },
      targetLocales.map(c => ({ code: c, label: localeLabel(c) })),
    )
    try {
      await navigator.clipboard.writeText(guide)
      setImgMsg({ kind: 'ok', text: t('파일명 규칙을 복사했습니다') })
    } catch {
      setImgMsg({ kind: 'err', text: t('복사 실패 — 클립보드 권한을 확인하세요') })
    }
  }

  async function handleImportFile(file: File) {
    const format: LocaleFileFormat = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'
    const text = await file.text()
    const { rows: parsed, warnings } = parseTemplate(text, format)
    const known = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
    const fresh = useProjectStore.getState().project?.slides ?? slides
    const { patches, written, baseWritten, localesSeen, issues: applyIssues } =
      applyCaptionRows(fresh, parsed, sourceLocale, known)
    if (Object.keys(patches).length) updateSlides(patches)
    const issues = [...warnings, ...applyIssues]
    // Surface any locale that arrived with values but wasn't selected yet.
    const toAdd = localesSeen.filter(l => !targetLocales.includes(l))
    if (toAdd.length) updateProject({ targetLocales: [...targetLocales, ...toAdd] })
    const baseNote = baseWritten ? ` (${t('기준 언어 {n}개 갱신', { n: baseWritten })})` : ''
    setIoIssues(issues)
    if (written === 0 && issues.length === 0) {
      setIoMsg({ kind: 'err', text: t('가져올 번역이 없습니다') })
    } else if (issues.length) {
      setIoMsg({ kind: 'err', text: `${t('{n}개 적용', { n: written })}${baseNote} · ${t('경고 {n}건 (아래 목록 확인)', { n: issues.length })}` })
    } else {
      setIoMsg({ kind: 'ok', text: `${t('{n}개 번역을 가져왔습니다', { n: written })}${baseNote}` })
    }
  }

  async function handleBulkImages(files: File[]) {
    const known = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
    const labelOf = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code
    const fresh = useProjectStore.getState().project?.slides ?? slides
    const { patches, addedLocales, applied, issues } = await importBulkImages(files, {
      slides: fresh,
      sourceLocale,
      targetLocales,
      knownLocales: known,
      labelOf,
      deviceModels: useProjectStore.getState().project?.deviceModels,
    })
    if (Object.keys(patches).length) updateSlides(patches)
    // Surface any override locale that wasn't selected yet, mirroring the caption
    // import path — otherwise the imported override is invisible and unexported.
    if (addedLocales.length) updateProject({ targetLocales: [...targetLocales, ...addedLocales] })
    gcImages()
    setImgIssues(issues)
    if (applied === 0 && issues.length === 0) {
      setImgMsg({ kind: 'err', text: t('가져올 이미지가 없습니다') })
    } else if (issues.length) {
      setImgMsg({ kind: 'err', text: `${t('{n}개 적용', { n: applied })} · ${t('경고 {n}건 (아래 목록 확인)', { n: issues.length })}` })
    } else {
      setImgMsg({ kind: 'ok', text: t('{n}개 이미지를 가져왔습니다', { n: applied }) })
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('로컬라이즈')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setStep(2)}
            className="rounded px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            {t('← 에디터')}
          </button>
          <button
            onClick={() => setStep(4)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:brightness-125"
          >
            {t('내보내기 →')}
          </button>
        </div>
      </div>

      {/* Config row */}
      <div className="flex flex-shrink-0 flex-wrap items-start gap-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        {/* Source locale */}
        <div>
          <div
            className="mb-1.5 text-xs text-[var(--color-text-dim)]"
            title={t('에디터에서 기준 언어로 입력한 텍스트가 번역 원본이 됩니다. 스크린샷이 없는 언어는 기준 언어 스크린샷을 사용합니다.')}
          >
            {t('기준 언어')}
          </div>
          <select
            value={sourceLocale}
            onChange={e => changeSourceLocale(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {SUPPORTED_LOCALES.map(l => (
              <option key={l.code} value={l.code}>{t(l.label)}</option>
            ))}
          </select>
        </div>

        {/* Target locales */}
        <div className="max-w-[26rem]">
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">{t('번역 언어')}</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => updateProject({ targetLocales: allSelected ? [] : selectableLocales })}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-text-dim)]"
            >
              {allSelected ? t('전체 해제') : t('전체 선택')}
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
                  {t(locale.label)}
                </label>
              )
            })}
          </div>
        </div>

        {/* Template import/export — translation happens externally */}
        <div>
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">{t('번역 양식 (외부 번역용)')}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => exportTemplate('csv')}
              disabled={textRows.length === 0 || targetLocales.length === 0}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              {t('CSV 내보내기')}
            </button>
            <button
              onClick={() => exportTemplate('json')}
              disabled={textRows.length === 0 || targetLocales.length === 0}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              {t('JSON 내보내기')}
            </button>
            <button
              onClick={openTranslationPrompt}
              disabled={textRows.length === 0 || targetLocales.length === 0}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
            >
              {t('번역 프롬프트')}
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('가져오기')}
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
          {ioIssues.length > 0 && (
            <details className="mt-1 max-w-72">
              <summary className="cursor-pointer text-xs text-red-600">{t('경고 {n}건 보기', { n: ioIssues.length })}</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-5 pr-2 text-[11px] leading-snug text-[var(--color-text-dim)]">
                {ioIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Bulk image import */}
        <div>
          <div className="mb-1.5 text-xs text-[var(--color-text-dim)]">{t('이미지 일괄')}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('이미지 가져오기')}
            </button>
            <button
              onClick={copyImageNamingGuide}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('규칙 복사')}
            </button>
          </div>
          <p className="mt-1 max-w-72 text-[11px] leading-snug text-[var(--color-text-dim)]">
            {t('파일명 {pattern} · 기준 언어({locale})가 베이스 · 예: 1.{locale}.png, 1.{alt}.png', { pattern: '{번호}.{언어}.png', locale: sourceLocale, alt: targetLocales[0] ?? 'en' })}
          </p>
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
          {imgIssues.length > 0 && (
            <details className="mt-1 max-w-72">
              <summary className="cursor-pointer text-xs text-red-600">{t('경고 {n}건 보기', { n: imgIssues.length })}</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-5 pr-2 text-[11px] leading-snug text-[var(--color-text-dim)]">
                {imgIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {targetLocales.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
            {t('번역할 언어를 선택하세요')}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
            {t('에디터에서 이미지나 텍스트를 먼저 추가하세요')}
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-14 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  {t('슬라이드')}
                </th>
                <th className="w-16 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  {t('필드')}
                </th>
                <th className="min-w-44 border-r border-[var(--color-border)] px-3 py-2 text-left text-xs font-medium text-[var(--color-text-dim)]">
                  {/* Base text is stored language-agnostically; the 기준 언어 dropdown
                      declares its language. Don't relabel this column to the chosen
                      source language — the stored text doesn't change when it flips. */}
                  {t('기준 언어')}
                </th>
                {targetLocales.map(locale => (
                  <th key={locale} className="min-w-44 border-r border-[var(--color-border)] px-3 py-2 text-left">
                    <span className="text-xs font-medium text-[var(--color-text-dim)]">
                      {t(localeLabel(locale))}
                    </span>
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
                    >
                      {row.slideIndex + 1}
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
                          placeholder={t('번역 없음')}
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

      {promptPreview !== null && (
        <Modal title={t('번역 프롬프트')} size="lg" onClose={() => setPromptPreview(null)}>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              {t('AI 도구에 붙여넣고, 내보낸 CSV/JSON 양식을 함께 첨부하세요. 결과 파일은 「가져오기」로 다시 불러옵니다.')}
            </p>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-xs leading-relaxed text-[var(--color-text)]">
              {promptPreview}
            </pre>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptPreview(null)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
              >
                {t('닫기')}
              </button>
              <button
                type="button"
                onClick={copyTranslationPrompt}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
              >
                {t('복사')}
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
