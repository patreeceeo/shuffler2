import { describe, expect, it } from 'vitest'
import { decode } from './codec'
import { decodeLegacy } from './legacy'

/**
 * PLAN §7: "a fixture file of real encoded links from every shipped version (plus the v1
 * query form) asserted to still decode. That test is what makes shared links durable."
 *
 * These blobs were produced by the shipped encoder. **Never edit them.** When the wire
 * format grows a field, append to the tuple (§3.2) and add a new fixture below; every
 * fixture already here must keep decoding to exactly the state recorded with it.
 */

const FIXTURES = [
  {
    label: 'v2.0 — demo state, three names, four weekly slots',
    blob: 'izbSUXLJLM5QSCktqVTSiVZyTElU0lFyL0pMTlXSUfLJzCstVorVMdQxsrQwNjYwMtCJNjQwsDDQQSJjYwE',
    expected: {
      v: 2,
      title: 'Dish duty',
      names: ['Ada', 'Grace', 'Linus'],
      slots: [
        '2026-09-21T09:00',
        '2026-09-28T09:00',
        '2026-10-05T09:00',
        '2026-10-12T09:00',
      ],
      groupSize: 1,
    },
  },
  {
    label: 'v2.0 — 20 names x 52 weekly slots, groupSize 2',
    blob: '7Y2xisJgEIRfRabe4jdI8EolKhivuTtsQorVf01W4h5sYnFvf6y-gA9gMzDMzDdNQah07Gf5Pv2BGqwyg7BzPgsIB7X7CMKa_cQeSc1TL64W6WpgA2GTx04chOrXeMggfLJ37DKB8MVZY3dUC_ujt8DKOGgQaglAJWb6uLmyP8mmU6y-e74oCFtnO0tU9sKGlgoqPhZlSmWiZp7SMtFbX9a2_Qc',
    expected: null as unknown,
  },
] as const

describe('fixture links keep decoding', () => {
  it('decodes the v2.0 demo blob to exactly the recorded state', async () => {
    const fixture = FIXTURES[0]
    await expect(decode(fixture.blob)).resolves.toEqual(fixture.expected)
  })

  it('decodes the v2.0 20x52 blob with all 52 slots a calendar week apart', async () => {
    const state = await decode(FIXTURES[1].blob)
    expect(state).not.toBeNull()
    expect(state?.names).toHaveLength(20)
    expect(state?.slots).toHaveLength(52)
    expect(state?.groupSize).toBe(2)
    expect(state?.slots[0]).toBe('2026-01-05T09:00')
    expect(state?.slots.at(-1)).toBe('2026-12-28T09:00')
    // Every slot is still 09:00 — the whole point of floating wall-clock time.
    expect(state?.slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
  })

  it('keeps the 20x52 link comfortably short', () => {
    expect(FIXTURES[1].blob.length).toBeLessThan(500)
  })

  it('still imports a real v1 query-string link', () => {
    const state = decodeLegacy(
      '?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17',
    )
    expect(state).toEqual({
      v: 2,
      title: '',
      names: ['Ada', 'Linus', 'Grace'],
      slots: ['2026-09-20T00:00', '2026-09-27T00:00'],
      groupSize: 2,
    })
  })
})
