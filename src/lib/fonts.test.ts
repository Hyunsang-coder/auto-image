import { describe, it, expect } from 'vitest'
import { scriptFallback } from './fonts'

describe('scriptFallback', () => {
  it('leads with no Noto font for Latin or Korean text', () => {
    expect(scriptFallback('Get started')).toMatch(/^'Pretendard'/)
    expect(scriptFallback('시작하기')).toMatch(/^'Pretendard'/)
  })

  it('leads with Noto Sans JP when kana is present', () => {
    expect(scriptFallback('はじめる')).toMatch(/^'Noto Sans JP'/)
    // Mixed kanji + kana (typical Japanese UI copy) still routes to JP.
    expect(scriptFallback('今すぐ始める')).toMatch(/^'Noto Sans JP'/)
  })

  it('always ends in a generic sans-serif so unloaded fonts degrade gracefully', () => {
    expect(scriptFallback('はじめる')).toMatch(/sans-serif$/)
    expect(scriptFallback('Hello')).toMatch(/sans-serif$/)
  })
})
