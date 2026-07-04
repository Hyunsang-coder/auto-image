#!/usr/bin/env node
// MCP server exposing the headless screenshot pipeline to AI agents over stdio.
// Wraps the existing CLIs (headless-export, project-patch/inspect, layout loop)
// so an agent can author, validate, render, inspect, and surgically edit App
// Store screenshot projects end-to-end without a human in the loop.
//
//   npm run mcp            # stdio server (registered for Claude Code in .mcp.json)
//
// Run via tsx: the design-reference tool imports the TS constants graph
// (THEME_PRESETS, DEVICE_SPECS, …) directly instead of duplicating the data.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_TEXTS, ORNAMENT_DEFAULTS, SUPPORTED_LOCALES, THEME_PRESETS } from '../src/constants/defaults.ts'
import { DEFAULT_MODEL, DEVICE_SPECS, EDITOR_CANVAS_WIDTH } from '../src/constants/deviceSpecs.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TSX_BIN = join(ROOT, 'node_modules', '.bin', 'tsx')
const HEADLESS = join(ROOT, 'scripts', 'headless-export.mjs')

// Paths from the client may be relative — anchor them to the repo root (the
// server's cwd when launched from .mcp.json), never to the transient tmp cwd.
const abs = (p) => (isAbsolute(p) ? p : resolve(ROOT, p))

const server = new McpServer({ name: 'screenshot-studio', version: '1.0.0' })

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = (data) => ({ ...ok(data), isError: true })
const tail = (s, n = 6000) => (s.length > n ? '…' + s.slice(-n) : s)

// Stream child stdout/stderr lines as MCP progress notifications so long
// renders (minutes) keep the client's tool-call timeout alive.
function progressReporter(extra) {
  const token = extra._meta?.progressToken
  let n = 0
  return async (message) => {
    if (token === undefined) return
    try {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: { progressToken: token, progress: ++n, message },
      })
    } catch {
      /* client gone — the child keeps running to completion */
    }
  }
}

function run(bin, args, onLine) {
  return new Promise((done) => {
    const child = spawn(bin, args, { cwd: ROOT, env: process.env })
    let output = ''
    let buf = ''
    const push = (chunk) => {
      output += chunk
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) void onLine?.(line)
      }
    }
    child.stdout.on('data', (d) => push(String(d)))
    child.stderr.on('data', (d) => push(String(d)))
    child.on('error', (e) => done({ code: 1, output: output + '\n' + e.message }))
    child.on('close', (code) => done({ code: code ?? 1, output }))
  })
}

const runNode = (args, onLine) => run(process.execPath, args, onLine)

async function listPngs(dir) {
  const found = []
  const walk = async (d, rel) => {
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const r = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) await walk(join(d, ent.name), r)
      else if (ent.name.endsWith('.png')) found.push(r)
    }
  }
  await walk(dir, '')
  return found.sort()
}

async function readJsonIf(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

const tmp = () => mkdtemp(join(tmpdir(), 'studio-mcp-'))

// ---------------------------------------------------------------------------
// Knowledge tools — the vocabulary an agent needs before authoring anything.
// ---------------------------------------------------------------------------

server.registerTool(
  'get_import_spec',
  {
    title: 'Import manifest spec',
    description:
      'The full authoring spec (Korean) for the project-import format: manifest schema (layouts, ' +
      'deviceFrame transform, screenshotStyle, texts styling, badges, ornaments, external images, ' +
      'highlights/loupe, 2-page spans, textY), screenshot filename rules, caption CSV/JSON format, ' +
      'and the layout report/issue codes. Read this before authoring a manifest.',
  },
  async () => ({ content: [{ type: 'text', text: await readFile(join(ROOT, 'docs', 'project-import.md'), 'utf8') }] }),
)

const PATCH_SPEC = `# Surgical patch ops (patch_bundle)

Ops apply to a lossless .studio.zip bundle; every untouched field is preserved
bit-for-bit (ids, localeOverrides, highlights). Address slides by 1-based
"slide" or by "slideId". Text fields: "headline" (=text:0), "subheadline"
(=text:1), "text:N", "badge:N". Locale routing: locale === project sourceLocale
writes the base text/screenshot, any other locale writes the translation /
locale override (new locales are auto-added to targetLocales).

\`\`\`jsonc
[
  { "op": "setText", "slide": 3, "field": "headline", "locale": "ja", "value": "新しい見出し" },
  { "op": "setScreenshot", "slide": 3, "locale": "en", "file": "/abs/or/relative/new-shot.png" },
  { "op": "addExternalImage", "slide": 1, "file": "logo.png", "x": 0.42, "y": 0.55, "width": 0.28,
    "cornerRadiusRatio": 0.06, "shadow": true },
  { "op": "setExternalImage", "slide": 1, "index": 0, "rotation": -8, "opacity": 0.85,
    "crop": { "top": 0, "right": 0, "bottom": 0.08, "left": 0 } },
  { "op": "removeExternalImage", "slide": 1, "index": 0 },
  { "op": "set", "slide": 3, "path": "deviceFrame.scale", "value": 0.9 },
  { "op": "set", "slide": 1, "path": "background", "value": { "type": "solid", "color": "#101015" } },
  { "op": "set", "slide": 2, "path": "texts[0].pos", "value": { "x": 0.5, "y": 0.18 } },
  { "op": "set", "path": "name", "value": "New Name" }
]
\`\`\`

"set" path whitelist: deviceFrame.* (show/offsetX/offsetY/scale/rotation/color),
screenshotStyle.* (cornerRadiusRatio/shadow/crop), background (solid/gradient),
template, texts[i] / texts[i].pos / texts[i].boxWidth / texts[i].style.*,
badges[i].style.*, ornaments, highlights,
externalImages[i].x/y/width/rotation/opacity/cornerRadiusRatio/shadow/crop
(+ externalImages[i].crop.top/right/bottom/left), and project-level
name/sourceLocale/targetLocales/deviceModels.
Forbidden: id/imageKey/spanGroupId/index. Span followers own only their texts —
patches to leader-owned shared layers on a follower are rejected.
Out-of-range values are clamped; every rejection/clamp is reported in issues[].

setScreenshot with a very different aspect keeps the current frame and warns;
pass "redetect": true to re-run device-type detection. Max 3 external images
per slide. Image "file" paths may be absolute or relative to filesDir
(default: the bundle's directory).`

server.registerTool(
  'get_patch_spec',
  {
    title: 'Surgical patch op spec',
    description:
      'Reference for the patch_bundle op vocabulary: setText, setScreenshot, add/set/removeExternalImage, ' +
      'and the whitelisted "set" paths, with addressing and locale-routing rules. Read before calling patch_bundle.',
  },
  async () => ({ content: [{ type: 'text', text: PATCH_SPEC }] }),
)

server.registerTool(
  'get_design_reference',
  {
    title: 'Design reference data',
    description:
      'Machine-readable design vocabulary for authoring manifests and patches: theme preset ids (with their ' +
      'actual gradients/colors), layouts, ornament shapes, supported locales, device models with export ' +
      'resolutions, and per-slide limits. Use the preset ids for manifest themeBackground.',
  },
  async () =>
    ok({
      layouts: {
        'text-top': 'text above, device below bleeding past the bottom edge (reference look, default)',
        'text-bottom': 'device on top, text band at 74% height (import seeds deviceFrame.scale 0.85)',
        hero: 'text only — no screenshot slot',
        'hero-bleed': 'text top-left, large device bleeding past the bottom-right corner',
        split: 'left text column (left-aligned), device vertically centered in the right half',
      },
      themePresets: THEME_PRESETS,
      ornamentShapes: ORNAMENT_DEFAULTS,
      locales: SUPPORTED_LOCALES.map(({ code, name }) => ({ code, name })),
      deviceModels: Object.values(DEVICE_SPECS).map(({ model, type, label, exportWidth, exportHeight }) => ({
        model,
        type,
        label,
        exportWidth,
        exportHeight,
      })),
      defaultModelByType: DEFAULT_MODEL,
      limits: {
        slides: 10,
        textBlocksPerSlide: MAX_TEXTS,
        badgesPerSlide: 5,
        ornamentsPerSlide: 5,
        externalImagesPerSlide: 3,
        highlightsPerSlide: 3,
      },
      editorCanvasWidth: EDITOR_CANVAS_WIDTH,
      notes: [
        'All px values in manifests/patches (fontSize, paddings, outline width, shadow offsets) are relative to the ' +
          `${EDITOR_CANVAS_WIDTH}px editor canvas and scale to export resolution automatically.`,
        'One device type per project; type is auto-detected from screenshot aspect ratio.',
        'Total exported PNGs = slides × locales, grouped {locale}/{device}/NN.png.',
      ],
    }),
)

// ---------------------------------------------------------------------------
// Pipeline tools — author → validate → render → inspect → patch → re-render.
// ---------------------------------------------------------------------------

const importDirDesc =
  'Absolute path to a flat import folder: manifest JSON + optional caption CSV/JSON + screenshots named ' +
  '{n}[-desc].{locale}.{ext} + external images (see get_import_spec).'

server.registerTool(
  'validate_import',
  {
    title: 'Validate an import folder (dry run)',
    description:
      'Dry-run the project import without rendering: parses the manifest, screenshots, and captions, and returns ' +
      '{ ok, applied: {slides, screenshots, externalImages, captions}, addedLocales, issues[] }. Fast way to catch ' +
      'manifest mistakes before a render. Spins up the app headlessly (takes ~15-30s).',
    inputSchema: {
      inputDir: z.string().describe(importDirDesc),
      includeProject: z
        .boolean()
        .optional()
        .describe('Also return the fully assembled Project JSON (large). Default false.'),
    },
  },
  async ({ inputDir, includeProject }, extra) => {
    const out = await tmp()
    const report = progressReporter(extra)
    const { code, output } = await runNode([HEADLESS, abs(inputDir), out, '--validate'], report)
    const result = await readJsonIf(join(out, 'import-result.json'))
    if (!result) return fail({ error: 'validate produced no import-result.json', log: tail(output) })
    if (!includeProject) delete result.project
    return result.ok && code === 0 ? ok(result) : fail(result)
  },
)

server.registerTool(
  'render',
  {
    title: 'Render to App Store PNGs',
    description:
      'Render an import folder or a .studio.zip bundle to final full-resolution PNGs ({locale}/{device}/NN.png ' +
      'under outDir) via the real app, headlessly. Returns the PNG list plus a layout report (overlap / ' +
      'safe-margin / overflow issues with suggested fixes) so you can iterate. Slow: roughly 30s startup + a few ' +
      'seconds per slide × locale — use slides/locales filters while iterating.',
    inputSchema: {
      input: z.string().describe('Absolute path to an import folder OR a .studio.zip bundle.'),
      outDir: z.string().describe('Output directory for PNGs and reports (created if missing).'),
      slides: z.array(z.number().int().min(1)).optional().describe('Render only these 1-based slide numbers.'),
      locales: z.array(z.string()).optional().describe('Render only these locale codes.'),
      report: z.boolean().optional().describe('Collect the layout report (default true).'),
      failOnLayoutIssues: z.boolean().optional().describe('Exit as an error when any layout issue remains.'),
      fastlane: z.boolean().optional().describe('Emit a fastlane deliver layout + Appfile/Deliverfile/upload.sh.'),
    },
  },
  async ({ input, outDir, slides, locales, report = true, failOnLayoutIssues, fastlane }, extra) => {
    const args = [HEADLESS, abs(input), abs(outDir)]
    if (report) args.push('--report')
    if (failOnLayoutIssues) args.push('--fail-on-layout-issues')
    if (fastlane) args.push('--fastlane')
    if (slides?.length) args.push('--slides', slides.join(','))
    if (locales?.length) args.push('--locale', locales.join(','))
    const { code, output } = await runNode(args, progressReporter(extra))
    const summary = report ? await readJsonIf(join(abs(outDir), 'layout-summary.json')) : null
    const result = {
      exitCode: code,
      outDir: abs(outDir),
      pngs: await listPngs(abs(outDir)),
      ...(summary ? { layoutSummary: summary.summary, layoutIssues: summary.issues } : {}),
      log: tail(output),
    }
    return code === 0 ? ok(result) : fail(result)
  },
)

server.registerTool(
  'create_bundle',
  {
    title: 'Import folder → editable .studio.zip bundle',
    description:
      'Assemble an import folder into a lossless, editable project bundle (<name>.studio.zip) without rendering. ' +
      'The bundle is the substrate for inspect_bundle / patch_bundle and can be rendered directly or opened in the GUI.',
    inputSchema: {
      inputDir: z.string().describe(importDirDesc),
      outDir: z.string().describe('Directory to write <name>.studio.zip into.'),
    },
  },
  async ({ inputDir, outDir }, extra) => {
    const { code, output } = await runNode([HEADLESS, abs(inputDir), abs(outDir), '--bundle'], progressReporter(extra))
    const bundlePath = output.match(/project bundle → (.+\.zip)/)?.[1]?.trim() ?? null
    const result = { exitCode: code, bundlePath, log: tail(output) }
    return code === 0 && bundlePath ? ok(result) : fail(result)
  },
)

server.registerTool(
  'inspect_bundle',
  {
    title: 'Inspect a .studio.zip bundle',
    description:
      'Read a bundle into agent-friendly JSON without launching the app: per-slide layout/template, device, span ' +
      'role, text & badge content with per-locale translations and their setText field addresses, external images, ' +
      'image references, and structural issues to fix before rendering. Fast (no browser).',
    inputSchema: {
      bundlePath: z.string().describe('Absolute path to the .studio.zip bundle.'),
      extractImagesDir: z.string().optional().describe('Also extract all image blobs into this directory.'),
    },
  },
  async ({ bundlePath, extractImagesDir }) => {
    const out = join(await tmp(), 'inspect.json')
    const args = [join(ROOT, 'scripts', 'project-inspect.mjs'), abs(bundlePath), out]
    if (extractImagesDir) args.push('--extract-images', abs(extractImagesDir))
    const { code, output } = await runNode(args)
    if (code !== 0) return fail({ exitCode: code, log: tail(output) })
    return ok(await readJsonIf(out))
  },
)

server.registerTool(
  'patch_bundle',
  {
    title: 'Surgically patch a bundle',
    description:
      'Apply a list of surgical ops (see get_patch_spec) to a .studio.zip bundle — one text, one screenshot, one ' +
      'layout knob — preserving everything else bit-for-bit. Lossless, fast (no browser). Rejections and clamps are ' +
      'reported in issues[]. Chain with render to verify.',
    inputSchema: {
      bundlePath: z.string().describe('Absolute path to the input .studio.zip bundle.'),
      ops: z.array(z.looseObject({ op: z.string() })).min(1).describe('Patch ops array (see get_patch_spec).'),
      outPath: z
        .string()
        .optional()
        .describe('Output bundle path. Omit to patch in place (overwrites bundlePath).'),
      filesDir: z
        .string()
        .optional()
        .describe('Base directory for relative image "file" paths in ops. Default: the bundle\'s directory.'),
    },
  },
  async ({ bundlePath, ops, outPath, filesDir }) => {
    const base = filesDir ? abs(filesDir) : dirname(abs(bundlePath))
    const resolved = ops.map((op) =>
      typeof op.file === 'string' && !isAbsolute(op.file) ? { ...op, file: resolve(base, op.file) } : op,
    )
    const patchPath = join(await tmp(), 'patch.json')
    await writeFile(patchPath, JSON.stringify(resolved, null, 2))
    const args = [join(ROOT, 'scripts', 'project-patch.mjs'), abs(bundlePath), patchPath]
    args.push(outPath ? abs(outPath) : '--in-place')
    const { code, output } = await run(TSX_BIN, args)
    const issues = output
      .split('\n')
      .filter((l) => l.startsWith(':: ') && !l.startsWith(':: patched'))
      .map((l) => l.slice(3))
    const result = { exitCode: code, outPath: outPath ? abs(outPath) : abs(bundlePath), issues, log: tail(output) }
    return code === 0 ? ok(result) : fail(result)
  },
)

server.registerTool(
  'export_manifest',
  {
    title: 'Reverse-export a project to manifest + captions',
    description:
      'Reverse a loaded project (import folder or bundle) back into a re-importable manifest.json + captions.csv + ' +
      'image-plan.json under outDir. Lossy by design (per-locale look, image backgrounds, badge icons etc. are ' +
      'reported in issues[]) — use patch_bundle for lossless edits; use this to bulk-rewrite texts or fork a project.',
    inputSchema: {
      input: z.string().describe('Absolute path to an import folder OR a .studio.zip bundle.'),
      outDir: z.string().describe('Directory for manifest.json / captions.csv / image-plan.json.'),
    },
  },
  async ({ input, outDir }, extra) => {
    const { code, output } = await runNode(
      [HEADLESS, abs(input), abs(outDir), '--export-manifest'],
      progressReporter(extra),
    )
    const manifest = await readJsonIf(join(abs(outDir), 'manifest.json'))
    const imagePlan = await readJsonIf(join(abs(outDir), 'image-plan.json'))
    const captions = await readFile(join(abs(outDir), 'captions.csv'), 'utf8').catch(() => null)
    // The harness prints ":: lossy (not represented in the manifest):" followed
    // by one ":: <issue>" line each — everything after the marker is an issue.
    const lines = output.split('\n')
    const markerIdx = lines.findIndex((l) => l.includes('lossy (not represented in the manifest)'))
    const lossy =
      markerIdx >= 0
        ? lines
            .slice(markerIdx + 1)
            .filter((l) => l.startsWith(':: '))
            .map((l) => l.slice(3))
        : []
    const result = { exitCode: code, outDir: abs(outDir), manifest, captions, imagePlan, lossyNotes: lossy, log: tail(output) }
    return code === 0 && manifest ? ok(result) : fail(result)
  },
)

server.registerTool(
  'fix_layout',
  {
    title: 'Apply layout-report fixes to a manifest',
    description:
      'Take the layout-summary.json a render produced and apply its suggested fixes to the import manifest ' +
      '(move/shrink overlapping text, pull elements inside safe margins, …). Dry run by default — pass write: true ' +
      'to edit the manifest file. For a full render→fix→re-render loop use layout_loop.',
    inputSchema: {
      layoutSummaryPath: z.string().describe('Path to layout-summary.json from a render with report.'),
      manifestPath: z.string().describe('Path to the manifest JSON to fix.'),
      write: z.boolean().optional().describe('Write the fixed manifest (default false = dry run).'),
    },
  },
  async ({ layoutSummaryPath, manifestPath, write }) => {
    const args = [
      '--disable-warning=ExperimentalWarning',
      join(ROOT, 'scripts', 'apply-layout-summary.mjs'),
      abs(layoutSummaryPath),
      abs(manifestPath),
    ]
    if (write) args.push('--write')
    const { code, output } = await runNode(args)
    const result = { exitCode: code, wrote: !!write && code === 0, log: tail(output) }
    return code === 0 ? ok(result) : fail(result)
  },
)

server.registerTool(
  'layout_loop',
  {
    title: 'Render → autofix → re-render loop',
    description:
      'Repeatedly render an import folder, apply layout autofixes to its manifest, and re-render until zero layout ' +
      'issues or maxRuns is hit. write: true lets it edit the manifest between runs (default is a single dry-run ' +
      'render + fix report). Slow: each run is a full render.',
    inputSchema: {
      inputDir: z.string().describe(importDirDesc),
      outDir: z.string().describe('Output directory for PNGs and reports.'),
      write: z.boolean().optional().describe('Apply fixes to the manifest between runs (default false).'),
      maxRuns: z.number().int().min(1).max(10).optional().describe('Maximum render runs (default 3).'),
      manifestPath: z.string().optional().describe('Explicit manifest path if the folder has several.'),
    },
  },
  async ({ inputDir, outDir, write, maxRuns, manifestPath }, extra) => {
    const args = [
      '--disable-warning=ExperimentalWarning',
      join(ROOT, 'scripts', 'layout-loop.mjs'),
      abs(inputDir),
      abs(outDir),
    ]
    if (write) args.push('--write')
    if (maxRuns) args.push('--max-runs', String(maxRuns))
    if (manifestPath) args.push('--manifest', abs(manifestPath))
    const { code, output } = await runNode(args, progressReporter(extra))
    const summary = await readJsonIf(join(abs(outDir), 'layout-summary.json'))
    const result = {
      exitCode: code,
      converged: code === 0,
      ...(summary ? { layoutSummary: summary.summary, layoutIssues: summary.issues } : {}),
      pngs: await listPngs(abs(outDir)),
      log: tail(output),
    }
    return code === 0 ? ok(result) : fail(result)
  },
)

// ---------------------------------------------------------------------------
// Seeing the output — an agent iterates on design only as well as it can see it.
// ---------------------------------------------------------------------------

// Downscale a PNG for inline viewing. sips ships with macOS and is instant;
// elsewhere fall back to the original bytes when they're small enough.
async function pngForViewing(path, maxDim) {
  const dest = join(await tmp(), 'view.png')
  const { code } = await run('sips', ['-Z', String(maxDim), path, '--out', dest])
  const src = code === 0 ? dest : path
  const buf = await readFile(src)
  if (code !== 0 && buf.length > 2_000_000) {
    throw new Error(`${path} is ${(buf.length / 1e6).toFixed(1)}MB and sips is unavailable to downscale it`)
  }
  return buf
}

server.registerTool(
  'view_output',
  {
    title: 'View rendered PNGs',
    description:
      'Return one or more PNG files (rendered slides, generated icons, source screenshots) as inline images so ' +
      'you can SEE the design you are iterating on. Files are downscaled for viewing; the originals on disk stay ' +
      'full resolution. Always look at renders before and after a design change.',
    inputSchema: {
      paths: z.array(z.string()).min(1).max(6).describe('Absolute paths of PNG files to view (max 6 per call).'),
      maxDim: z.number().int().min(200).max(1600).optional().describe('Max width/height in px (default 800).'),
    },
  },
  async ({ paths, maxDim = 800 }) => {
    const content = []
    for (const p of paths) {
      try {
        const buf = await pngForViewing(abs(p), maxDim)
        content.push({ type: 'text', text: p }, { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' })
      } catch (e) {
        return fail({ error: e instanceof Error ? e.message : String(e), path: p })
      }
    }
    return { content }
  },
)

// ---------------------------------------------------------------------------
// Icons — Lucide (ISC, ~2000 icons) rasterized to PNG for use as external
// images. Prettier and more on-brand than the emoji ornament set.
// ---------------------------------------------------------------------------

const LUCIDE_DIR = join(ROOT, 'node_modules', 'lucide-static', 'icons')

server.registerTool(
  'search_icons',
  {
    title: 'Search the Lucide icon set',
    description:
      'Search the ~2000-icon Lucide set by name substring (e.g. "arrow", "chart", "heart"). Returns matching icon ' +
      'names for make_icon. Icons are stroke-based line icons — clean, consistent, App-Store-friendly.',
    inputSchema: {
      query: z.string().optional().describe('Substring to match icon names against. Omit to sample the full list.'),
      limit: z.number().int().min(1).max(300).optional().describe('Max results (default 100).'),
    },
  },
  async ({ query, limit = 100 }) => {
    const names = (await readdir(LUCIDE_DIR))
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4))
    const matches = query ? names.filter((n) => n.includes(query.toLowerCase())) : names
    return ok({ total: matches.length, icons: matches.slice(0, limit) })
  },
)

server.registerTool(
  'make_icon',
  {
    title: 'Rasterize a Lucide icon to PNG',
    description:
      'Render a Lucide icon to a transparent PNG (optionally on a rounded color tile, app-icon style) for use as ' +
      'an external image on a slide: patch_bundle addExternalImage with the written file, or reference it from a ' +
      'manifest externalImages entry. Returns a small preview inline.',
    inputSchema: {
      name: z.string().describe('Lucide icon name from search_icons (e.g. "sparkles", "chart-line").'),
      outPath: z.string().describe('Absolute path of the PNG to write.'),
      size: z.number().int().min(32).max(1024).optional().describe('Output size in px (default 256, square).'),
      color: z.string().optional().describe('Stroke color, CSS hex (default #111111).'),
      strokeWidth: z.number().min(0.5).max(4).optional().describe('Stroke width in the 24px grid (default 2).'),
      background: z
        .string()
        .optional()
        .describe('Optional tile background color (hex). Adds a rounded app-icon-style tile behind the glyph.'),
    },
  },
  async ({ name, outPath, size = 256, color = '#111111', strokeWidth = 2, background }) => {
    let svg
    try {
      svg = await readFile(join(LUCIDE_DIR, `${name}.svg`), 'utf8')
    } catch {
      return fail({ error: `unknown icon "${name}" — use search_icons to find valid names` })
    }
    const glyphSize = background ? Math.round(size * 0.6) : size
    svg = svg
      .replace('width="24"', `width="${glyphSize}"`)
      .replace('height="24"', `height="${glyphSize}"`)
      .replace('stroke="currentColor"', `stroke="${color}"`)
      .replace('stroke-width="2"', `stroke-width="${strokeWidth}"`)
    const html =
      `<body style="margin:0"><div style="width:${size}px;height:${size}px;display:flex;` +
      `align-items:center;justify-content:center;` +
      (background ? `background:${background};border-radius:${Math.round(size * 0.22)}px;` : '') +
      `">${svg}</div></body>`
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    let buf
    try {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
      await page.setContent(html)
      buf = await page.screenshot({ omitBackground: true })
    } finally {
      await browser.close()
    }
    await writeFile(abs(outPath), buf)
    const preview = await pngForViewing(abs(outPath), 200).catch(() => buf)
    return {
      content: [
        { type: 'text', text: JSON.stringify({ outPath: abs(outPath), size, icon: name }) },
        { type: 'image', data: preview.toString('base64'), mimeType: 'image/png' },
      ],
    }
  },
)

await server.connect(new StdioServerTransport())
