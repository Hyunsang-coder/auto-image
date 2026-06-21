#!/usr/bin/env node
// Headless render pipeline: agent-authored input in → exact-size PNGs out.
//
//   node scripts/headless-export.mjs <input> <out-dir> [--fastlane] [--report] [--bundle] [--validate] [--export-manifest] [--fail-on-layout-issues] [--slides 2,3] [--locale en,ja]
//
// <input> is either:
//   • a flat folder in the project-import format (docs/project-import.md):
//     manifest.json + caption CSV/JSON + {n}[-desc].{locale}.{ext} screenshots, or
//   • a lossless project bundle (.studio.zip) saved earlier — loaded straight
//     into the editor (no re-import), then rendered/exported the same way.
// PNGs land in <out-dir> as {locale}/{device}/NN.png (--fastlane: deliver layout
// + Appfile/Deliverfile/upload.sh). --bundle skips render and saves an editable
// project bundle (<out-dir>/<name>.studio.zip) to reopen in the editor later.
// --validate (import folders only) writes <out-dir>/import-result.json — the
// structured import result — and skips the editor + render entirely.
// --slides / --locale render only that subset (1-based slide numbers / locale
// codes) for fast iteration; a selected span half pulls in its partner.
// --export-manifest writes <out-dir>/manifest.json + captions.csv — the loaded
// project reversed into a re-importable manifest (lossy; lossless edits use
// project:patch) — and skips render.
// Starts the Vite dev server itself if localhost:5173 is down; reuses (and
// leaves alone) one that's already running.
import { chromium } from '@playwright/test'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rawArgs = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--slides', '--locale'])

// Read a value flag in either `--slides=2,3` or `--slides 2,3` form.
function flagValue(name) {
  const eq = rawArgs.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const i = rawArgs.indexOf(name)
  if (i >= 0 && i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) return rawArgs[i + 1]
  return undefined
}

// Positional args, skipping the value a space-form value flag consumes.
const positional = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a.startsWith('--')) {
    if (VALUE_FLAGS.has(a) && !a.includes('=')) i++
    continue
  }
  positional.push(a)
}
const [inDir, outDir] = positional
const fastlane = rawArgs.includes('--fastlane')
const failOnLayoutIssues = rawArgs.includes('--fail-on-layout-issues')
const report = rawArgs.includes('--report') || failOnLayoutIssues
const bundle = rawArgs.includes('--bundle')
const validate = rawArgs.includes('--validate')
const exportManifest = rawArgs.includes('--export-manifest')

// Targeted render: a subset of slides (1-based) and/or locales. Inert with
// --validate/--bundle (those don't reach the render path).
const slidesVal = flagValue('--slides')
const localeVal = flagValue('--locale')
const parsedSlides = slidesVal
  ? slidesVal.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 1)
  : undefined
const parsedLocales = localeVal ? localeVal.split(',').map((s) => s.trim()).filter(Boolean) : undefined
// A provided-but-unparseable filter must fail loudly — an empty array silently
// renders everything (slides) or nothing (out-of-range), the opposite of intent.
if (slidesVal !== undefined && (!parsedSlides || parsedSlides.length === 0)) {
  console.error(`--slides: no valid 1-based slide numbers in "${slidesVal}"`)
  process.exit(2)
}
if (localeVal !== undefined && (!parsedLocales || parsedLocales.length === 0)) {
  console.error(`--locale: no valid locale codes in "${localeVal}"`)
  process.exit(2)
}
const renderFilter =
  parsedSlides || parsedLocales
    ? {
        ...(parsedSlides ? { slides: parsedSlides } : {}),
        ...(parsedLocales ? { locales: parsedLocales } : {}),
      }
    : null
if (!inDir || !outDir) {
  console.error('Usage: node scripts/headless-export.mjs <input> <out-dir> [--fastlane] [--report] [--bundle] [--validate] [--export-manifest] [--fail-on-layout-issues] [--slides 2,3] [--locale en,ja]')
  process.exit(2)
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/app/'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (...a) => console.log('::', ...a)

// A single .zip/.studio.zip file is a bundle (loaded as-is); a directory is an
// import folder (manifest + screenshots + captions assembled on the fly).
const inputStat = await stat(inDir).catch(() => null)
if (!inputStat) {
  console.error(`input not found: ${inDir}`)
  process.exit(2)
}
const bundleMode = inputStat.isFile() && extname(inDir).toLowerCase() === '.zip'

const IMPORT_EXTS = new Set(['.json', '.csv', '.png', '.jpg', '.jpeg', '.webp'])
let files = []
if (!bundleMode) {
  files = (await readdir(inDir))
    .filter((f) => IMPORT_EXTS.has(extname(f).toLowerCase()))
    .map((f) => join(inDir, f))
  if (files.length === 0) {
    console.error(`no importable files (.json/.csv/images) in ${inDir}`)
    process.exit(2)
  }
}
if (validate && bundleMode) {
  log('--validate applies to import folders only; ignoring for a bundle input')
}
if (bundle && bundleMode) {
  log('bundle input + --bundle: loading then re-emitting a bundle (no-op-ish)')
}
if (renderFilter && (validate || bundle)) {
  log('--slides/--locale apply to render only; ignoring with --validate/--bundle')
}
if (exportManifest && (validate || bundle)) {
  log('--export-manifest takes precedence; ignoring --validate/--bundle')
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
let browser = null
try {
  browser = await chromium.launch()
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
  if (bundle) {
    await page.addInitScript(() => { window.__bundleExportEnabled = true })
  }
  if (validate && !bundleMode) {
    await page.addInitScript(() => { window.__validateEnabled = true })
  }
  if (renderFilter && !validate && !bundle) {
    await page.addInitScript((rf) => { window.__renderFilter = rf }, renderFilter)
  }
  if (exportManifest) {
    await page.addInitScript(() => { window.__exportManifestEnabled = true })
  }
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(BASE_URL)

  // True once a --validate dry run has written its result and we should stop
  // short of the editor/Export entirely.
  let validated = false

  if (bundleMode) {
    // Lossless bundle path: open the .studio.zip directly. Fresh profile → the
    // load commits immediately (no overwrite confirm). Success lands on step 2
    // (the header "프로젝트 파일 저장" button only shows there); failure shows
    // the bundle-error modal.
    await page.getByText('프로젝트 파일 열기').first().waitFor()
    await page.locator('input[accept=".zip"]').setInputFiles(inDir)
    const ready = page
      .getByRole('button', { name: '프로젝트 파일 저장' })
      .waitFor({ timeout: 30_000 })
      .then(() => 'ok', () => null)
    const failed = page
      .getByText('프로젝트 파일을 열 수 없습니다. 올바른 프로젝트 .zip 파일인지 확인하세요.')
      .waitFor({ timeout: 30_000 })
      .then(() => 'fail', () => null)
    if ((await Promise.race([ready, failed])) !== 'ok') {
      console.error(':: failed to open project bundle: ' + inDir)
      process.exit(1)
    }
    log('opened bundle:', inDir)
  } else {
    await page.getByText('프로젝트 가져오기').first().waitFor()
    await page.locator('input[accept=".json,.csv,image/*"]').setInputFiles(files)

    if (validate && !exportManifest) {
      // Dry run: wait for the structured result the app publishes — it's set on
      // BOTH success and failure (a malformed manifest yields {ok:false}), so we
      // must not block on the success-only summary line (which never appears on
      // failure). No commit, no editor, no render; blobs ride with the profile.
      await page
        .waitForFunction(() => window.__importResult != null, { timeout: 30_000 })
        .catch(() => {})
      await mkdir(outDir, { recursive: true })
      const importResult = await page.evaluate(() => window.__importResult ?? null)
      if (!importResult) {
        console.error(':: validate: __importResult was not produced')
        exitCode = 1
      } else {
        const parsed = JSON.parse(importResult)
        const resultPath = join(outDir, 'import-result.json')
        await writeFile(resultPath, JSON.stringify(parsed, null, 2))
        log('import result saved →', resultPath)
        log(`import ${parsed.ok ? 'ok' : 'FAILED'}; issues: ${parsed.issues?.length ?? 0}`)
        if (!parsed.ok) exitCode = 1
      }
      validated = true
    } else {
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
    }
  }

  if (validated) {
    // nothing more to do — the dry run already wrote import-result.json
  } else if (exportManifest) {
    // Reverse the loaded project back to a manifest + caption template. Both the
    // bundle and import paths land on step 2 first (the header "프로젝트 파일
    // 저장" button only shows there), so the store has a committed project.
    await page.getByRole('button', { name: '프로젝트 파일 저장' }).first().waitFor({ timeout: 30_000 })
    await mkdir(outDir, { recursive: true })
    const raw = await page.evaluate(() => window.__exportManifest?.() ?? null)
    if (!raw) {
      console.error(':: export-manifest: __exportManifest produced nothing')
      exitCode = 1
    } else {
      const res = JSON.parse(raw)
      if (!res.manifest) {
        console.error(':: export-manifest: no project loaded')
        exitCode = 1
      } else {
        await writeFile(join(outDir, 'manifest.json'), JSON.stringify(res.manifest, null, 2))
        await writeFile(join(outDir, 'captions.csv'), res.captions)
        log('manifest →', join(outDir, 'manifest.json'))
        log('captions →', join(outDir, 'captions.csv'))
        if (res.screenshotPlan?.length) log('screenshot plan:', res.screenshotPlan.join(', '))
        if (res.issues?.length) log('lossy (not represented in the manifest):\n:: ' + res.issues.join('\n:: '))
      }
    }
  } else if (bundle) {
    // Editable project bundle (project.json + image blobs) instead of PNGs —
    // reopen in the editor later via "프로젝트 파일 열기". App exposes the
    // download via window.__downloadProjectBundle when __bundleExportEnabled.
    await mkdir(outDir, { recursive: true })
    const dl = page.waitForEvent('download', { timeout: 120_000 })
    await page.evaluate(() => window.__downloadProjectBundle())
    const d = await dl
    const bundlePath = join(outDir, d.suggestedFilename())
    await d.saveAs(bundlePath)
    log(`project bundle → ${bundlePath}`)
  } else {
  await page.getByRole('button', { name: /Export/ }).click()

  const exportBtn = page.getByRole('button', { name: fastlane ? 'fastlane용 ZIP' : /ZIP 내보내기/ })
  // Empty render plan (e.g. --locale matched no project locale) disables export
  // and relabels the primary button — detect it and fail fast instead of
  // clicking a disabled button and waiting out the action timeout.
  const emptyPlanBtn = page.getByRole('button', { name: '내보낼 언어를 선택하세요' })
  await Promise.race([
    exportBtn.waitFor({ timeout: 30_000 }).then(() => {}, () => {}),
    emptyPlanBtn.waitFor({ timeout: 30_000 }).then(() => {}, () => {}),
  ])
  if (await emptyPlanBtn.isVisible()) {
    console.error(':: nothing to export — no locales matched (check --locale)')
    process.exit(1)
  }
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
    // A targeted run that matched nothing yields an empty archive — that's a
    // failed invocation, not a success (don't let exitCode stay 0).
    if (renderFilter && count === 0) {
      console.error(':: targeted render produced no files — check --slides/--locale match the project')
      exitCode = 1
    }
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
  }

  if (errors.length > 0) log('console errors:', JSON.stringify(errors))
} finally {
  if (browser) await browser.close()
  // Tear down a self-started dev server even if browser launch itself threw.
  if (server) try { process.kill(-server.pid) } catch { /* already gone */ }
}
process.exit(exitCode)
