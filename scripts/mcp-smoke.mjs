#!/usr/bin/env node
// Smoke test for the MCP server: spawns it over stdio, lists tools, and calls
// the cheap knowledge + bundle tools end-to-end (no browser). The render-path
// tools are covered by test:headless — this guards the MCP wiring itself.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TSX_BIN = join(ROOT, 'node_modules', '.bin', 'tsx')

const EXPECTED_TOOLS = [
  'get_import_spec',
  'get_patch_spec',
  'get_design_reference',
  'validate_import',
  'render',
  'create_bundle',
  'inspect_bundle',
  'patch_bundle',
  'export_manifest',
  'fix_layout',
  'layout_loop',
  'view_output',
  'search_icons',
  'make_icon',
  'live_status',
  'live_focus',
  'live_new_project',
  'live_inspect',
  'live_list_untranslated',
  'live_patch',
  'live_view',
  'live_save',
  'live_open',
]

// What the published package ships: the live half plus the vocabulary, and
// none of the pipeline tools that need this source tree.
const PACKAGE_TOOLS = EXPECTED_TOOLS.filter((n) => n.startsWith('live_') || n.startsWith('get_'))

const client = new Client({ name: 'mcp-smoke', version: '1.0.0' })
let failed = false
const check = (cond, label) => {
  console.log(`${cond ? 'ok' : 'FAIL'} — ${label}`)
  if (!cond) failed = true
}

try {
  await client.connect(
    new StdioClientTransport({ command: TSX_BIN, args: [join(ROOT, 'scripts', 'mcp-server.mjs')], cwd: ROOT }),
  )

  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  for (const name of EXPECTED_TOOLS) check(names.includes(name), `tool registered: ${name}`)

  const spec = await client.callTool({ name: 'get_import_spec', arguments: {} })
  check(spec.content[0].text.includes('매니페스트 스키마'), 'get_import_spec returns the authoring spec')

  const patchSpec = await client.callTool({ name: 'get_patch_spec', arguments: {} })
  check(patchSpec.content[0].text.includes('setText'), 'get_patch_spec documents ops')

  const refs = await client.callTool({ name: 'get_design_reference', arguments: {} })
  const data = JSON.parse(refs.content[0].text)
  check(data.themePresets.some((p) => p.id === 'porcelain'), 'design reference lists theme preset ids')
  check(Object.keys(data.ornamentShapes).includes('sparkles'), 'design reference lists ornament shapes')
  check(data.deviceModels.some((m) => m.model === 'iphone-16-pro' && m.exportWidth === 1320), 'design reference lists device models')
  check(data.locales.some((l) => l.code === 'pt-BR'), 'design reference lists locales')
  check(data.fontFamilies.includes('Fraunces'), 'design reference lists font families')

  const icons = await client.callTool({ name: 'search_icons', arguments: { query: 'sparkle' } })
  const iconData = JSON.parse(icons.content[0].text)
  check(iconData.icons.includes('sparkles'), 'search_icons finds lucide icons')
} catch (err) {
  console.error(`FAIL — ${err instanceof Error ? err.message : String(err)}`)
  failed = true
} finally {
  await client.close().catch(() => {})
}

// The published package, run the way `npx screenshot-studio-mcp` runs it: plain
// node, no tsx, no TS graph — it must stand up on its frozen data alone.
const pkg = new Client({ name: 'mcp-smoke-pkg', version: '1.0.0' })
try {
  await pkg.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'packages', 'mcp', 'bin', 'screenshot-studio-mcp.mjs')],
      cwd: ROOT,
    }),
  )

  const { tools } = await pkg.listTools()
  const names = tools.map((t) => t.name)
  for (const name of PACKAGE_TOOLS) check(names.includes(name), `package tool registered: ${name}`)
  check(!names.includes('render'), 'package leaves out the tools that need the repo')

  const refs = await pkg.callTool({ name: 'get_design_reference', arguments: {} })
  check(
    JSON.parse(refs.content[0].text).themePresets.some((p) => p.id === 'porcelain'),
    'package serves the frozen design reference',
  )
  const spec = await pkg.callTool({ name: 'get_import_spec', arguments: {} })
  check(spec.content[0].text.includes('매니페스트 스키마'), 'package ships the import spec')
} catch (err) {
  console.error(`FAIL — package: ${err instanceof Error ? err.message : String(err)}`)
  failed = true
} finally {
  await pkg.close().catch(() => {})
}

console.log(failed ? ':: mcp smoke FAILED' : ':: mcp smoke OK')
process.exit(failed ? 1 : 0)
