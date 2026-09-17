import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  base64UrlToBytes,
  blobFromHash,
  decode,
  encode,
  fromTuple,
  minutesToSlot,
  slotToMinutes,
  toTuple,
} from './codec'
import { EMPTY_STATE, MAX_SLOTS, type RotationState } from './schema'

const sample: RotationState = {
  v: 2,
  title: 'Dish duty',
  names: ['Ada', 'Grace', 'Linus'],
  slots: ['2026-09-21T09:00', '2026-09-28T09:00', '2026-10-05T09:00'],
  groupSize: 1,
}

describe('slot <-> minutes', () => {
  it('round-trips without touching a timezone', () => {
    for (const slot of [
      '1970-01-01T00:00',
      '2026-09-21T09:00',
      '2000-02-29T23:59',
      '1969-12-31T23:59',
      '2100-03-01T00:01',
      '9999-12-31T23:59',
      '0001-01-01T00:00',
    ]) {
      expect(minutesToSlot(slotToMinutes(slot))).toBe(slot)
    }
  })

  it('anchors 1970-01-01T00:00 at zero', () => {
    expect(slotToMinutes('1970-01-01T00:00')).toBe(0)
  })

  it('makes a weekly gap exactly 10080 minutes regardless of DST', () => {
    // 2026-03-08 is US spring-forward; 2026-11-01 is fall-back. These are *wall clock*
    // minutes, so both gaps must be a flat week. A Date-based codec would give 10020/10140.
    expect(slotToMinutes('2026-03-09T09:00') - slotToMinutes('2026-03-02T09:00')).toBe(
      10080,
    )
    expect(slotToMinutes('2026-11-02T09:00') - slotToMinutes('2026-10-26T09:00')).toBe(
      10080,
    )
  })
})

describe('tuple shape', () => {
  it('is positional and delta-encoded', () => {
    const tuple = toTuple(sample)
    expect(tuple[0]).toBe(2)
    expect(tuple[1]).toBe('Dish duty')
    expect(tuple[2]).toEqual(['Ada', 'Grace', 'Linus'])
    expect(tuple[3]).toBe(1)
    expect(tuple[4]).toBe(slotToMinutes('2026-09-21T09:00'))
    expect(tuple[5]).toEqual([10080, 10080])
  })

  it('uses a null anchor and no deltas when there are no slots', () => {
    expect(toTuple(EMPTY_STATE)).toEqual([2, '', [], 1, null, []])
  })
})

describe('encode/decode', () => {
  it('round-trips a realistic state', async () => {
    const blob = await encode(sample)
    expect(blob).toMatch(/^[A-Za-z0-9_-]+$/)
    await expect(decode(blob)).resolves.toEqual(sample)
  })

  it('round-trips unicode, emoji and markup-looking names verbatim', async () => {
    const nasty: RotationState = {
      v: 2,
      title: '<img src=x onerror=alert(1)>',
      names: ['Ada 🦋', 'Grâce', '日本語', '"><script>alert(1)</script>', '  spaced  '],
      slots: ['2026-09-21T09:00'],
      groupSize: 2,
    }
    await expect(decode(await encode(nasty))).resolves.toEqual(nasty)
  })

  it('sorts and de-duplicates slots on the way out', async () => {
    const messy: RotationState = {
      ...sample,
      slots: ['2026-10-05T09:00', '2026-09-21T09:00', '2026-09-21T09:00'],
    }
    const decoded = await decode(await encode(messy))
    expect(decoded?.slots).toEqual(['2026-09-21T09:00', '2026-10-05T09:00'])
  })

  it('handles the empty state', async () => {
    await expect(decode(await encode(EMPTY_STATE))).resolves.toEqual({
      v: 2,
      title: '',
      names: [],
      slots: [],
      groupSize: 1,
    })
  })
})

describe('decode never throws (PLAN §3.4)', () => {
  const junk = [
    '',
    'not base64 !!!',
    '////',
    'AAAA',
    'A',
    '%%%%',
    'eyJhIjoxfQ',
    '-'.repeat(1000),
    'N4IgbiBcoM'.repeat(50),
    null,
    undefined,
  ]

  it.each(junk.map((value) => [JSON.stringify(value) ?? 'undefined', value] as const))(
    'returns null rather than throwing for %s',
    async (_label, value) => {
      await expect(decode(value)).resolves.toBeNull()
    },
  )

  it('returns null for a truncated but otherwise valid blob', async () => {
    const blob = await encode(sample)
    for (let cut = 1; cut < blob.length; cut += 3) {
      const result = await decode(blob.slice(0, cut))
      expect(result === null || result.v === 2).toBe(true)
    }
  })

  it('survives every single-character mutation of a valid blob', async () => {
    const blob = await encode(sample)
    const alphabet = 'AZaz09-_'
    for (let i = 0; i < blob.length; i++) {
      for (const ch of alphabet) {
        const mutated = blob.slice(0, i) + ch + blob.slice(i + 1)
        const result = await decode(mutated)
        expect(result === null || result.v === 2).toBe(true)
      }
    }
  })

  it('rejects a tuple with the wrong version', () => {
    expect(fromTuple([1, '', [], 1, null, []])).toBeNull()
    expect(fromTuple([3, '', [], 1, null, []])).toBeNull()
  })

  it('rejects structurally wrong tuples', () => {
    expect(fromTuple(null)).toBeNull()
    expect(fromTuple({})).toBeNull()
    expect(fromTuple([2])).toBeNull()
    expect(fromTuple([2, '', [], 1, 'nope', []])).toBeNull()
    expect(fromTuple([2, '', [], 1, null, ['x']])).toBeNull()
    expect(fromTuple([2, '', [], 1, null, [10080]])).toBeNull()
    expect(fromTuple([2, '', [], 0, null, []])).toBeNull()
    expect(fromTuple([2, '', [], 1.5, null, []])).toBeNull()
    expect(fromTuple([2, '', ['ok'], -1, null, []])).toBeNull()
    expect(fromTuple([2, 5, [], 1, null, []])).toBeNull()
    expect(fromTuple([2, '', [5], 1, null, []])).toBeNull()
    expect(fromTuple([2, '', [], 1, Number.NaN, []])).toBeNull()
    expect(fromTuple([2, '', [], 1, 1e18, []])).toBeNull()
  })

  it('caps a hostile link at MAX_SLOTS rather than expanding it', () => {
    const deltas = Array.from({ length: MAX_SLOTS + 10 }, () => 1)
    expect(fromTuple([2, '', ['a'], 1, 0, deltas])).toBeNull()
  })

  it('caps a hostile link at MAX_NAMES', () => {
    const names = Array.from({ length: 201 }, (_, i) => `n${String(i)}`)
    expect(fromTuple([2, '', names, 1, null, []])).toBeNull()
  })

  it('rejects impossible calendar slots', () => {
    expect(
      fromTuple([2, '', [], 1, slotToMinutes('2026-02-28T09:00'), []]),
    ).not.toBeNull()
    // A delta that walks the cursor out of representable range.
    expect(fromTuple([2, '', [], 1, 0, [Number.MAX_SAFE_INTEGER]])).toBeNull()
  })

  it('base64UrlToBytes throws on junk, and decode swallows it', () => {
    expect(() => base64UrlToBytes('!!!!')).toThrow()
  })
})

describe('property: decode(encode(s)) === s', () => {
  const arbSlot = fc
    .integer({
      min: slotToMinutes('1900-01-01T00:00'),
      max: slotToMinutes('2200-01-01T00:00'),
    })
    .map(minutesToSlot)

  const arbState: fc.Arbitrary<RotationState> = fc.record({
    v: fc.constant(2 as const),
    title: fc.string({ maxLength: 200 }),
    names: fc.array(fc.string({ maxLength: 100 }), { maxLength: 60 }),
    slots: fc.uniqueArray(arbSlot, { maxLength: 80 }),
    groupSize: fc.integer({ min: 1, max: 20 }),
  })

  it('round-trips arbitrary valid states', async () => {
    await fc.assert(
      fc.asyncProperty(arbState, async (state) => {
        const normalized = { ...state, slots: [...state.slots].sort() }
        const decoded = await decode(await encode(state))
        expect(decoded).toEqual(normalized)
      }),
      { numRuns: 200 },
    )
  })

  it('never throws on arbitrary strings', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 500 }), async (text) => {
        const result = await decode(text)
        expect(result === null || result.v === 2).toBe(true)
      }),
      { numRuns: 300 },
    )
  })
})

describe('size benchmark (PLAN §6 M1)', () => {
  it('keeps a 20-name x 52-week rotation under 500 characters', async () => {
    const names = [
      'Ada',
      'Grace',
      'Linus',
      'Barbara',
      'Katherine',
      'Alan',
      'Edsger',
      'Donald',
      'Margaret',
      'Radia',
      'Vint',
      'Tim',
      'Leslie',
      'Ken',
      'Dennis',
      'Bjarne',
      'Anita',
      'Shafi',
      'Frances',
      'Jean',
    ]
    let cursor = Temporal.PlainDateTime.from('2026-01-05T09:00')
    const slots: string[] = []
    for (let i = 0; i < 52; i++) {
      slots.push(cursor.toString({ smallestUnit: 'minute' }))
      cursor = cursor.add({ weeks: 1 })
    }
    const state: RotationState = {
      v: 2,
      title: 'Dish duty',
      names,
      slots,
      groupSize: 2,
    }
    const blob = await encode(state)
    // If this ever fails, the wire format is wrong — do not loosen the assertion.
    expect(blob.length).toBeLessThan(500)
    await expect(decode(blob)).resolves.toEqual(state)
  })
})

describe('blobFromHash', () => {
  it('reads s= out of a hash', () => {
    expect(blobFromHash('#s=abc')).toBe('abc')
    expect(blobFromHash('s=abc')).toBe('abc')
    expect(blobFromHash('#s=a-b_c')).toBe('a-b_c')
  })

  it('returns null for anything else', () => {
    expect(blobFromHash('')).toBeNull()
    expect(blobFromHash('#')).toBeNull()
    expect(blobFromHash('#other=1')).toBeNull()
    expect(blobFromHash('#s=')).toBeNull()
  })
})
