import { describe, expect, it } from 'vitest'
import { insertNames, moveItem, splitPastedNames } from './names'

describe('splitPastedNames', () => {
  it('splits a pasted block into rows', () => {
    expect(splitPastedNames('Ada\nGrace\nLinus')).toEqual(['Ada', 'Grace', 'Linus'])
  })

  it('handles CRLF and lone CR', () => {
    expect(splitPastedNames('Ada\r\nGrace\rLinus')).toEqual(['Ada', 'Grace', 'Linus'])
  })

  it('trims and drops blank lines', () => {
    expect(splitPastedNames('  Ada  \n\n\n Grace \n')).toEqual(['Ada', 'Grace'])
  })

  it('leaves a comma-separated single line alone — "Smith, John" is one person', () => {
    expect(splitPastedNames('Smith, John')).toEqual(['Smith, John'])
  })

  it('caps individual names at MAX_NAME', () => {
    expect(splitPastedNames('x'.repeat(500))[0]).toHaveLength(100)
  })

  it('returns nothing for whitespace', () => {
    expect(splitPastedNames('   \n  \n')).toEqual([])
  })
})

describe('insertNames', () => {
  it('inserts at a position', () => {
    expect(insertNames(['a', 'c'], 1, ['b'])).toEqual(['a', 'b', 'c'])
    expect(insertNames(['a', 'b'], 0, ['z'])).toEqual(['z', 'a', 'b'])
    expect(insertNames(['a', 'b'], 99, ['z'])).toEqual(['a', 'b', 'z'])
  })

  it('allows duplicates — someone may take two slots per cycle', () => {
    expect(insertNames(['Ada'], 1, ['Ada'])).toEqual(['Ada', 'Ada'])
  })

  it('caps at MAX_NAMES', () => {
    const many = Array.from({ length: 300 }, () => 'x')
    expect(insertNames([], 0, many)).toHaveLength(200)
  })
})

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op for out-of-range or identical indices', () => {
    expect(moveItem(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['a', 'b'])
  })
})
