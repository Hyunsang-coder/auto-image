// Webview half of the agent bridge. Rust owns the unix socket and forwards each
// call here as a `bridge:request` event; we answer through the `bridge_respond`
// command. See src-tauri/src/bridge.rs and docs/adr.md.
//
// Patches go through the same `applyPatch` the file-based CLI uses, so the op
// vocabulary — and its whitelist — is identical whether an agent is editing a
// .studio.zip on disk or the project open in front of the user.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useProjectStore } from '../store/useProjectStore'
import { DEFAULT_MODEL, EDITOR_CANVAS_WIDTH } from '../constants/deviceSpecs'
import { getCanvasHeight, screenBoundsOf } from '../canvas/templateLayouts'
import { THEME_PRESETS, findThemePreset } from '../constants/defaults'
import type { DeviceType, Project, Slide, Step } from '../types/project'
import { projectImageKeys } from './imageRefs'
import { getPendingTranslations } from './readiness'
import { applyPatch, type PatchOp } from './projectPatch'
import { renderSlide, renderSpanGroup } from './renderSlide'
import { blobToBase64, isTauri } from './tauri'
import { docNameFromPath, isDirty } from './documentModel'
import { adoptAsDocument, openDocument, saveDocument, useDocumentStore } from './documentIO'

/** Bumped when the request/response shape changes; reported by `status`. */
const PROTOCOL_VERSION = 2

interface BridgeRequest {
  reqId: number
  method: string
  params?: Record<string, unknown>
}

function requireProject(): Project {
  const project = useProjectStore.getState().project
  if (!project) throw new Error('no project is open — create or open one in the app first')
  return project
}

/** Resolve a slide by its 1-based number (as the CLI addresses them) or by id. */
function findSlide(project: Project, ref: unknown): Slide {
  if (typeof ref === 'number') {
    const slide = project.slides.find((s) => s.index + 1 === ref)
    if (!slide) throw new Error(`no slide ${ref}; project has ${project.slides.length}`)
    return slide
  }
  if (typeof ref === 'string') {
    const slide = project.slides.find((s) => s.id === ref)
    if (!slide) throw new Error(`no slide with id ${ref}`)
    return slide
  }
  throw new Error('slide must be a 1-based number or a slide id')
}

const handlers: Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>> = {
  status() {
    const { project, step, activeSlideId } = useProjectStore.getState()
    return {
      protocol: PROTOCOL_VERSION,
      app: 'screenshot-studio',
      step,
      activeSlideId,
      project: project && {
        id: project.id,
        name: project.name,
        sourceLocale: project.sourceLocale,
        targetLocales: project.targetLocales ?? [],
        slideCount: project.slides.length,
      },
      // Which file the agent is editing, and whether its edits are in it yet.
      // Without this an agent patches for an hour with no idea what it is
      // touching or whether anything it did is on disk.
      document: docStatus(),
    }
  },

  /** Just the document facts — path, name, dirty. Also the e2e harness's eyes. */
  docStatus() {
    return docStatus()
  },

  /**
   * ⌘S on the agent's behalf. Patches make the document dirty exactly like a
   * user edit does (no special treatment, and no autosave), so this is how an
   * agent commits a batch of them.
   */
  async save() {
    const { project, docPath } = useProjectStore.getState()
    if (!project) throw new Error('no project is open — create or open one in the app first')
    if (!docPath) {
      // Save As would put a native panel in front of the user with no way for
      // the agent to answer it.
      throw new Error('this project has no file yet; save it once from the app (⇧⌘S) first')
    }
    if (!(await saveDocument())) {
      const error = useDocumentStore.getState().error
      throw new Error(error ? `${error.title}: ${error.detail}` : 'the save did not complete')
    }
    return docStatus()
  },

  /**
   * Open a .studio.zip as the live document. Refuses to discard unsaved work
   * unless told to: the user may be watching a project the agent did not save.
   */
  async open(params) {
    const path = params.path
    if (typeof path !== 'string' || !path) throw new Error('open needs an absolute "path"')
    const { project, savedHash } = useProjectStore.getState()
    if (project && isDirty(project, savedHash) && params.discardUnsaved !== true) {
      throw new Error(
        `"${project.name}" has unsaved changes. Call save first, or pass discardUnsaved: true.`,
      )
    }
    if (!(await openDocument(path))) {
      const error = useDocumentStore.getState().error
      throw new Error(error ? `${error.title}: ${error.detail}` : 'the file could not be opened')
    }
    return docStatus()
  },

  // Navigation. Deliberately outside applyPatch's vocabulary because it changes
  // no project data — but an agent driving the window the user is watching has
  // to be able to bring them to the surface it is editing.
  focus(params) {
    const store = useProjectStore.getState()
    if (params.step === undefined && params.slide === undefined) {
      throw new Error('focus needs a step and/or a slide')
    }

    if (params.slide !== undefined) {
      store.setActiveSlide(findSlide(requireProject(), params.slide).id)
    }
    const { step } = params
    if (step !== undefined) {
      if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 4) {
        throw new Error('step must be 1 (project), 2 (editor), 3 (localize) or 4 (export)')
      }
      // Steps 2-4 all render a project; sending the user there without one
      // would land them on a blank surface.
      if (step !== 1) requireProject()
      store.setStep(step as Step)
    }
    return handlers.status({})
  },

  async newProject(params) {
    const store = useProjectStore.getState()
    // Creating clobbers whatever is open, so it takes an explicit flag — an
    // agent must not throw away work the user has on screen by accident.
    if (store.project && params.replace !== true) {
      throw new Error(
        `"${store.project.name}" is already open (${store.project.slides.length} slides). ` +
          'Pass replace: true to discard it, or patch the open project instead.',
      )
    }

    const slideCount = typeof params.slideCount === 'number' ? params.slideCount : 5
    if (!Number.isInteger(slideCount) || slideCount < 1 || slideCount > 10) {
      throw new Error('slideCount must be an integer between 1 and 10')
    }
    const device = (params.device === 'ipad' ? 'ipad' : 'iphone') as DeviceType
    const themeId = typeof params.theme === 'string' ? params.theme : THEME_PRESETS[0].id
    const preset = findThemePreset(themeId)
    if (!preset) {
      throw new Error(`unknown theme "${themeId}"; try one of ${THEME_PRESETS.map((p) => p.id).join(', ')}`)
    }

    store.createProject({
      name: typeof params.name === 'string' && params.name.trim() ? params.name.trim() : 'Untitled',
      devices: [device],
      deviceModels: { [device]: DEFAULT_MODEL[device] },
      screenshotCount: slideCount,
      themeBackground: structuredClone(preset.background),
    })
    // Same rule the app's own new-project form follows: it becomes a file
    // immediately, so an agent's project is never one crash from gone.
    const created = useProjectStore.getState().project
    if (created) await adoptAsDocument(created)
    return handlers.status({})
  },

  // Raw project + the image keys that actually resolve. The MCP server shapes
  // this with the same `inspectBundle` used for bundles on disk, so an agent
  // reads one vocabulary either way.
  inspect() {
    const project = requireProject()
    return {
      project,
      images: Object.fromEntries(projectImageKeys(project).map((key) => [key, `idb:${key}`])),
      // A highlight's sourceRegion is normalized to the screenshot's box on the
      // composed canvas, but all an agent can see is the render. Only the app
      // can answer where that box is (the layout math lives in the TS graph the
      // MCP process can't import), so it answers here.
      screenRects: screenRectsOf(project),
    }
  },

  // The localize worklist, addressed the way `patch` accepts it. Without this an
  // agent has to reconstruct "what still needs translating" out of the whole
  // project JSON — the reason translation stayed a CSV round-trip.
  untranslated() {
    const project = requireProject()
    const pending = getPendingTranslations(project)
    return {
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales ?? [],
      pending,
      missingCells: pending.reduce((n, p) => n + p.missing.length, 0),
    }
  },

  patch(params) {
    const project = requireProject()
    const ops = params.ops
    if (!Array.isArray(ops) || ops.length === 0) throw new Error('patch needs a non-empty ops array')

    const { project: next, issues } = applyPatch(project, ops as PatchOp[])
    // Deliberately not loadProject: that would snap the user back to step 2 and
    // slide 1. updateProject replaces the project in place, leaving whatever
    // slide they are looking at selected while the canvas re-seeds.
    useProjectStore.getState().updateProject(next)
    return { applied: ops.length, issues }
  },

  async view(params) {
    const project = requireProject()
    const slide = findSlide(project, params.slide)
    const locale = typeof params.locale === 'string' ? params.locale : project.sourceLocale
    const renderLocale = locale === project.sourceLocale ? null : locale

    // Full export resolution on purpose: absolute-pixel constants (fit-to-box
    // floor, headline gap) make a preview-width render diverge from the real
    // export, and an agent judging layout must see what actually ships. The MCP
    // server downscales for transport.
    let blob: Blob
    if (slide.spanGroupId) {
      const leader = project.slides.find((s) => s.spanGroupId === slide.spanGroupId && s.spanRole === 'leader')
      const follower = project.slides.find((s) => s.spanGroupId === slide.spanGroupId && s.spanRole === 'follower')
      if (!leader || !follower) throw new Error(`span group ${slide.spanGroupId} is missing a half`)
      const halves = await renderSpanGroup(leader, follower, renderLocale)
      blob = slide.spanRole === 'leader' ? halves.leader : halves.follower
    } else {
      blob = await renderSlide(slide, renderLocale)
    }

    return { slide: slide.index + 1, locale, pngBase64: await blobToBase64(blob) }
  },
}

let started = false

/** Mount the request listener, then tell Rust the window can take calls. */
export function startAgentBridge(): void {
  if (started || !isTauri()) return
  started = true

  void (async () => {
    // Listener first: Rust rejects calls until bridge_ready, so there is no
    // window where an event could arrive with nothing to receive it.
    await listen<BridgeRequest>('bridge:request', (event) => {
      const { reqId, method, params } = event.payload
      void (async () => {
        let payload: Record<string, unknown>
        try {
          const handler = handlers[method]
          if (!handler) throw new Error(`unknown bridge method: ${method}`)
          payload = { ok: true, result: await handler(params ?? {}) }
        } catch (e) {
          payload = { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
        // A failure here means the caller already timed out or hung up.
        await invoke('bridge_respond', { reqId, payload }).catch(() => {})
      })()
    })
    await invoke('bridge_ready')
  })()
}


function docStatus(): {
  path: string | null
  name: string | null
  dirty: boolean
  error?: string
} {
  const { project, docPath, savedHash } = useProjectStore.getState()
  const error = useDocumentStore.getState().error
  return {
    path: docPath,
    name: docPath ? docNameFromPath(docPath) : (project?.name ?? null),
    dirty: isDirty(project, savedHash),
    // A project that ends up with no path did not get one for a reason, and
    // "path: null" on its own tells an agent nothing about what to fix.
    ...(error ? { error: `${error.title}: ${error.detail}` } : {}),
  }
}

/**
 * Each slide's screenshot box on the composed canvas, keyed by slide id, in
 * canvas fractions so it lines up with a render at any resolution.
 */
function screenRectsOf(project: Project): Record<string, {
  left: number
  top: number
  width: number
  height: number
}> {
  const out: Record<string, { left: number; top: number; width: number; height: number }> = {}
  for (const slide of project.slides) {
    if (!slide.screenshot) continue
    const span = !!slide.spanGroupId
    const cw = span ? EDITOR_CANVAS_WIDTH * 2 : EDITOR_CANVAS_WIDTH
    const ch = getCanvasHeight(slide)
    const b = screenBoundsOf(slide, cw, ch, span)
    if (!b) continue
    out[slide.id] = {
      left: b.left / cw,
      top: b.top / ch,
      width: b.width / cw,
      height: b.height / ch,
    }
  }
  return out
}
