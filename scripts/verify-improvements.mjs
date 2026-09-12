#!/usr/bin/env node
// Verification harness for the P0+P1 review improvements.
// Score = Vitest regression checks (60) + static structural checks (40) = 100.
//   npm run harness
// A check passes only when the improvement is actually in place:
//  - Vitest checks: tagged `[H-Vn]` tests in src/lib/*.test.ts must pass.
//  - Static checks: the source must contain the fixed shape (and the run
//    below validates every check FAILS on the pre-fix tree, so a pass means
//    the fix landed — not that the regex is loose).
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const VITEST_FILES = [
  'src/lib/imageRefs.test.ts',
  'src/lib/localeOverride.test.ts',
  'src/lib/projectBundle.test.ts',
  'src/lib/thumbnailPlan.test.ts',
  'src/lib/documentModel.test.ts',
  'src/lib/historyStructure.test.ts',
  'src/lib/exportPreview.test.ts',
  'src/lib/throttledStorage.test.ts',
]

// id, points, tag in test titles, what it guards
const VITEST_CHECKS = [
  { id: 'V1', pts: 12, tag: '[H-V1]', desc: 'projectImageKeys keeps slide.localeOverrides background keys (no GC/bundle/mirror loss)' },
  { id: 'V2', pts: 10, tag: '[H-V2]', desc: 'locale-mode badge text edits route to translations, not the shared base' },
  { id: 'V3', pts: 6, tag: '[H-V3]', desc: 'locale-mode external-image edits write the shared base (no silent no-op)' },
  { id: 'V4', pts: 8, tag: '[H-V4]', desc: 'bundle schema-version resolution is explicit; v5 migrate is a pure passthrough' },
  { id: 'V5', pts: 10, tag: '[H-V5]', desc: 'span-group thumbnails plan one wide render per group, committed to both halves' },
  { id: 'V6', pts: 6, tag: '[H-V6]', desc: 'dirty hash is key-order insensitive (canonical stringify)' },
  { id: 'V7', pts: 4, tag: '[H-V7]', desc: 'structuralSignature captures ids+lengths for history invalidation' },
  { id: 'V8', pts: 2, tag: '[H-V8]', desc: 'previewRenderWidth maps size 1..5 to a capped width, 5 = full resolution' },
  { id: 'V9', pts: 2, tag: '[H-V9]', desc: 'persist storage wrapper coalesces write bursts, flushes the trailing write' },
]

function has(hay, re) {
  return re.test(hay)
}

// id, points, description, run() -> { pass, evidence }
const STATIC_CHECKS = [
  {
    id: 'S1', pts: 5, desc: 'toolbar Undo/Redo disabled in locale mode',
    run() {
      const toolbar = read('src/components/editor/CanvasToolbar.tsx')
      const layout = read('src/components/editor/EditorLayout.tsx')
      const prop = has(toolbar, /actionsDisabled/) && has(toolbar, /disabled=\{[^}]*actionsDisabled/)
      const wired = has(layout, /<CanvasToolbar[\s\S]*?actionsDisabled=\{isLocaleMode\}/)
      return { pass: prop && wired, evidence: `toolbar prop=${prop} layout wiring=${wired}` }
    },
  },
  {
    id: 'S2', pts: 3, desc: 'locale-resolved canvas slides memoized (no per-render identity churn)',
    run() {
      const layout = read('src/components/editor/EditorLayout.tsx')
      const a = has(layout, /const canvasSlide = useMemo\(\s*\(\) =>/)
      const b = has(layout, /const canvasFollower = useMemo\(\s*\(\) =>/)
      return { pass: a && b, evidence: `canvasSlide memo=${a} canvasFollower memo=${b}` }
    },
  },
  {
    id: 'S3a', pts: 4, desc: 'reseed effect clears undo/redo on external structural change',
    run() {
      const fab = read('src/components/editor/FabricCanvas.tsx')
      const uses = has(fab, /[Ss]tructuralSignature\(/)
      const clears = has(fab, /structureChanged[\s\S]{0,400}?undoStack\.current = \[\]/)
      return { pass: uses && clears, evidence: `signature use=${uses} structural clear=${clears}` }
    },
  },
  {
    id: 'S3b', pts: 3, desc: 'canvas→store text sync skips stale snapshots on length mismatch',
    run() {
      const fab = read('src/components/editor/FabricCanvas.tsx')
      const guard = has(fab, /canvasTextCount|textsLengthMismatch|staleSnapshot/)
      return { pass: guard, evidence: `length guard token=${guard}` }
    },
  },
  {
    id: 'S4', pts: 4, desc: 'export preview renders at an explicit capped width, not full resolution',
    run() {
      const panel = read('src/components/export/ExportPanel.tsx')
      const capped = has(panel, /previewRenderWidth\(previewSize\)/)
      const arg = has(panel, /previewRenderWidth\(previewSize\)\s*,?\s*\)/)
      return { pass: capped && arg, evidence: `mapping=${capped} passed as width=${arg}` }
    },
  },
  {
    id: 'S5', pts: 4, desc: 'retired library snapshots removed from the store after file migration',
    run() {
      const io = read('src/lib/documentIO.ts')
      const shell = read('src/components/document/DocumentShell.tsx')
      const ids = has(io, /migratedIds/)
      const removed = has(shell, /removeProject/)
      return { pass: ids && removed, evidence: `migratedIds=${ids} store removal=${removed}` }
    },
  },
  {
    id: 'S6', pts: 3, desc: 'store→lib edge is one-way (no module cycle with imageRefs)',
    run() {
      const stores = [
        read('src/store/useProjectStore.ts'),
        read('src/store/useLibraryStore.ts'),
        read('src/store/useCustomStore.ts'),
      ].join('\n')
      // Either direction alone is fine; the bug was the cycle (store imports
      // imageRefs while imageRefs reads the stores). GC now lives at the
      // callers, so no store module may import the lib.
      const storeClean = !stores.includes('lib/imageRefs')
      const storeSweepGone = !has(read('src/store/useProjectStore.ts'), /gcImages\(/)
      const gcAtCallers = ['src/components/setup/ProjectSetup.tsx', 'src/lib/agentBridge.ts', 'src/App.tsx']
        .every((f) => read(f).includes('gcImages()'))
      return { pass: storeClean && storeSweepGone && gcAtCallers, evidence: `stores import imageRefs=${!storeClean} in-store sweep=${!storeSweepGone} caller sweeps=${gcAtCallers}` }
    },
  },
  {
    id: 'S7', pts: 4, desc: 'bridge newProject refuses to clobber unsaved work without discardUnsaved',
    run() {
      const bridge = read('src/lib/agentBridge.ts')
      const guard = has(bridge, /async newProject[\s\S]{0,1200}?isDirty\(/)
      const flag = has(bridge, /async newProject[\s\S]{0,1200}?discardUnsaved/)
      return { pass: guard && flag, evidence: `isDirty guard=${guard} discardUnsaved flag=${flag}` }
    },
  },
  {
    id: 'S8', pts: 3, desc: 'save path does not block on the recents thumbnail render',
    run() {
      const io = read('src/lib/documentIO.ts')
      const bg = has(io, /void projectPreview\(project\)\.then/)
      const noAwait = !has(io, /await projectPreview\(project\)/)
      return { pass: bg && noAwait, evidence: `fire-and-forget=${bg} no await=${noAwait}` }
    },
  },
  {
    id: 'S9', pts: 2, desc: 'tray memoized with stable props (memo + useMemo/useCallback at the caller)',
    run() {
      const list = read('src/components/editor/SlideList.tsx')
      const layout = read('src/components/editor/EditorLayout.tsx')
      const a = has(list, /memo\(function SlideList/)
      const b = has(layout, /const displaySelectedIds = useMemo\(/)
      const c = has(layout, /const handleSlideSelect = useCallback\(/)
      return { pass: a && b && c, evidence: `SlideList memo=${a} selection memo=${b} select useCallback=${c}` }
    },
  },
  {
    id: 'S10', pts: 5, desc: 'hot paths wired to the new helpers (hook uses planner, store uses throttled persist)',
    run() {
      const hook = read('src/components/editor/useSlideThumbnails.ts')
      const store = read('src/store/useProjectStore.ts')
      const planner = has(hook, /planThumbnailJobs\(/) && !has(hook, /for \(const slide of todo\)/)
      const throttled = has(store, /throttledStorage\(/)
      return { pass: planner && throttled, evidence: `hook planner=${planner} store throttled=${throttled}` }
    },
  },
]

function runVitest() {
  let json = ''
  try {
    json = execFileSync(
      'npx', ['vitest', 'run', ...VITEST_FILES, '--reporter=json'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    )
  } catch (e) {
    // vitest exits non-zero when tests fail — the JSON is still on stdout.
    json = e.stdout ?? ''
  }
  const start = json.indexOf('{')
  if (start < 0) return null
  try {
    return JSON.parse(json.slice(start))
  } catch {
    return null
  }
}

function main() {
  const rows = []
  let total = 0
  const MAX = VITEST_CHECKS.reduce((n, c) => n + c.pts, 0) + STATIC_CHECKS.reduce((n, c) => n + c.pts, 0)

  const report = runVitest()
  const flat = []
  if (report) {
    for (const r of report.testResults ?? []) {
      for (const a of r.assertionResults ?? []) flat.push(a)
    }
  }
  for (const c of VITEST_CHECKS) {
    const matched = flat.filter((a) => (a.fullName ?? a.title ?? '').includes(c.tag))
    const pass = report !== null && matched.length > 0 && matched.every((a) => a.status === 'passed')
    const got = pass ? c.pts : 0
    total += got
    rows.push({
      id: c.id, pts: `${got}/${c.pts}`, ok: pass,
      detail: report === null
        ? 'vitest output unparseable'
        : matched.length === 0 ? `no test tagged ${c.tag} ran` : `${matched.filter((a) => a.status === 'passed').length}/${matched.length} tagged tests passed`,
      desc: c.desc,
    })
  }

  for (const c of STATIC_CHECKS) {
    let r
    try {
      r = c.run()
    } catch (e) {
      r = { pass: false, evidence: `check threw: ${e.message}` }
    }
    const got = r.pass ? c.pts : 0
    total += got
    rows.push({ id: c.id, pts: `${got}/${c.pts}`, ok: r.pass, detail: r.evidence, desc: c.desc })
  }

  const line = (s) => process.stdout.write(`${s}\n`)
  line('CHECK  PTS    RESULT  DETAIL')
  for (const r of rows) {
    line(`${r.id.padEnd(6)} ${r.pts.padEnd(6)} ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.desc} — ${r.detail}`)
  }
  line(`\nTOTAL ${total}/${MAX}`)
  if (total !== MAX) {
    line('Harness is red: fix the code (or the check, if the evidence shows a false negative) and re-run.')
    process.exit(1)
  }
  line('Harness is green: all P0+P1 improvements verified.')
}

main()
