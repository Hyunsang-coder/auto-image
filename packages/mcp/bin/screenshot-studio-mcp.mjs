#!/usr/bin/env node
// MCP server for the Screenshot Studio desktop app: it drives the project the
// user has OPEN, over the app's unix socket. No checkout, no build, no browser.
//
//   npx -y screenshot-studio-mcp
//
// The repo's own server (scripts/mcp-server.mjs) adds the file-based pipeline
// tools — rendering a folder of screenshots, patching a .studio.zip — which
// need the source tree and Playwright. Both register the same live/knowledge
// definitions from lib/tools.mjs, so the vocabulary is identical.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerKnowledgeTools, registerLiveTools } from '../lib/tools.mjs'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

const { version } = JSON.parse(await readFile(join(DATA, '..', 'package.json'), 'utf8'))

const server = new McpServer({ name: 'screenshot-studio', version })

registerKnowledgeTools(server, {
  readImportSpec: () => readFile(join(DATA, 'project-import.md'), 'utf8'),
  // Frozen at publish time from the app's TS constants — a package cannot
  // import TS at runtime. See scripts/build-mcp-package.mjs in the repo.
  designReference: JSON.parse(await readFile(join(DATA, 'design-reference.json'), 'utf8')),
})
registerLiveTools(server)

await server.connect(new StdioServerTransport())
