import { describe, expect, it } from 'vitest'
import { shuffle, shuffleOnce } from './shuffle'

describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    for (let i = 0; i < 200; i++) {
      expect([...shuffle(items)].sort()).toEqual([...items].sort())
    }
  })

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c']
    shuffle(items)
    expect(items).toEqual(['a', 'b', 'c'])
  })

  it('never returns the identical order for a shufflable list (§4.2)', () => {
    const items = ['a', 'b', 'c', 'd']
    for (let i = 0; i < 300; i++) {
      expect(shuffle(items).join('')).not.toBe(items.join(''))
    }
  })

  it('handles lists too small to shuffle', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })

  it('terminates on a list whose every permutation equals the original', () => {
    // ["a","a"] can never differ from itself; the attempt cap is what stops the loop.
    expect(shuffle(['a', 'a'])).toEqual(['a', 'a'])
    expect(shuffle(['x', 'x', 'x'])).toEqual(['x', 'x', 'x'])
  })

  it('is roughly uniform over many runs (§8)', () => {
    const items = ['a', 'b', 'c']
    const counts = new Map<string, number>()
    const runs = 60_000
    for (let i = 0; i < runs; i++) {
      const key = shuffleOnce(items).join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    const expected = runs / 6
    for (const count of counts.values()) {
      // Generous band: this catches a biased generator, not statistical noise.
      expect(count).toBeGreaterThan(expected * 0.85)
      expect(count).toBeLessThan(expected * 1.15)
    }
  })

  it('places each element in each position roughly equally often', () => {
    const items = ['a', 'b', 'c', 'd']
    const runs = 20_000
    const positions = new Map<string, number[]>(items.map((item) => [item, [0, 0, 0, 0]]))
    for (let i = 0; i < runs; i++) {
      shuffleOnce(items).forEach((item, index) => {
        positions.get(item)![index]! += 1
      })
    }
    const expected = runs / 4
    for (const slots of positions.values()) {
      for (const count of slots) {
        expect(count).toBeGreaterThan(expected * 0.85)
        expect(count).toBeLessThan(expected * 1.15)
      }
    }
  })
})
