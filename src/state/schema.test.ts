import { describe, expect, it } from 'vitest'
import { EMPTY_STATE, daysInMonth, demoState, normalizeSlots, validate } from './schema'

describe('validate', () => {
  it('accepts the empty and demo states', () => {
    expect(validate(EMPTY_STATE)).toEqual(EMPTY_STATE)
    expect(validate(demoState())).toEqual(demoState())
  })

  it('rejects malformed slot strings', () => {
    const base = { v: 2, title: '', names: [], groupSize: 1 }
    for (const slot of [
      '2026-09-21',
      '2026-09-21T09:00:00',
      '2026-09-21 09:00',
      '2026-13-01T09:00',
      '2026-02-30T09:00',
      '2025-02-29T09:00',
      '2026-09-21T24:00',
      '2026-09-21T09:60',
      '',
      'nope',
    ]) {
      expect(validate({ ...base, slots: [slot] })).toBeNull()
    }
  })

  it('accepts leap days in leap years', () => {
    const base = { v: 2, title: '', names: [], groupSize: 1 }
    expect(validate({ ...base, slots: ['2024-02-29T09:00'] })).not.toBeNull()
    expect(validate({ ...base, slots: ['2000-02-29T09:00'] })).not.toBeNull()
    expect(validate({ ...base, slots: ['1900-02-29T09:00'] })).toBeNull()
  })

  it('rejects wrong shapes without throwing', () => {
    for (const bad of [null, undefined, 1, 'x', [], {}, { v: 3 }]) {
      expect(validate(bad)).toBeNull()
    }
  })

  it('enforces the caps that stop a hostile link hanging the render', () => {
    const names = Array.from({ length: 201 }, () => 'n')
    expect(validate({ v: 2, title: '', names, slots: [], groupSize: 1 })).toBeNull()
    const slots = Array.from(
      { length: 501 },
      (_, i) => `2026-01-01T00:${String(i % 60).padStart(2, '0')}`,
    )
    expect(validate({ v: 2, title: '', names: [], slots, groupSize: 1 })).toBeNull()
  })
})

describe('daysInMonth', () => {
  it('knows the Gregorian leap rule', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2025, 2)).toBe(28)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('normalizeSlots', () => {
  it('sorts, de-duplicates and caps', () => {
    expect(
      normalizeSlots(['2026-02-01T09:00', '2026-01-01T09:00', '2026-01-01T09:00']),
    ).toEqual(['2026-01-01T09:00', '2026-02-01T09:00'])
    expect(
      normalizeSlots(
        Array.from(
          { length: 900 },
          (_, i) => `2026-01-01T00:${String(i % 60).padStart(2, '0')}`,
        ),
      ).length,
    ).toBeLessThanOrEqual(500)
  })
})
