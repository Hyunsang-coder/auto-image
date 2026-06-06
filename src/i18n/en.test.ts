import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { en } from './en'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry.name)) return []
    if (/\.test\.tsx?$/.test(entry.name)) return []
    return [full]
  })
}

// Matches the first argument of t('…') / t("…") — single string literal only.
const T_CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
const HAS_KOREAN = /[가-힣]/

describe('en dictionary', () => {
  it('covers every Korean key passed to t()', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, 'utf8')
      for (const match of code.matchAll(T_CALL)) {
        const key = match[2].replace(/\\(['"])/g, '$1')
        if (HAS_KOREAN.test(key) && !(key in en)) {
          missing.push(`${file.slice(SRC.length + 1)}: ${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps {token} slots consistent between key and translation', () => {
    const broken: string[] = []
    for (const [key, value] of Object.entries(en)) {
      const keyTokens = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      const valueTokens = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      // Every token the translation uses must exist in the key (a key token
      // may be intentionally dropped in English, e.g. counters).
      for (const token of valueTokens) {
        if (!keyTokens.includes(token)) broken.push(`${key} → unknown {${token}}`)
      }
    }
    expect(broken).toEqual([])
  })
})
