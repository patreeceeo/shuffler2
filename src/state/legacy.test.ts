import { describe, expect, it } from 'vitest'
import {
  decodeLegacy,
  integerToPermutation,
  legacySlots,
  LEGACY_MAX_ITEMS,
} from './legacy'
import { encode, decode } from './codec'

describe('integerToPermutation (ported from v1)', () => {
  it('returns the identity for 0', () => {
    expect(integerToPermutation(0, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('is a permutation for every index in [0, n!)', () => {
    const items = ['a', 'b', 'c', 'd']
    const seen = new Set<string>()
    for (let n = 0; n < 24; n++) {
      const permuted = integerToPermutation(n, items)
      expect([...permuted].sort()).toEqual([...items].sort())
      seen.add(permuted.join(''))
    }
    // 4! distinct indices must give 4! distinct permutations.
    expect(seen.size).toBe(24)
  })

  it('wraps out-of-range indices instead of erroring, as v1 did', () => {
    const items = ['a', 'b', 'c']
    expect(integerToPermutation(6, items)).toEqual(integerToPermutation(0, items))
    expect(integerToPermutation(7, items)).toEqual(integerToPermutation(1, items))
  })

  it('handles empty and single-item lists', () => {
    expect(integerToPermutation(5, [])).toEqual([])
    expect(integerToPermutation(5, ['only'])).toEqual(['only'])
  })

  it('is stated to be meaningful only up to 18 items', () => {
    // 19! > Number.MAX_SAFE_INTEGER, which is why v2 stores order directly (PLAN §1).
    expect(LEGACY_MAX_ITEMS).toBe(18)
  })
})

describe("legacySlots: v1's Sunday-based week-after rule", () => {
  it('starts on the Sunday after rotationStart', () => {
    // 2026-09-17 is a Thursday; the week after starts Sunday 2026-09-20.
    expect(legacySlots('2026-09-17', 3)).toEqual([
      '2026-09-20T00:00',
      '2026-09-27T00:00',
      '2026-10-04T00:00',
    ])
  })

  it('moves a full week on when rotationStart is itself a Sunday', () => {
    // 2026-09-20 is a Sunday; "the week after" is 2026-09-27, not the same day.
    expect(legacySlots('2026-09-20', 1)).toEqual(['2026-09-27T00:00'])
  })

  it('uses calendar arithmetic across a DST boundary', () => {
    // 2026-03-08 is US spring-forward. Every slot must still be 00:00.
    const slots = legacySlots('2026-02-25', 6)
    expect(slots).toEqual([
      '2026-03-01T00:00',
      '2026-03-08T00:00',
      '2026-03-15T00:00',
      '2026-03-22T00:00',
      '2026-03-29T00:00',
      '2026-04-05T00:00',
    ])
    expect(slots.every((slot) => slot.endsWith('T00:00'))).toBe(true)
  })

  it('returns nothing for an unparseable or impossible start date', () => {
    expect(legacySlots('', 3)).toEqual([])
    expect(legacySlots('not-a-date', 3)).toEqual([])
    expect(legacySlots('2026-02-31', 3)).toEqual([])
    expect(legacySlots('2026-13-01', 3)).toEqual([])
  })
})

describe('decodeLegacy', () => {
  const v1 = '?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17'

  it('imports a real v1 URL', () => {
    const state = decodeLegacy(v1)
    expect(state).not.toBeNull()
    expect(state?.v).toBe(2)
    expect([...(state?.names ?? [])].sort()).toEqual(['Ada', 'Grace', 'Linus'])
    // v1 hardcoded groupSize 2 and ceil(3/2) = 2 weekly slots at 00:00.
    expect(state?.groupSize).toBe(2)
    expect(state?.slots).toEqual(['2026-09-20T00:00', '2026-09-27T00:00'])
    expect(state?.title).toBe('')
  })

  it('applies the v1 permutation exactly', () => {
    const items = ['Ada', 'Grace', 'Linus']
    expect(decodeLegacy(v1)?.names).toEqual(integerToPermutation(3, items))
  })

  it('works without the leading question mark', () => {
    expect(decodeLegacy(v1.slice(1))?.names).toEqual(decodeLegacy(v1)?.names)
  })

  it('returns null when there is nothing v1 about the query string', () => {
    expect(decodeLegacy('')).toBeNull()
    expect(decodeLegacy('?foo=bar')).toBeNull()
    expect(decodeLegacy('?items=')).toBeNull()
  })

  it('tolerates a missing randomizer and a missing rotationStart', () => {
    const state = decodeLegacy('?items=Ada&items=Grace')
    expect(state?.names).toEqual(['Ada', 'Grace'])
    expect(state?.slots).toEqual([])
  })

  it('tolerates a nonsense randomizer', () => {
    expect(decodeLegacy('?items=Ada&items=Grace&randomizer=banana')?.names).toEqual([
      'Ada',
      'Grace',
    ])
  })

  it('keeps the given order above 18 items, where v1 index was already meaningless', () => {
    const items = Array.from({ length: 25 }, (_, i) => `n${String(i)}`)
    const query = `?${items.map((n) => `items=${n}`).join('&')}&randomizer=99`
    expect(decodeLegacy(query)?.names).toEqual(items)
  })

  it('does not choke on markup in v1 item names (v1 had stored XSS here)', () => {
    const state = decodeLegacy(
      '?items=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&items=Ada',
    )
    expect(state?.names).toContain('<img src=x onerror=alert(1)>')
  })

  it('produces state that round-trips through the v2 codec', async () => {
    const state = decodeLegacy(v1)!
    await expect(decode(await encode(state))).resolves.toEqual(state)
  })
})
