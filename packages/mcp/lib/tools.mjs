// The half of the MCP surface that needs nothing but a running desktop app: the
// live_* tools that drive the project the user has open, plus the knowledge
// tools that teach an agent the authoring vocabulary.
//
// Shared on purpose. `scripts/mcp-server.mjs` (the repo server, which also has
// the file-based pipeline tools) and `bin/screenshot-studio-mcp.mjs` (the
// published package, which does not) register the very same definitions, so an
// agent sees one vocabulary whichever one it connects to.

import { z } from 'zod'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { callBridge } from './bridgeClient.mjs'
import { inspectBundle } from './inspect.mjs'
import { pngForViewing, tmp } from './png.mjs'

export const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
export const fail = (data) => ({ ...ok(data), isError: true })

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
screenshotStyle.* (cornerRadiusRatio/shadow/crop), background (solid/gradient;
optional blobs: [{color,x,y,radius,opacity?,blendMode?}] soft radial mesh
spots — max 6, x/y/radius are canvas fractions, blendMode one of
multiply/screen/overlay/soft-light — plus noise: 0–1 film grain),
template, texts[i] / texts[i].pos / texts[i].boxWidth / texts[i].style.*
(incl. fontFamily from get_design_reference.fontFamilies,
gradient {from,to,angle} — a linear text fill, angle 0=left→right 90=top→bottom,
and emphasis {color?,fontWeight?} — painted onto ==word== marker ranges written
inside caption text/translation strings via setText),
badges[i].style.*, ornaments,
highlights (whole-array; items {sourceRegion {x,y,w,h} — fractions of the
SCREENSHOT box, not the canvas (live_inspect reports it as
screenshot.canvasRect) — marker {show,color}, popup {zoom, auto, connector,
shape: rect|circle, rim {color,width}, rotation, x, y}}. Size the card with
popup.zoom and leave placement to popup.auto; see get_design_reference.highlight),
shapes (whole-array; items {kind: rect|ellipse|line|arrow, x, y, width, height,
rotation, fill (hex or "none"), opacity, cornerRadiusRatio (rect),
stroke {color,width}, layer: back|front} — x/y = center fractions, width of
canvas width, height of canvas height; line/arrow: width=length,
height=thickness/head size; "back" renders behind the device, "front" above
device + text),
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


/**
 * @param server        McpServer to register on.
 * @param readImportSpec  Returns docs/project-import.md — the repo server reads
 *                        the file in place, the package its bundled copy.
 * @param designReference The get_design_reference payload. The repo server
 *                        builds it from the TS constants; the package reads the
 *                        JSON snapshot generated at publish time.
 */
export function registerKnowledgeTools(server, { readImportSpec, designReference }) {
  server.registerTool(
    'get_import_spec',
    {
      title: 'Import manifest spec',
      description:
        'The full authoring spec (Korean) for the project-import format: manifest schema (layouts, ' +
        'deviceFrame transform, screenshotStyle, texts styling, badges, ornaments, shapes, external images, ' +
        'highlights/loupe, 2-page spans, textY), screenshot filename rules, caption CSV/JSON format, ' +
        'and the layout report/issue codes. Read this before authoring a manifest.',
    },
    async () => ({ content: [{ type: 'text', text: await readImportSpec() }] }),
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
  screenshotStyle.* (cornerRadiusRatio/shadow/crop), background (solid/gradient;
  optional blobs: [{color,x,y,radius,opacity?,blendMode?}] soft radial mesh
  spots — max 6, x/y/radius are canvas fractions, blendMode one of
  multiply/screen/overlay/soft-light — plus noise: 0–1 film grain),
  template, texts[i] / texts[i].pos / texts[i].boxWidth / texts[i].style.*
  (incl. fontFamily from get_design_reference.fontFamilies,
  gradient {from,to,angle} — a linear text fill, angle 0=left→right 90=top→bottom,
  and emphasis {color?,fontWeight?} — painted onto ==word== marker ranges written
  inside caption text/translation strings via setText),
  badges[i].style.*, ornaments,
highlights (whole-array; items {sourceRegion {x,y,w,h} — fractions of the
SCREENSHOT box, not the canvas (live_inspect reports it as
screenshot.canvasRect) — marker {show,color}, popup {zoom, auto, connector,
shape: rect|circle, rim {color,width}, rotation, x, y}}. Size the card with
popup.zoom and leave placement to popup.auto; see get_design_reference.highlight),
  shapes (whole-array; items {kind: rect|ellipse|line|arrow, x, y, width, height,
  rotation, fill (hex or "none"), opacity, cornerRadiusRatio (rect),
  stroke {color,width}, layer: back|front} — x/y = center fractions, width of
  canvas width, height of canvas height; line/arrow: width=length,
  height=thickness/head size; "back" renders behind the device, "front" above
  device + text),
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
        'actual gradients/colors), font families, layouts, ornament shapes, generic shape kinds, supported locales, device models with ' +
        'export resolutions, and per-slide limits. Use the preset ids for manifest themeBackground.',
    },
    async () => ok(designReference),
  )
}

export function registerLiveTools(server) {
  async function liveCall(method, params = {}) {
    const envelope = await callBridge(method, params)
    if (!envelope.ok) throw new Error(envelope.error ?? 'the app refused the call')
    return envelope.result
  }

  const liveGuard = async (fn) => {
    try {
      return await fn()
    } catch (e) {
      return fail({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  server.registerTool(
    'live_status',
    {
      title: 'Is the desktop app reachable?',
      description:
        'Check whether Screenshot Studio is running and what it currently has open (step, project name, slide count, ' +
        'locales). Call this before the other live_* tools; if it fails, fall back to the file-based tools.',
      inputSchema: {},
    },
    async () => liveGuard(async () => ok(await liveCall('status'))),
  )

  server.registerTool(
    'live_focus',
    {
      title: 'Move the app to a step / slide',
      description:
        'Bring the user to the surface you are working on: switch the 4-step flow (1 project, 2 editor, 3 localize, ' +
        '4 export) and/or select a slide. Changes no project data. Use it to reach the editor before live_patch, ' +
        'or to put the slide you just patched in front of the user.',
      inputSchema: {
        step: z.number().int().min(1).max(4).optional().describe('1 project, 2 editor, 3 localize, 4 export.'),
        slide: z
          .union([z.number().int().min(1), z.string()])
          .optional()
          .describe('1-based slide number, or a slide id, to make active.'),
      },
    },
    async (params) => liveGuard(async () => ok(await liveCall('focus', params))),
  )

  server.registerTool(
    'live_new_project',
    {
      title: 'Start a new project in the app',
      description:
        'Create a blank project in the running desktop app and jump the user to the editor. Refuses if a project is ' +
        'already open unless replace is true — that discards the open project. Theme ids come from get_design_reference.',
      inputSchema: {
        name: z.string().optional().describe('Project name (default "Untitled").'),
        slideCount: z.number().int().min(1).max(10).optional().describe('Number of slides (default 5).'),
        device: z.enum(['iphone', 'ipad']).optional().describe('Device type (default iphone).'),
        theme: z.string().optional().describe('Theme preset id (default the first preset).'),
        replace: z.boolean().optional().describe('Discard the project currently open (default false).'),
      },
    },
    async (params) => liveGuard(async () => ok(await liveCall('newProject', params))),
  )

  server.registerTool(
    'live_inspect',
    {
      title: 'Inspect the project open in the app',
      description:
        'Read the LIVE project the user has open into the same agent-friendly JSON as inspect_bundle: per-slide ' +
        'template, device, span role, text & badge content with setText field addresses, external images, ' +
        'highlights (loupes), and structural issues. Use this to find what to address before live_patch. ' +
        'Unlike inspect_bundle it also reports screenshot.canvasRect — where the screenshot sits on the composed ' +
        "canvas, in canvas fractions — because a highlight's sourceRegion is normalized to that box, not to the " +
        'canvas you see in live_view.',
      inputSchema: {},
    },
    async () =>
      liveGuard(async () => {
        const { project, images, screenRects } = await liveCall('inspect')
        return ok(inspectBundle({ bundleVersion: null, schemaVersion: null, project, images, screenRects }))
      }),
  )

  server.registerTool(
    'live_list_untranslated',
    {
      title: 'What still needs translating in the app',
      description:
        'Read the localize worklist from the LIVE project: every translatable string that is still missing at least ' +
        'one target locale, with its source text and the setText field address (text:N / badge:N). Translate the ' +
        'strings yourself, then write them back with live_patch using setText ops — one op per string per locale, ' +
        '{ op: "setText", slide, field, locale, value }. A locale not yet in the project is added automatically. ' +
        'This replaces exporting a CSV, translating it elsewhere, and re-importing it.',
      inputSchema: {},
    },
    async () => liveGuard(async () => ok(await liveCall('untranslated'))),
  )

  server.registerTool(
    'live_patch',
    {
      title: 'Patch the project open in the app',
      description:
        'Apply surgical ops (see get_patch_spec) to the project open in the desktop app. The canvas repaints ' +
        'immediately and the user keeps their current slide. Rejections and clamps come back in issues[]. ' +
        'Ops that introduce a new image from a file are not supported live — patch a bundle for those.',
      inputSchema: {
        ops: z.array(z.looseObject({ op: z.string() })).min(1).describe('Patch ops array (see get_patch_spec).'),
      },
    },
    async ({ ops }) =>
      liveGuard(async () => {
        // The webview has no filesystem access, so a `file` cannot be decoded into
        // a blob here the way scripts/project-patch.mjs does for a bundle.
        const withFiles = ops.filter((op) => typeof op.file === 'string')
        if (withFiles.length) {
          return fail({
            error:
              'live_patch cannot read image files. Use patch_bundle on a .studio.zip for ops carrying "file", ' +
              'then open that bundle in the app.',
            ops: withFiles.map((op) => op.op),
          })
        }
        return ok(await liveCall('patch', { ops }))
      }),
  )

  server.registerTool(
    'live_view',
    {
      title: 'See a slide as the app has it now',
      description:
        'Render one slide from the LIVE project and return it as an inline image, so you can SEE the result of a ' +
        'live_patch. Rendered at full export resolution then downscaled for viewing — what you see is what ships.',
      inputSchema: {
        slide: z.union([z.number().int().min(1), z.string()]).describe('1-based slide number, or a slide id.'),
        locale: z.string().optional().describe('Locale to render (default: the project source locale).'),
        maxDim: z.number().int().min(200).max(1600).optional().describe('Max width/height in px (default 800).'),
      },
    },
    async ({ slide, locale, maxDim = 800 }) =>
      liveGuard(async () => {
        const result = await liveCall('view', { slide, locale })
        const path = join(await tmp(), `live-${result.slide}.png`)
        await writeFile(path, Buffer.from(result.pngBase64, 'base64'))
        const preview = await pngForViewing(path, maxDim)
        return {
          content: [
            { type: 'text', text: JSON.stringify({ slide: result.slide, locale: result.locale }) },
            { type: 'image', data: preview.toString('base64'), mimeType: 'image/png' },
          ],
        }
      }),
  )
}
