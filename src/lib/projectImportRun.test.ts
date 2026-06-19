import { describe, it, expect } from 'vitest'
import { routeImportFiles, runProjectImport } from './projectImportRun'

function f(name: string, content = '') {
  return new File([content], name)
}

const MANIFEST = JSON.stringify({
  version: 1,
  name: 'Dogo',
  sourceLocale: 'ko',
  targetLocales: ['en'],
  slides: [{ textBlocks: 1 }, { layout: 'split', textBlocks: 2 }],
})

describe('routeImportFiles', () => {
  it('routes by extension and warns on the rest', () => {
    const r = routeImportFiles([
      f('1.ko.PNG'),
      f('2.en.jpg'),
      f('copy.csv'),
      f('manifest.json'),
      f('readme.txt'),
    ])
    expect(r.imageFiles.map(x => x.name)).toEqual(['1.ko.PNG', '2.en.jpg'])
    expect(r.csvFiles.map(x => x.name)).toEqual(['copy.csv'])
    expect(r.jsonFiles.map(x => x.name)).toEqual(['manifest.json'])
    expect(r.issues).toEqual(['무시된 파일: readme.txt'])
  })
})

describe('runProjectImport', () => {
  it('fails without a manifest-shaped JSON', async () => {
    const r = await runProjectImport([f('rows.json', JSON.stringify({ rows: [] }))])
    expect(r.project).toBeNull()
    expect(r.issues.some(i => i.includes('매니페스트') && i.includes('찾을 수 없습니다'))).toBe(true)
  })

  it('fails on a fatal manifest with the parse issue surfaced', async () => {
    const bad = JSON.stringify({ version: 2, name: 'x', slides: [{}] })
    const r = await runProjectImport([f('manifest.json', bad)])
    expect(r.project).toBeNull()
    expect(r.issues.some(i => i.includes('버전'))).toBe(true)
  })

  it('builds a project from a lone manifest', async () => {
    const r = await runProjectImport([f('manifest.json', MANIFEST)])
    expect(r.project?.name).toBe('Dogo')
    expect(r.applied).toEqual({ slides: 2, screenshots: 0, captions: 0 })
    expect(r.issues).toEqual([])
  })

  it('classifies json by shape and fills captions from a caption JSON', async () => {
    const captions = JSON.stringify({
      rows: [
        { slide: 1, field: 'text:0', texts: { ko: '홈 화면', en: 'Home' } },
        { slide: 1, field: 'badge:0', texts: { ko: '새 기능' } },
        { slide: 2, field: 'text:1', texts: { en: 'Sub' } },
      ],
    })
    const r = await runProjectImport([f('copy.json', captions), f('manifest.json', MANIFEST)])
    // The badge row is skipped — imported slides carry no badge slots.
    expect(r.applied.captions).toBe(3)
    expect(r.issues.some(i => i.includes('건너뜀'))).toBe(true)
    const s1 = r.project!.slides[0]
    expect(s1.texts[0].text).toBe('홈 화면')
    expect(s1.texts[0].translations.en).toBe('Home')
    expect(s1.badges).toHaveLength(0)
    expect(r.project!.slides[1].texts[1].translations.en).toBe('Sub')
  })

  it('fills badge rows when the manifest declares badge slots', async () => {
    const manifest = JSON.stringify({
      version: 1,
      name: 'Dogo',
      sourceLocale: 'ko',
      targetLocales: ['en'],
      slides: [{ textBlocks: 1, badges: [{}] }],
    })
    const captions = JSON.stringify({
      rows: [
        { slide: 1, field: 'badge:0', texts: { ko: '인기', en: 'Popular' } },
      ],
    })
    const r = await runProjectImport([f('copy.json', captions), f('manifest.json', manifest)])
    expect(r.issues).toEqual([])
    expect(r.applied.captions).toBe(2)
    expect(r.project!.slides[0].badges[0]).toMatchObject({
      text: '인기',
      translations: { en: 'Popular' },
    })
  })

  it('prefers CSV over caption JSON and warns', async () => {
    const csv = 'slide,slideId,field,ko,en\n1,,text:0,씨에스브이,CSV\n'
    const json = JSON.stringify({ rows: [{ slide: 1, field: 'text:0', texts: { ko: '제이슨' } }] })
    const r = await runProjectImport([f('manifest.json', MANIFEST), f('copy.csv', csv), f('copy.json', json)])
    expect(r.project!.slides[0].texts[0].text).toBe('씨에스브이')
    expect(r.issues).toContain('캡션 CSV와 JSON이 함께 있음 — CSV 사용')
  })

  it('adds caption-only locales to targetLocales and reports them', async () => {
    const csv = 'slide,slideId,field,ko,ja\n1,,text:0,홈,ホーム\n'
    const r = await runProjectImport([f('manifest.json', MANIFEST), f('copy.csv', csv)])
    expect(r.project!.targetLocales).toEqual(['en', 'ja'])
    expect(r.addedLocales).toEqual(['ja'])
  })

  it('keeps the first of duplicate manifests with a warning', async () => {
    const other = JSON.stringify({ version: 1, name: 'Other', slides: [{}] })
    const r = await runProjectImport([f('a.json', MANIFEST), f('b.json', other)])
    expect(r.project?.name).toBe('Dogo')
    expect(r.issues.some(i => i.includes('매니페스트가 여러 개'))).toBe(true)
  })

  it('skips caption rows whose slot was not declared in the manifest', async () => {
    const csv = 'slide,slideId,field,ko\n1,,text:1,없는슬롯\n'
    const r = await runProjectImport([f('manifest.json', MANIFEST), f('copy.csv', csv)])
    expect(r.applied.captions).toBe(0)
    expect(r.issues.some(i => i.includes('건너뜀'))).toBe(true)
  })
})
