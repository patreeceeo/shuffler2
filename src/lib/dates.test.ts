import { describe, expect, it } from 'vitest'
import {
  addUnits,
  expandRecurrence,
  formatSlot,
  formatSlotDate,
  formatSlotTime,
  monthKey,
  monthLabel,
  nextWeekday,
  parseSlot,
  todayAt,
  type Recurrence,
} from './dates'

/**
 * PLAN §3.5: "Write the DST test first." These are the tests that were written before
 * dates.ts existed. Recurrence must use *calendar* arithmetic — increment the day/month
 * fields, keep hh:mm fixed. Adding 7*24*60*60*1000 drifts an hour twice a year.
 */
describe('DST: every Monday 9:00 x12 across the boundaries', () => {
  const weekly = (start: string, count: number): Recurrence => ({
    interval: 1,
    unit: 'week',
    weekday: null,
    start,
    count,
  })

  it('keeps 09:00 across US spring-forward (2026-03-08)', () => {
    const slots = expandRecurrence(weekly('2026-02-09T09:00', 12))
    expect(slots).toHaveLength(12)
    expect(slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
    // The boundary week is in range, and the slot on either side of it is still 9am.
    expect(slots).toContain('2026-03-02T09:00')
    expect(slots).toContain('2026-03-09T09:00')
  })

  it('keeps 09:00 across US fall-back (2026-11-01)', () => {
    const slots = expandRecurrence(weekly('2026-10-05T09:00', 12))
    expect(slots).toHaveLength(12)
    expect(slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
    expect(slots).toContain('2026-10-26T09:00')
    expect(slots).toContain('2026-11-02T09:00')
  })

  it('keeps 09:00 across EU DST changes (2026-03-29, 2026-10-25)', () => {
    const spring = expandRecurrence(weekly('2026-03-16T09:00', 4))
    const autumn = expandRecurrence(weekly('2026-10-12T09:00', 4))
    expect([...spring, ...autumn].every((slot) => slot.endsWith('T09:00'))).toBe(true)
    expect(spring).toContain('2026-03-30T09:00')
    expect(autumn).toContain('2026-10-26T09:00')
  })

  it('keeps the time across a Southern-hemisphere change too (2026-04-05, AU)', () => {
    const slots = expandRecurrence(weekly('2026-03-23T09:00', 5))
    expect(slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
  })

  it('keeps an awkward wall-clock time that does not exist on the spring-forward day', () => {
    // 02:30 on 2026-03-08 does not exist in US Eastern. As a *floating* time it is fine,
    // and the whole series must still read 02:30.
    const slots = expandRecurrence(weekly('2026-03-01T02:30', 3))
    expect(slots).toEqual(['2026-03-01T02:30', '2026-03-08T02:30', '2026-03-15T02:30'])
  })

  it('is exactly a calendar week apart, which a ms-based generator would get wrong', () => {
    const slots = expandRecurrence(weekly('2026-03-01T09:00', 3))
    // A naive Date + 7*86400000 generator, run in US Eastern, produces 08:00 here.
    expect(slots[1]).toBe('2026-03-08T09:00')
  })
})

describe('the DST test has teeth (negative control)', () => {
  it('shows a millisecond-based generator actually does drift, in a DST timezone', () => {
    // Guard against a false sense of security: if this ever stops drifting, the machine's
    // timezone has no DST and the comparison above proves less than it looks like it does.
    const tz = 'America/New_York'
    const startInstant =
      Temporal.PlainDateTime.from('2026-03-01T09:00').toZonedDateTime(tz)
    const naive = startInstant.epochMilliseconds + 7 * 24 * 60 * 60 * 1000
    const drifted = Temporal.Instant.fromEpochMilliseconds(naive)
      .toZonedDateTimeISO(tz)
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' })
    // Spring forward: a fixed 7x24h of real time lands an hour *late* on the wall clock.
    expect(drifted).toBe('2026-03-08T10:00')
    // ...while the calendar generator keeps 09:00.
    expect(addUnits('2026-03-01T09:00', 1, 'week')).toBe('2026-03-08T09:00')
  })
})

describe('addUnits: calendar arithmetic', () => {
  it('adds days, weeks and months by calendar field', () => {
    expect(addUnits('2026-01-31T09:00', 1, 'day')).toBe('2026-02-01T09:00')
    expect(addUnits('2026-01-01T09:00', 1, 'week')).toBe('2026-01-08T09:00')
    expect(addUnits('2026-01-15T09:00', 1, 'month')).toBe('2026-02-15T09:00')
  })

  it('clamps a month-end overflow rather than rolling into the next month', () => {
    // Temporal's default overflow is 'constrain': Jan 31 + 1 month is Feb 28/29, not Mar 3.
    expect(addUnits('2026-01-31T09:00', 1, 'month')).toBe('2026-02-28T09:00')
    expect(addUnits('2024-01-31T09:00', 1, 'month')).toBe('2024-02-29T09:00')
    expect(addUnits('2026-03-31T09:00', 1, 'month')).toBe('2026-04-30T09:00')
  })

  it('crosses a year boundary', () => {
    expect(addUnits('2026-12-31T23:59', 1, 'day')).toBe('2027-01-01T23:59')
  })
})

describe('expandRecurrence', () => {
  const base: Recurrence = {
    interval: 1,
    unit: 'week',
    weekday: null,
    start: '2026-09-21T09:00',
    count: 12,
  }

  it('produces exactly `count` slots', () => {
    expect(expandRecurrence(base)).toHaveLength(12)
  })

  it('honours an interval greater than one', () => {
    const slots = expandRecurrence({ ...base, interval: 2, count: 3 })
    expect(slots).toEqual(['2026-09-21T09:00', '2026-10-05T09:00', '2026-10-19T09:00'])
  })

  it('snaps the first slot forward to the chosen weekday', () => {
    // 2026-09-21 is a Monday; asking for Friday moves the series to 2026-09-25.
    const slots = expandRecurrence({ ...base, weekday: 5, count: 2 })
    expect(slots).toEqual(['2026-09-25T09:00', '2026-10-02T09:00'])
  })

  it('leaves the start alone when it already falls on the chosen weekday', () => {
    expect(expandRecurrence({ ...base, weekday: 1, count: 1 })).toEqual([
      '2026-09-21T09:00',
    ])
  })

  it('expands daily and monthly series', () => {
    expect(expandRecurrence({ ...base, unit: 'day', count: 3 })).toEqual([
      '2026-09-21T09:00',
      '2026-09-22T09:00',
      '2026-09-23T09:00',
    ])
    expect(expandRecurrence({ ...base, unit: 'month', count: 3 })).toEqual([
      '2026-09-21T09:00',
      '2026-10-21T09:00',
      '2026-11-21T09:00',
    ])
  })

  it('returns nothing rather than throwing for a nonsense recurrence', () => {
    expect(expandRecurrence({ ...base, count: 0 })).toEqual([])
    expect(expandRecurrence({ ...base, count: -5 })).toEqual([])
    expect(expandRecurrence({ ...base, interval: 0 })).toEqual([])
    expect(expandRecurrence({ ...base, start: 'not a date' })).toEqual([])
    expect(expandRecurrence({ ...base, start: '2026-02-30T09:00' })).toEqual([])
  })

  it('caps a runaway count at MAX_SLOTS', () => {
    expect(expandRecurrence({ ...base, count: 99999 }).length).toBeLessThanOrEqual(500)
  })
})

describe('formatting never goes through UTC (the exact bug v1 shipped)', () => {
  it('formats the local calendar fields it was given', () => {
    // A slot just after midnight is the most sensitive case: toISOString() would render
    // the previous day for anyone west of Greenwich.
    expect(formatSlotDate('2026-09-21T00:30')).toContain('21')
    expect(formatSlotDate('2026-01-01T00:00')).toContain('2026')
    expect(formatSlotTime('2026-09-21T00:30')).toMatch(/12:30|00:30/)
  })

  it('formats a full slot with weekday, date and time', () => {
    const text = formatSlot('2026-09-21T09:00')
    expect(text).toMatch(/Mon/)
    expect(text).toMatch(/Sep/)
  })

  it('returns the raw string rather than throwing for an unparseable slot', () => {
    expect(formatSlot('garbage')).toBe('garbage')
    expect(formatSlotDate('garbage')).toBe('garbage')
    expect(formatSlotTime('garbage')).toBe('garbage')
  })
})

describe('month grouping', () => {
  it('keys by year and month', () => {
    expect(monthKey('2026-09-21T09:00')).toBe('2026-09')
    expect(monthKey('2026-12-01T00:00')).toBe('2026-12')
  })

  it('labels a month readably', () => {
    expect(monthLabel('2026-09')).toMatch(/September|Sep/)
    expect(monthLabel('2026-09')).toContain('2026')
  })
})

describe('parseSlot', () => {
  it('round-trips a valid slot', () => {
    expect(parseSlot('2026-09-21T09:00')?.toString()).toBe('2026-09-21T09:00:00')
  })

  it('returns null rather than throwing for junk', () => {
    expect(parseSlot('')).toBeNull()
    expect(parseSlot('2026-02-30T09:00')).toBeNull()
    expect(parseSlot('nope')).toBeNull()
  })
})

describe('defaults for the builder', () => {
  it('nextWeekday finds the coming Monday, and keeps today if today is Monday', () => {
    // 2026-09-17 is a Thursday.
    expect(nextWeekday('2026-09-17', 1)).toBe('2026-09-21')
    expect(nextWeekday('2026-09-21', 1)).toBe('2026-09-21')
  })

  it('todayAt builds a slot from local fields', () => {
    expect(todayAt('2026-09-21', '09:00')).toBe('2026-09-21T09:00')
    expect(todayAt('2026-09-21', '9:5')).toBe('2026-09-21T09:05')
    expect(todayAt('nope', '09:00')).toBeNull()
  })
})
