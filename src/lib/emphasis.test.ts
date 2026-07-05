import { describe, it, expect } from 'vitest'
import { parseEmphasis } from './emphasis'

describe('parseEmphasis', () => {
  it('returns text unchanged when no markers', () => {
    expect(parseEmphasis('Track every deck')).toEqual({ plain: 'Track every deck', ranges: [] })
  })

  it('strips one marked word and reports its range', () => {
    expect(parseEmphasis('Track ==every== deck')).toEqual({
      plain: 'Track every deck',
      ranges: [{ start: 6, end: 11 }],
    })
  })

  it('handles multiple ranges and multi-word spans', () => {
    expect(parseEmphasis('==A== and ==b c==')).toEqual({
      plain: 'A and b c',
      ranges: [
        { start: 0, end: 1 },
        { start: 6, end: 9 },
      ],
    })
  })

  it('keeps an unmatched opener literal', () => {
    expect(parseEmphasis('no ==pair')).toEqual({ plain: 'no ==pair', ranges: [] })
  })

  it('drops an empty marker pair', () => {
    expect(parseEmphasis('a====b')).toEqual({ plain: 'ab', ranges: [] })
  })

  it('spans newlines', () => {
    expect(parseEmphasis('one ==two\nthree== four')).toEqual({
      plain: 'one two\nthree four',
      ranges: [{ start: 4, end: 13 }],
    })
  })
})
