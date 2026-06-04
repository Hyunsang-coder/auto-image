// Composes the three project-import stages — manifest → skeleton, bulk
// screenshots by filename, caption fill from the localize template — into one
// fully-assembled, UNCOMMITTED Project. The caller (ProjectSetup) decides
// whether to commit via loadProject. Only side effect: importBulkImages
// persists image blobs to IndexedDB; on cancel they're orphans and gcImages
// sweeps them.

import type { Project, Slide } from '../types/project'
import { SUPPORTED_LOCALES } from '../constants/defaults'
import { importBulkImages } from './bulkImageImport'
import { parseTemplate, type LocaleFileFormat } from './localeIO'
import { applyCaptionRows } from './localePatch'
import { buildProjectFromManifest, isManifestShaped, parseManifest } from './projectImport'

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
    else routed.issues.push(`무시된 파일: ${file.name}`)
  }
  return routed
}

export interface ImportRunResult {
  project: Project | null
  applied: { slides: number; screenshots: number; captions: number }
  /** Locales added beyond the manifest's targetLocales by overrides/captions. */
  addedLocales: string[]
  issues: string[]
}

function foldPatches(slides: Slide[], patches: Record<string, Partial<Slide>>): Slide[] {
  return slides.map(s => (patches[s.id] ? { ...s, ...patches[s.id] } : s))
}

/** Run the full import pipeline. Never throws; failures land in `issues`. */
export async function runProjectImport(files: File[]): Promise<ImportRunResult> {
  const none = { slides: 0, screenshots: 0, captions: 0 }
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
      issues.push(`JSON을 파싱할 수 없음: ${file.name}`)
      continue
    }
    if (isManifestShaped(parsed)) {
      if (manifestText === null) manifestText = text
      else issues.push(`매니페스트가 여러 개 — 첫 파일만 사용 (무시: ${file.name})`)
    } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { rows?: unknown }).rows)) {
      if (captionJsonText === null) captionJsonText = text
      else issues.push(`캡션 JSON이 여러 개 — 첫 파일만 사용 (무시: ${file.name})`)
    } else {
      issues.push(`매니페스트도 캡션 양식도 아닌 JSON: ${file.name}`)
    }
  }

  if (manifestText === null) {
    issues.push('매니페스트(version + slides 배열을 가진 JSON)를 찾을 수 없습니다')
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
  let captions = 0

  if (routed.imageFiles.length) {
    const r = await importBulkImages(routed.imageFiles, {
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
    issues.push(`캡션 CSV가 여러 개 — 첫 파일만 사용 (무시: ${routed.csvFiles[1].name})`)
  }
  if (routed.csvFiles.length > 0) {
    if (captionJsonText !== null) issues.push('캡션 CSV와 JSON이 함께 있음 — CSV 사용')
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
    applied: { slides: project.slides.length, screenshots, captions },
    addedLocales,
    issues,
  }
}
