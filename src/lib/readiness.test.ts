import { describe, it, expect } from 'vitest'
import { getPendingTranslations, getUntranslatedLocales } from './readiness'
import type { Badge, Caption, Project, Slide } from '../types/project'

const STYLE = { fontFamily: 'Pretendard', fontSize: 35, fontWeight: 700, color: '#000', textAlign: 'left' } as Caption['style']

const cap = (text: string, translations: Record<string, string> = {}): Caption =>
  ({ text, translations, style: STYLE }) as Caption

const badge = (text: string, translations: Record<string, string> = {}): Badge =>
  ({ text, translations }) as Badge

const slide = (over: Partial<Slide>): Slide =>
  ({ id: 'x', index: 0, texts: [], badges: [], highlights: [], ...over }) as unknown as Slide

const project = (slides: Slide[], targetLocales: string[]): Project =>
  ({ id: 'p', name: 'P', sourceLocale: 'ko', targetLocales, slides }) as unknown as Project

describe('getPendingTranslations', () => {
  it('reports each missing locale per string, addressed the way setText takes it', () => {
    const p = project([slide({ id: 's1', index: 0, texts: [cap('헤드라인', { en: 'Headline' }), cap('서브')] })], ['en', 'ja'])
    expect(getPendingTranslations(p)).toEqual([
      { slide: 1, slideId: 's1', field: 'text:0', sourceText: '헤드라인', missing: ['ja'] },
      { slide: 1, slideId: 's1', field: 'text:1', sourceText: '서브', missing: ['en', 'ja'] },
    ])
  })

  it('skips empty strings and fully translated ones', () => {
    const p = project([slide({ id: 's1', index: 0, texts: [cap(''), cap('둘', { en: 'Two' })] })], ['en'])
    expect(getPendingTranslations(p)).toEqual([])
  })

  it('includes badges, which the caption table and CSV template also carry', () => {
    const p = project([slide({ id: 's1', index: 0, texts: [], badges: [badge('신규')] })], ['en'])
    expect(getPendingTranslations(p)).toEqual([
      { slide: 1, slideId: 's1', field: 'badge:0', sourceText: '신규', missing: ['en'] },
    ])
  })

  it('leaves a span follower its own texts but not the leader-owned badges', () => {
    const p = project(
      [
        slide({ id: 'lead', index: 0, spanGroupId: 'g', spanRole: 'leader', texts: [cap('왼쪽')], badges: [badge('배지')] }),
        slide({ id: 'foll', index: 1, spanGroupId: 'g', spanRole: 'follower', texts: [cap('오른쪽')], badges: [badge('무시됨')] }),
      ],
      ['en'],
    )
    expect(getPendingTranslations(p).map((x) => `${x.slide}:${x.field}`)).toEqual([
      '1:text:0',
      '1:badge:0',
      '2:text:0',
    ])
  })
})

describe('getUntranslatedLocales', () => {
  it('names only the locales that still have a gap', () => {
    const p = project([slide({ id: 's1', index: 0, texts: [cap('가', { en: 'A' })] })], ['en', 'ja'])
    expect(getUntranslatedLocales(p)).toEqual(['ja'])
  })

  it('counts an untranslated badge, so the readiness dot cannot disagree with the table', () => {
    const p = project([slide({ id: 's1', index: 0, texts: [cap('가', { en: 'A' })], badges: [badge('배지')] })], ['en'])
    expect(getUntranslatedLocales(p)).toEqual(['en'])
  })
})
