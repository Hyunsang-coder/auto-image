import { describe, expect, it } from 'vitest'
import { makeProject } from '../constants/defaults'
import type { Project } from '../types/project'
import {
  addRecent,
  backupStamp,
  docNameFromPath,
  dropRecent,
  ensureDocExt,
  hashProject,
  isDirty,
  markMissing,
  parseRecents,
  pickDroppedBundle,
  sanitizeFileBase,
  uniqueDocBase,
  type RecentEntry,
} from './documentModel'

function project(name = 'Memento'): Project {
  return makeProject({
    name,
    devices: ['iphone'],
    screenshotCount: 2,
    themeBackground: { type: 'solid', color: '#101015' },
  })
}

describe('dirty tracking', () => {
  it('is a comparison, so undoing back to the saved state clears it by itself', () => {
    const saved = project()
    const hash = hashProject(saved)
    expect(isDirty(saved, hash)).toBe(false)

    const edited: Project = { ...saved, name: 'Memento Pro' }
    expect(isDirty(edited, hash)).toBe(true)

    // The undo path rebuilds the project from a canvas snapshot rather than
    // restoring the old object, so what has to match is the content, not the
    // identity.
    const undone: Project = { ...edited, name: 'Memento' }
    expect(isDirty(undone, hash)).toBe(false)
  })

  it('ignores updatedAt, which every store write stamps anew', () => {
    const saved = project()
    // Without this exclusion the very act of undoing — which touches the
    // project — would keep it dirty forever.
    expect(hashProject({ ...saved, updatedAt: '2099-01-01T00:00:00.000Z' })).toBe(
      hashProject(saved),
    )
  })

  it('treats a never-saved project as dirty', () => {
    expect(isDirty(project(), null)).toBe(true)
    expect(isDirty(null, null)).toBe(false)
  })

  it('notices a screenshot swap, which only ever changes an imageKey', () => {
    const base = project()
    const withShot: Project = {
      ...base,
      slides: base.slides.map((s, i) =>
        i === 0
          ? {
              ...s,
              screenshot: {
                id: 'shot-1',
                imageKey: 'img:aaa',
                originalWidth: 1320,
                originalHeight: 2868,
              },
            }
          : s,
      ),
    }
    const swapped: Project = {
      ...withShot,
      slides: withShot.slides.map((s, i) =>
        i === 0 && s.screenshot ? { ...s, screenshot: { ...s.screenshot, imageKey: 'img:bbb' } } : s,
      ),
    }
    expect(hashProject(withShot)).not.toBe(hashProject(swapped))
  })
})

describe('document names and paths', () => {
  it('reads the display name off the file name', () => {
    expect(docNameFromPath('/Users/x/Documents/Screenshot Studio/Memento.studio.zip')).toBe('Memento')
    expect(docNameFromPath('/Users/x/Memento.zip')).toBe('Memento')
    expect(docNameFromPath('/Users/x/Memento')).toBe('Memento')
  })

  it('puts the double extension back on whatever the save panel returned', () => {
    expect(ensureDocExt('/x/A.studio.zip')).toBe('/x/A.studio.zip')
    // macOS treats ".studio.zip" as one unknown extension and may hand back
    // either of these.
    expect(ensureDocExt('/x/A')).toBe('/x/A.studio.zip')
    expect(ensureDocExt('/x/A.zip')).toBe('/x/A.studio.zip')
    expect(ensureDocExt('/x/A.STUDIO.ZIP')).toBe('/x/A.STUDIO.ZIP')
  })

  it('strips what a file name cannot carry, and never yields an empty name', () => {
    expect(sanitizeFileBase('My App', 'Untitled')).toBe('My App')
    expect(sanitizeFileBase('a/b:c', 'Untitled')).toBe('a b c')
    // A leading dot would hide the file; a trailing dot or space is dropped by
    // macOS itself, which would silently change the path the app remembers.
    expect(sanitizeFileBase('  ..hidden ', 'Untitled')).toBe('hidden')
    expect(sanitizeFileBase('   ', 'Untitled')).toBe('Untitled')
    expect(sanitizeFileBase('한글 이름 - 2', 'Untitled')).toBe('한글 이름 - 2')
  })

  it('avoids collisions the way Finder does', () => {
    expect(uniqueDocBase('Memento', [])).toBe('Memento')
    expect(uniqueDocBase('Memento', ['Memento.studio.zip'])).toBe('Memento 2')
    expect(uniqueDocBase('Memento', ['Memento.studio.zip', 'Memento 2.studio.zip'])).toBe('Memento 3')
    // The filesystem is case-insensitive on a default macOS volume, so a name
    // that only differs in case is still a collision.
    expect(uniqueDocBase('Memento', ['memento.studio.zip'])).toBe('Memento 2')
    // An unrelated file with the same stem is not one.
    expect(uniqueDocBase('Memento', ['Memento.png'])).toBe('Memento')
  })
})

describe('dropped files', () => {
  it('picks the bundle out of a mixed drop', () => {
    expect(pickDroppedBundle(['/a/shot.png', '/a/Memento.studio.zip', '/a/manifest.json'])).toBe(
      '/a/Memento.studio.zip',
    )
  })

  it('accepts a plain .zip, and any case', () => {
    expect(pickDroppedBundle(['/a/Old.ZIP'])).toBe('/a/Old.ZIP')
  })

  it('refuses a drop with no bundle in it', () => {
    expect(pickDroppedBundle(['/a/manifest.json', '/a/1.en.png'])).toBeNull()
    expect(pickDroppedBundle([])).toBeNull()
  })

  it('takes the first bundle when several are dropped', () => {
    expect(pickDroppedBundle(['/a/One.studio.zip', '/a/Two.studio.zip'])).toBe('/a/One.studio.zip')
  })
})

describe('recents', () => {
  const entry = (path: string, extra: Partial<RecentEntry> = {}): RecentEntry => ({
    path,
    name: docNameFromPath(path),
    lastOpened: '2026-09-01T00:00:00.000Z',
    slideCount: 5,
    ...extra,
  })

  it('moves a re-opened project to the front instead of duplicating it', () => {
    let list = addRecent([], entry('/a.studio.zip'))
    list = addRecent(list, entry('/b.studio.zip'))
    list = addRecent(list, entry('/a.studio.zip'))
    expect(list.map((r) => r.path)).toEqual(['/a.studio.zip', '/b.studio.zip'])
  })

  it('keeps the thumbnail a previous save produced when an open has none', () => {
    const withPreview = addRecent([], entry('/a.studio.zip', { preview: 'BASE64' }))
    const reopened = addRecent(withPreview, entry('/a.studio.zip'))
    expect(reopened[0].preview).toBe('BASE64')
  })

  it('caps the list', () => {
    let list: RecentEntry[] = []
    for (let i = 0; i < 14; i++) list = addRecent(list, entry(`/p${i}.studio.zip`))
    expect(list).toHaveLength(10)
    expect(list[0].path).toBe('/p13.studio.zip')
  })

  it('flags a deleted file rather than dropping it', () => {
    const list = markMissing(
      [entry('/gone.studio.zip'), entry('/here.studio.zip')],
      (p) => p === '/here.studio.zip',
    )
    expect(list[0].missing).toBe(true)
    expect(list[1].missing).toBeUndefined()
    expect(dropRecent(list, '/gone.studio.zip').map((r) => r.path)).toEqual(['/here.studio.zip'])
  })

  it('re-opening a file that had gone missing clears the flag', () => {
    const list = addRecent([entry('/a.studio.zip', { missing: true })], entry('/a.studio.zip'))
    expect(list[0].missing).toBeUndefined()
  })

  it('survives a recents file that is empty, truncated, or the wrong shape', () => {
    expect(parseRecents(null)).toEqual([])
    expect(parseRecents('[{"path":')).toEqual([])
    expect(parseRecents('{"not":"an array"}')).toEqual([])
    expect(parseRecents('[null, 3, {"noPath":1}]')).toEqual([])
    expect(parseRecents('[{"path":"/a.studio.zip"}]')).toEqual([
      { path: '/a.studio.zip', name: 'a', lastOpened: '', slideCount: 0, preview: undefined, missing: undefined },
    ])
  })
})

describe('backup stamps', () => {
  it('sorts chronologically as plain text and carries no path-illegal character', () => {
    const early = backupStamp(new Date('2026-09-01T09:05:01.123Z'))
    const late = backupStamp(new Date('2026-09-01T10:00:00.000Z'))
    expect(early < late).toBe(true)
    // The Rust side prunes by sorting names, and rejects any segment outside
    // [A-Za-z0-9._-].
    expect(early).toMatch(/^[A-Za-z0-9._-]+$/)
  })
})
