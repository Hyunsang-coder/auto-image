#!/usr/bin/env node
// Headless render pipeline: agent-authored import folder in → exact-size PNGs out.
//
//   node scripts/headless-export.mjs <input-dir> <out-dir> [--fastlane] [--report] [--fail-on-layout-issues]
//
// <input-dir> is a flat folder in the project-import format (docs/project-import.md):
// manifest.json + caption CSV/JSON + {n}[-desc].{locale}.{ext} screenshots.
// PNGs land in <out-dir> as {locale}/{device}/NN.png (--fastlane: deliver layout
// + Appfile/Deliverfile/upload.sh). Starts the Vite dev server itself if
// localhost:5173 is down; reuses (and leaves alone) one that's already running.
import { chromium } from '@playwright/test'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const [inDir, outDir] = positional
const fastlane = process.argv.includes('--fastlane')
const failOnLayoutIssues = process.argv.includes('--fail-on-layout-issues')
const report = process.argv.includes('--report') || failOnLayoutIssues
if (!inDir || !outDir) {
  console.error('Usage: node scripts/headless-export.mjs <input-dir> <out-dir> [--fastlane] [--report] [--fail-on-layout-issues]')
  process.exit(2)
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/app/'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (...a) => console.log('::', ...a)

const IMPORT_EXTS = new Set(['.json', '.csv', '.png', '.jpg', '.jpeg', '.webp'])
const files = (await readdir(inDir))
  .filter((f) => IMPORT_EXTS.has(extname(f).toLowerCase()))
  .map((f) => join(inDir, f))
if (files.length === 0) {
  console.error(`no importable files (.json/.csv/images) in ${inDir}`)
  process.exit(2)
}

const ping = () => fetch(BASE_URL).then((r) => r.ok, () => false)
let server = null
if (!(await ping())) {
  log('starting dev server…')
  server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: true })
  const deadline = Date.now() + 30_000
  while (!(await ping())) {
    if (Date.now() > deadline) {
      console.error('dev server did not come up on ' + BASE_URL)
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}

let exitCode = 0
const browser = await chromium.launch()
try {
  // Fresh profile every run — no persisted project, so step 1 (import) is
  // always where we land and no overwrite confirmation appears.
  // ko-KR: the UI language follows navigator.language and we drive Korean text.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
  if (report) {
    await page.addInitScript(() => {
      window.__layoutReportEnabled = true
      window.__layoutReport = null
      window.__layoutSummary = null
    })
  }
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(BASE_URL)
  await page.getByText('프로젝트 가져오기').first().waitFor()
  await page.locator('input[accept=".json,.csv,image/*"]').setInputFiles(files)

  const summary = page.locator('p', { hasText: /슬라이드 \d+장 · 스크린샷 \d+개 · 캡션 \d+개 적용/ })
  await summary.waitFor({ timeout: 30_000 })
  log('import:', (await summary.textContent()).trim())
  const warnToggle = page.getByText(/경고 \d+건 보기/)
  if (await warnToggle.isVisible()) {
    await warnToggle.click()
    const issues = (await page.locator('details ul').innerText()).trim()
    log('import warnings:\n:: ' + issues.replace(/\n/g, '\n:: '))
  }
  await page.getByRole('button', { name: '에디터에서 검수 →' }).click()
  await page.getByRole('button', { name: /Export/ }).click()

  const exportBtn = page.getByRole('button', { name: fastlane ? 'fastlane용 ZIP' : /ZIP 내보내기/ })
  await exportBtn.waitFor()
  // Render can take minutes for slides × locales. Two terminal states: the ZIP
  // download fires, or every render failed and the no-files error shows.
  const downloadP = page.waitForEvent('download', { timeout: 600_000 }).then((d) => d, () => null)
  const totalFailP = page
    .getByText(/내보낸 파일이 없습니다/)
    .waitFor({ timeout: 600_000 })
    .then(() => 'total-failure', () => null)
  await exportBtn.click()
  const outcome = await Promise.race([downloadP, totalFailP])

  const failures = await page.locator('li', { hasText: '렌더 실패' }).allInnerTexts()
  if (failures.length > 0) {
    exitCode = 1
    console.error(':: render failures:\n:: ' + failures.join('\n:: '))
  }

  if (outcome === 'total-failure' || outcome === null) {
    console.error(outcome === null ? ':: export timed out' : ':: every render failed — no ZIP produced')
    exitCode = 1
  } else {
    await mkdir(outDir, { recursive: true })
    const zipPath = join(outDir, outcome.suggestedFilename())
    await outcome.saveAs(zipPath)
    const zip = await JSZip.loadAsync(await readFile(zipPath))
    let count = 0
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const dest = join(outDir, path)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(await entry.async('uint8array')))
      // jszip doesn't apply stored permissions on extract — upload.sh ships 755.
      if (entry.unixPermissions & 0o111) await chmod(dest, entry.unixPermissions & 0o777)
      count++
    }
    await rm(zipPath)
    log(`extracted ${count} files → ${outDir}`)
  }

  if (report) {
    await mkdir(outDir, { recursive: true })
    const { layoutReport, layoutSummary } = await page.evaluate(() => ({
      layoutReport: window.__layoutReport ?? null,
      layoutSummary: window.__layoutSummary ?? null,
    }))
    if (!layoutReport) {
      console.error(':: layout report was not produced')
      exitCode = 1
    } else {
      const reportPath = join(outDir, 'layout-report.json')
      const summaryPath = join(outDir, 'layout-summary.json')
      const summary = layoutSummary ?? {
        version: 1,
        generatedAt: layoutReport.generatedAt,
        project: layoutReport.project,
        summary: layoutReport.summary,
        issues: layoutReport.renders.flatMap((render) =>
          render.issues.map((issue) => ({
            slideNo: render.slideNo,
            slideId: render.slideId,
            locale: render.locale,
            template: render.template,
            device: render.device,
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
            objects: issue.objects,
            manifestPaths: issue.manifestPaths ?? [],
            suggestedFix: issue.suggestedFix ?? null,
            ...(issue.metrics ? { metrics: issue.metrics } : {}),
          })),
        ),
      }
      await writeFile(reportPath, JSON.stringify(layoutReport, null, 2))
      await writeFile(summaryPath, JSON.stringify(summary, null, 2))
      const byCode = Object.entries(layoutReport.summary.byCode)
        .map(([code, n]) => `${code}=${n}`)
        .join(', ')
      log(
        `layout report: ${layoutReport.summary.renderCount} renders, ` +
        `${layoutReport.summary.issueCount} issues` +
        (byCode ? ` (${byCode})` : ''),
      )
      log(`layout report saved → ${reportPath}`)
      log(`layout summary saved → ${summaryPath}`)
      if (failOnLayoutIssues && layoutReport.summary.issueCount > 0) {
        console.error(`:: failing because --fail-on-layout-issues found ${layoutReport.summary.issueCount} layout issues`)
        exitCode = 1
      }
    }
  }

  if (errors.length > 0) log('console errors:', JSON.stringify(errors))
} finally {
  await browser.close()
  if (server) try { process.kill(-server.pid) } catch { /* already gone */ }
}
process.exit(exitCode)
