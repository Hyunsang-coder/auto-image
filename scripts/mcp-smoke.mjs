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
]

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

console.log(failed ? ':: mcp smoke FAILED' : ':: mcp smoke OK')
process.exit(failed ? 1 : 0)
