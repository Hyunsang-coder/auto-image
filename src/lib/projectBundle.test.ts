import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for IndexedDB: the round trip being checked is
// project → zip → project, and the blob store is the part jsdom does not have.
const blobs = new Map<string, Blob>()
vi.mock('./imageStore', () => ({
  loadImageBlob: async (key: string) => blobs.get(key),
  putImage: async (key: string, blob: Blob) => {
    blobs.set(key, blob)
  },
}))

import JSZip from 'jszip'
import type { Project } from '../types/project'
import { makeProject } from '../constants/defaults'
import { PROJECT_SCHEMA_VERSION } from './projectMigrate'
import { projectImageKeys } from './imageRefs'
import { exportProjectBundle, readProjectBundle } from './projectBundle'
import { hashProject } from './documentModel'

function png(seed: string): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71, seed.charCodeAt(0)])], { type: 'image/png' })
}

/** A project that touches every surface `projectImageKeys` collects. */
function fullProject(): Project {
  const base = makeProject({
    name: 'Memento',
    devices: ['iphone'],
    screenshotCount: 2,
    themeBackground: { type: 'image', imageKey: 'img:theme', imageObjectFit: 'cover' },
  })
  const [first, second] = base.slides
  return {
    ...base,
    targetLocales: ['ja'],
    slides: [
      {
        ...first,
        screenshot: {
          id: 'shot-1',
          imageKey: 'img:shot1',
          originalWidth: 1320,
          originalHeight: 2868,
          localeOverrides: {
            ja: { imageKey: 'img:shot1-ja', originalWidth: 1320, originalHeight: 2868 },
          },
        },
        background: { type: 'image', imageKey: 'img:bg', imageObjectFit: 'cover' },
        externalImages: [
          {
            id: 'ext-1',
            imageKey: 'img:logo',
            originalWidth: 100,
            originalHeight: 100,
            x: 0.5,
            y: 0.5,
            width: 0.3,
            rotation: 0,
            opacity: 1,
            cornerRadiusRatio: 0,
            shadow: false,
          },
        ],
      },
      second,
    ],
  }
}

describe('the save / reopen round trip', () => {
  beforeEach(() => {
    blobs.clear()
    for (const key of ['img:theme', 'img:shot1', 'img:shot1-ja', 'img:bg', 'img:logo']) {
      blobs.set(key, png(key))
    }
  })

  // The whole document model rests on this: what comes back has to be what
  // went in, or every ⌘S is a slow corruption.
  it('brings the project back byte-for-byte, by the same hash dirty uses', async () => {
    const project = fullProject()
    const { blob, missingImageKeys } = await exportProjectBundle(project)
    expect(missingImageKeys).toEqual([])

    const reopened = await readProjectBundle(blob)
    expect(reopened.project).toEqual(project)
    expect(hashProject(reopened.project)).toBe(hashProject(project))
    expect(reopened.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
  })

  // A file that carries the JSON but not the pixels is the failure nobody
  // notices until they open it on another machine.
  it('carries every referenced image, including the ones that are easy to miss', async () => {
    const project = fullProject()
    const keys = [...new Set(projectImageKeys(project))]
    // Theme background, per-locale override and external image all count.
    expect(keys).toEqual(
      expect.arrayContaining(['img:theme', 'img:shot1', 'img:shot1-ja', 'img:bg', 'img:logo']),
    )

    const { blob } = await exportProjectBundle(project)
    const zip = await JSZip.loadAsync(blob)
    for (const key of keys) {
      expect(zip.file(`images/${key.replace('img:', '')}.png`)).not.toBeNull()
    }

    // And reopening puts them back under the keys the project points at, so a
    // fresh machine resolves every reference.
    blobs.clear()
    const reopened = await readProjectBundle(blob)
    for (const key of projectImageKeys(reopened.project)) {
      expect(blobs.get(key), `image ${key} did not survive the round trip`).toBeInstanceOf(Blob)
    }
  })

  it('names the images it could not carry instead of quietly dropping them', async () => {
    const project = fullProject()
    blobs.delete('img:logo')

    const { blob, missingImageKeys } = await exportProjectBundle(project)
    expect(missingImageKeys).toEqual(['img:logo'])
    // The pointer stays in the JSON, so reopening degrades the same way here as
    // it does anywhere else rather than silently losing the layer too.
    const reopened = await readProjectBundle(blob)
    expect(reopened.project.slides[0].externalImages?.[0].imageKey).toBe('img:logo')
  })

  // The `.bak` on first save exists precisely for files written under an older
  // schema, so the reader has to report the version it actually found.
  it('reports the schema the file was written under, not the current one', async () => {
    const project = fullProject()
    const { blob } = await exportProjectBundle(project)
    const zip = await JSZip.loadAsync(blob)
    const manifest = JSON.parse(await zip.file('project.json')!.async('string'))
    delete manifest.schemaVersion // a v1 bundle, from before the stamp existed
    zip.file('project.json', JSON.stringify(manifest))

    const reopened = await readProjectBundle(await zip.generateAsync({ type: 'blob' }))
    expect(reopened.schemaVersion).toBe(4)
    expect(reopened.project.slides).toHaveLength(2)
  })

  it('refuses a zip that is not a project bundle', async () => {
    const zip = new JSZip()
    zip.file('hello.txt', 'not a project')
    await expect(readProjectBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(
      /not a project bundle/,
    )
  })
})
