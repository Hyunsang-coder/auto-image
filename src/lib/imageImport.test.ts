import { describe, it, expect } from 'vitest'
import { parseImageName } from './imageImport'

const known = new Set(['en', 'ja', 'zh-Hans', 'pt-BR'])

describe('parseImageName', () => {
  it('parses a base screenshot name', () => {
    expect(parseImageName('1.png', known)).toEqual({ slide: 1, locale: undefined })
  })

  it('parses a per-locale override name', () => {
    expect(parseImageName('2.ja.png', known)).toEqual({ slide: 2, locale: 'ja' })
  })

  it('handles hyphenated locale codes', () => {
    expect(parseImageName('3.zh-Hans.png', known)).toEqual({ slide: 3, locale: 'zh-Hans' })
    expect(parseImageName('4.pt-BR.jpg', known)).toEqual({ slide: 4, locale: 'pt-BR' })
  })

  it('strips a leading directory path', () => {
    expect(parseImageName('shots/5.png', known)).toEqual({ slide: 5, locale: undefined })
  })

  it('rejects an unknown locale', () => {
    expect(parseImageName('1.xx.png', known)).toEqual({ error: expect.stringContaining('xx') })
  })

  it('rejects a non-numeric slide', () => {
    expect(parseImageName('cover.png', known)).toEqual({ error: expect.stringContaining('cover') })
    expect(parseImageName('0.png', known)).toEqual({ error: expect.stringContaining('0') })
  })
})
