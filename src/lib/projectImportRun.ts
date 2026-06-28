// Composes the three project-import stages — manifest → skeleton, bulk
// screenshots by filename, caption fill from the localize template — into one
// fully-assembled, UNCOMMITTED Project. The caller (ProjectSetup) decides
// whether to commit via loadProject. Only side effect: importBulkImages
// persists image blobs to IndexedDB; on cancel they're orphans and gcImages
// sweeps them.

import type { ExternalImage, Project, Slide } from '../types/project'
import { DEFAULT_SCREENSHOT_STYLE, SUPPORTED_LOCALES, newId } from '../constants/defaults'
import { t } from '../i18n'
import { importBulkImages } from './bulkImageImport'
import { fileToImageKey } from './imageStore'
import { parseTemplate, type LocaleFileFormat } from './localeIO'
import { applyCaptionRows } from './localePatch'
import { buildProjectFromManifest, isManifestShaped, parseManifest, type ParsedManifest } from './projectImport'

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i

export interface RoutedImportFiles {
  /** Manifest vs caption-template JSON is decided by shape, not name — see classifyJson. */
  jsonFiles: File[]
  csvFiles: File[]
  imageFiles: File[]
  issues: string[]
}

export function routeImportFiles(files: File[]): RoutedImportFiles {
  const routed: RoutedImportFiles = { jsonFiles: [], csvFiles: [], imageFiles: [], issues: [] }
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (IMAGE_EXT.test(name)) routed.imageFiles.push(file)
    else if (name.endsWith('.json')) routed.jsonFiles.push(file)
    else if (name.endsWith('.csv')) routed.csvFiles.push(file)
    else routed.issues.push(t('무시된 파일: {name}', { name: file.name }))
  }
  return routed
}

export interface ImportRunResult {
  project: Project | null
  applied: { slides: number; screenshots: number; externalImages: number; captions: number }
  /** Locales added beyond the manifest's targetLocales by overrides/captions. */
  addedLocales: string[]
  issues: string[]
}

function foldPatches(slides: Slide[], patches: Record<string, Partial<Slide>>): Slide[] {
  return slides.map(s => (patches[s.id] ? { ...s, ...patches[s.id] } : s))
}

function basename(name: string): string {
  return name.split(/[\\/]/).pop() ?? name
}

async function importExternalImages(
  imageFiles: File[],
  manifest: ParsedManifest,
  project: Project,
  issues: string[],
): Promise<{ applied: number; consumed: Set<File> }> {
  const filesByName = new Map<string, File[]>()
  for (const file of imageFiles) {
    const bucket = filesByName.get(file.name) ?? []
    bucket.push(file)
    filesByName.set(file.name, bucket)
  }

  const consumed = new Set<File>()
  let applied = 0
  for (const [slideIndex, spec] of manifest.slides.entries()) {
    if (!spec.externalImages?.length) continue
    const slide = project.slides[slideIndex]
    if (!slide) continue
    const externalImages: ExternalImage[] = []
    for (const [imageIndex, imageSpec] of spec.externalImages.entries()) {
      const wanted = basename(imageSpec.file)
      const file = filesByName.get(wanted)?.find((candidate) => !consumed.has(candidate))
      if (!file) {
        issues.push(t('슬라이드 {n}: 외부 이미지 파일을 찾을 수 없음: {name}', { n: slideIndex + 1, name: imageSpec.file }))
        continue
      }
      let result
      try {
        result = await fileToImageKey(file)
      } catch {
        issues.push(t('슬라이드 {n}: 외부 이미지를 읽을 수 없음: {name}', { n: slideIndex + 1, name: imageSpec.file }))
        consumed.add(file)
        continue
      }
      consumed.add(file)
      externalImages.push({
        id: newId('ext'),
        imageKey: result.key,
        originalWidth: result.width,
        originalHeight: result.height,
        x: imageSpec.x ?? Math.min(0.62, 0.5 + imageIndex * 0.04),
        y: imageSpec.y ?? Math.min(0.62, 0.5 + imageIndex * 0.04),
        width: imageSpec.width ?? 0.32,
        rotation: imageSpec.rotation ?? 0,
        opacity: imageSpec.opacity ?? 1,
        cornerRadiusRatio: imageSpec.cornerRadiusRatio ?? DEFAULT_SCREENSHOT_STYLE.cornerRadiusRatio,
        shadow: imageSpec.shadow ?? DEFAULT_SCREENSHOT_STYLE.shadow,
        ...(imageSpec.crop ? { crop: { ...imageSpec.crop } } : {}),
      })
      applied++
    }
    if (externalImages.length) {
      project.slides[slideIndex] = { ...slide, externalImages }
    }
  }
  return { applied, consumed }
}

/** Run the full import pipeline. Never throws; failures land in `issues`. */
export async function runProjectImport(files: File[]): Promise<ImportRunResult> {
  const none = { slides: 0, screenshots: 0, externalImages: 0, captions: 0 }
  const routed = routeImportFiles(files)
  const issues = [...routed.issues]

  // Classify .json files by shape: a manifest has version + slides[], a
  // caption template has rows[]. Names are not trusted — agents vary.
  let manifestText: string | null = null
  let captionJsonText: string | null = null
  for (const file of routed.jsonFiles) {
    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      issues.push(t('JSON을 파싱할 수 없음: {name}', { name: file.name }))
      continue
    }
    if (isManifestShaped(parsed)) {
      if (manifestText === null) manifestText = text
      else issues.push(t('매니페스트가 여러 개 — 첫 파일만 사용 (무시: {name})', { name: file.name }))
    } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { rows?: unknown }).rows)) {
      if (captionJsonText === null) captionJsonText = text
      else issues.push(t('캡션 JSON이 여러 개 — 첫 파일만 사용 (무시: {name})', { name: file.name }))
    } else {
      issues.push(t('매니페스트도 캡션 양식도 아닌 JSON: {name}', { name: file.name }))
    }
  }

  if (manifestText === null) {
    issues.push(t('매니페스트(version + slides 배열을 가진 JSON)를 찾을 수 없습니다'))
    return { project: null, applied: none, addedLocales: [], issues }
  }

  const { manifest, issues: manifestIssues } = parseManifest(manifestText)
  issues.push(...manifestIssues)
  if (!manifest) return { project: null, applied: none, addedLocales: [], issues }

  const project = buildProjectFromManifest(manifest)
  const knownLocales = new Set<string>(SUPPORTED_LOCALES.map(l => l.code))
  const labelOf = (code: string) => SUPPORTED_LOCALES.find(l => l.code === code)?.label ?? code
  const addedLocales: string[] = []
  let screenshots = 0
  let externalImages = 0
  let captions = 0

  if (routed.imageFiles.length) {
    const external = await importExternalImages(routed.imageFiles, manifest, project, issues)
    externalImages = external.applied
    const screenshotFiles = routed.imageFiles.filter((file) => !external.consumed.has(file))
    const r = await importBulkImages(screenshotFiles, {
      slides: project.slides,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales,
      knownLocales,
      labelOf,
      deviceModels: project.deviceModels,
    })
    project.slides = foldPatches(project.slides, r.patches)
    project.targetLocales = [...project.targetLocales, ...r.addedLocales]
    addedLocales.push(...r.addedLocales)
    screenshots = r.applied
    issues.push(...r.issues)
  }

  let captionText: string | null = null
  let captionFormat: LocaleFileFormat = 'csv'
  if (routed.csvFiles.length > 1) {
    issues.push(t('캡션 CSV가 여러 개 — 첫 파일만 사용 (무시: {name})', { name: routed.csvFiles[1].name }))
  }
  if (routed.csvFiles.length > 0) {
    if (captionJsonText !== null) issues.push(t('캡션 CSV와 JSON이 함께 있음 — CSV 사용'))
    captionText = await routed.csvFiles[0].text()
  } else if (captionJsonText !== null) {
    captionText = captionJsonText
    captionFormat = 'json'
  }

  if (captionText !== null) {
    const { rows, warnings } = parseTemplate(captionText, captionFormat)
    issues.push(...warnings)
    const r = applyCaptionRows(project.slides, rows, project.sourceLocale, knownLocales)
    project.slides = foldPatches(project.slides, r.patches)
    const toAdd = r.localesSeen.filter(l => !project.targetLocales.includes(l))
    project.targetLocales = [...project.targetLocales, ...toAdd]
    addedLocales.push(...toAdd)
    captions = r.written
    issues.push(...r.issues)
  }

  return {
    project,
    applied: { slides: project.slides.length, screenshots, externalImages, captions },
    addedLocales,
    issues,
  }
}
