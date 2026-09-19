import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { derive, toTextTable } from './schedule'
import type { RotationState } from '../state/schema'

function state(partial: Partial<RotationState>): RotationState {
  return {
    v: 2,
    title: '',
    names: ['Ada', 'Grace', 'Linus'],
    slots: ['2026-09-21T09:00', '2026-09-28T09:00', '2026-10-05T09:00'],
    groupSize: 1,
    ...partial,
  }
}

describe('derive: positional round-robin', () => {
  it('assigns names in order, wrapping around', () => {
    const schedule = derive(
      state({
        slots: [
          '2026-01-01T09:00',
          '2026-01-02T09:00',
          '2026-01-03T09:00',
          '2026-01-04T09:00',
        ],
      }),
    )
    expect(schedule.assignments.map((a) => a.names)).toEqual([
      ['Ada'],
      ['Grace'],
      ['Linus'],
      ['Ada'],
    ])
  })

  it('puts groupSize names in each slot, continuing the rotation across slots', () => {
    const schedule = derive(
      state({
        names: ['Ada', 'Grace', 'Linus', 'Barbara'],
        slots: ['2026-01-01T09:00', '2026-01-02T09:00'],
        groupSize: 2,
      }),
    )
    expect(schedule.assignments.map((a) => a.names)).toEqual([
      ['Ada', 'Grace'],
      ['Linus', 'Barbara'],
    ])
  })

  it('repeats a name within one slot when there are fewer names than groupSize', () => {
    const schedule = derive(
      state({ names: ['Solo'], slots: ['2026-01-01T09:00'], groupSize: 3 }),
    )
    expect(schedule.assignments[0]?.names).toEqual(['Solo', 'Solo', 'Solo'])
  })
})

describe('derive: the zero cases (i % 0 must be unreachable, PLAN §7)', () => {
  it('returns an empty schedule for zero names', () => {
    const schedule = derive(state({ names: [] }))
    expect(schedule.empty).toBe(true)
    expect(schedule.assignments).toEqual([])
    expect(schedule.tallies).toEqual([])
  })

  it('returns an empty schedule for zero slots', () => {
    const schedule = derive(state({ slots: [] }))
    expect(schedule.empty).toBe(true)
  })

  it('returns an empty schedule for both', () => {
    expect(derive(state({ names: [], slots: [] })).empty).toBe(true)
  })

  it('never produces NaN or undefined for any small combination', () => {
    for (let n = 0; n <= 4; n++) {
      for (let s = 0; s <= 4; s++) {
        for (let g = 1; g <= 3; g++) {
          const schedule = derive(
            state({
              names: Array.from({ length: n }, (_, i) => `n${String(i)}`),
              slots: Array.from(
                { length: s },
                (_, i) => `2026-01-0${String(i + 1)}T09:00`,
              ),
              groupSize: g,
            }),
          )
          for (const assignment of schedule.assignments) {
            expect(assignment.names.every((name) => typeof name === 'string')).toBe(true)
            expect(assignment.names).toHaveLength(g)
          }
          for (const tally of schedule.tallies) {
            expect(Number.isFinite(tally.count)).toBe(true)
          }
        }
      }
    }
  })
})

describe('derive: tallies and fairness', () => {
  it('counts every assignment', () => {
    const schedule = derive(state({}))
    expect(schedule.tallies).toEqual([
      { name: 'Ada', count: 1 },
      { name: 'Grace', count: 1 },
      { name: 'Linus', count: 1 },
    ])
  })

  it('reports an even split as even', () => {
    expect(derive(state({})).even).toBe(true)
  })

  it('surfaces an uneven split rather than hiding it', () => {
    const schedule = derive(state({ slots: ['2026-01-01T09:00', '2026-01-02T09:00'] }))
    expect(schedule.even).toBe(false)
    expect(schedule.tallies.map((t) => t.count)).toEqual([1, 1, 0])
  })

  it('collapses a duplicated name into one tally row', () => {
    const schedule = derive(
      state({
        names: ['Ada', 'Ada', 'Grace'],
        slots: ['2026-01-01T09:00', '2026-01-02T09:00', '2026-01-03T09:00'],
      }),
    )
    expect(schedule.tallies).toEqual([
      { name: 'Ada', count: 2 },
      { name: 'Grace', count: 1 },
    ])
  })

  it('tallies in name-list order, matching the panel above it', () => {
    const schedule = derive(state({ names: ['Zoe', 'Ada'] }))
    expect(schedule.tallies.map((t) => t.name)).toEqual(['Zoe', 'Ada'])
  })
})

describe('property: derive is total', () => {
  it('never throws and always fills every slot', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 12 }), { maxLength: 12 }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 5 }),
        (names, slotCount, groupSize) => {
          const slots = Array.from(
            { length: slotCount },
            (_, i) => `2026-01-01T${String(i % 24).padStart(2, '0')}:00`,
          )
          const schedule = derive(state({ names, slots, groupSize }))
          if (names.length === 0 || slots.length === 0) {
            expect(schedule.empty).toBe(true)
            return
          }
          expect(schedule.assignments).toHaveLength(slots.length)
          const total = schedule.tallies.reduce((sum, t) => sum + t.count, 0)
          expect(total).toBe(slots.length * groupSize)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('toTextTable', () => {
  it('renders a readable fallback for a long link', () => {
    const s = state({ title: 'Dish duty' })
    const text = toTextTable(s, derive(s), (slot) => slot)
    expect(text).toContain('Dish duty')
    expect(text).toContain('2026-09-21T09:00  Ada')
    // Tallies were deliberately removed from the text table (928fdcf); the schedule
    // panel still shows them, the pasteable table does not.
    expect(text).not.toMatch(/Ada 1/)
  })

  it('says so rather than crashing when there is nothing to show', () => {
    const s = state({ names: [], slots: [] })
    expect(toTextTable(s, derive(s), (slot) => slot)).toContain('no dates or no names')
  })

  it('carries the rotation link when it is given one', () => {
    const s = state({ title: 'Dish duty' })
    const url = 'https://zzt64.com/shuffler2/#s=BLOB'
    expect(toTextTable(s, derive(s), (slot) => slot, url)).toContain(
      `made with Shuffler2: ${url}`,
    )
  })

  it('omits the link line rather than printing a bare label', () => {
    // Called with no url at all, and called before the first encode produces one.
    const s = state({ title: 'Dish duty' })
    expect(toTextTable(s, derive(s), (slot) => slot)).not.toContain('made with')
    expect(toTextTable(s, derive(s), (slot) => slot, '')).not.toContain('made with')
  })
})
