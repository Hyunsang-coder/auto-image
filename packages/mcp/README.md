# screenshot-studio-mcp

MCP server for [App Store Screenshot Studio](https://screenshotstudio.dev) — it lets an AI agent
drive the project you have **open in the desktop app**: read it, patch it, translate it, and look at
the rendered slide.

Nothing is uploaded. The server talks to the app over a unix socket in your own home directory, and
the app does the work in front of you: the canvas repaints as the agent edits, and you keep whatever
slide you were on.

## Setup

1. Install and open the Mac app — [download](https://github.com/Hyunsang-coder/auto-image/releases/latest)
   (free, open source). The MCP switch in the app's header must be on; it is by default.
2. Register this server with your MCP client.

**Claude Code**

```bash
claude mcp add screenshot-studio -- npx -y screenshot-studio-mcp
```

**Claude Desktop / any client with a JSON config**

```json
{
  "mcpServers": {
    "screenshot-studio": {
      "command": "npx",
      "args": ["-y", "screenshot-studio-mcp"]
    }
  }
}
```

Then ask your agent to `live_status` — it will report what the app has open.

## Tools

| Tool | What it does |
| --- | --- |
| `live_status` | Is the app running, and what does it have open (step, project, slides, locales)? |
| `live_focus` | Move the user to a step / slide — no data changes. |
| `live_new_project` | Start a blank project and jump to the editor. |
| `live_inspect` | Read the open project as compact JSON: per-slide template, device, texts and badges with their field addresses, external images, structural issues. |
| `live_list_untranslated` | The localize worklist — every string still missing a locale, with its source text and address. |
| `live_patch` | Apply surgical ops (`setText`, `set`, external images…) to the open project. |
| `live_view` | Render one slide at export resolution and return it as an image, so the agent can see what it just did. |
| `get_design_reference` | Theme preset ids, font families, layouts, ornament/shape kinds, locales, device models and export sizes, per-slide limits. |
| `get_patch_spec` | The op vocabulary and the whitelisted `set` paths. |
| `get_import_spec` | The full manifest authoring spec (Korean). |

Translating a whole set is `live_list_untranslated` → translate → `live_patch` with one `setText` op
per string per locale. A locale the project has not selected yet is added automatically.

## Requirements

macOS, Node 20+, and the desktop app running. If the app is closed — or its MCP switch is off — every
`live_*` tool answers with that, rather than failing obscurely.

For the file-based half (render a folder of screenshots to PNGs, patch a `.studio.zip`, run the
layout autofix loop) you need the repository itself: see
[the source](https://github.com/Hyunsang-coder/auto-image), which registers those tools alongside
these from `scripts/mcp-server.mjs`.

MIT licensed.
