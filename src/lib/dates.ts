import { MAX_SLOTS, SLOT_RE, type Slot } from '../state/schema'

/**
 * Calendar arithmetic, recurrence expansion, formatting.
 *
 * ## Two rules this file exists to enforce
 *
 * 1. **Never add milliseconds.** Recurrence increments calendar fields
 *    (`Temporal.PlainDateTime.add({ weeks: 1 })`), so "every Monday at 9:00" is 9:00 on
 *    every Monday including the two a year when a timezone shifts under it. Adding
 *    `7 * 24 * 60 * 60 * 1000` to a timestamp drifts an hour twice a year (PLAN §3.5).
 *
 * 2. **Never call `toISOString()`.** It converts to UTC, so west of Greenwich a 00:30 slot
 *    renders as the previous day. That is the exact bug v1 shipped (§1). Every formatter
 *    here reads local calendar fields. ESLint blocks the method outright.
 *
 * Slots are floating local wall-clock: "YYYY-MM-DDTHH:mm", no zone (§3.5).
 */

export type RecurrenceUnit = 'day' | 'week' | 'month'

export interface Recurrence {
  interval: number
  unit: RecurrenceUnit
  /** ISO weekday 1=Mon..7=Sun, or null for "whatever day the start date is". */
  weekday: number | null
  /** A full slot string: the series start date *and* its time of day. */
  start: Slot
  count: number
}

/** Never throws. Returns null for anything that is not a real calendar slot. */
export function parseSlot(slot: string): Temporal.PlainDateTime | null {
  if (!SLOT_RE.test(slot)) return null
  try {
    return Temporal.PlainDateTime.from(slot, { overflow: 'reject' })
  } catch {
    return null
  }
}

export function toSlot(value: Temporal.PlainDateTime): Slot {
  return value.toString({ smallestUnit: 'minute' })
}

/**
 * Calendar addition. Month overflow uses Temporal's default 'constrain', so Jan 31 + 1
 * month is Feb 28 (or 29) rather than rolling forward into March.
 */
export function addUnits(slot: Slot, amount: number, unit: RecurrenceUnit): Slot {
  const parsed = parseSlot(slot)
  if (!parsed) return slot
  const duration =
    unit === 'day'
      ? { days: amount }
      : unit === 'week'
        ? { weeks: amount }
        : { months: amount }
  return toSlot(parsed.add(duration))
}

/** The first date on or after `date` (a "YYYY-MM-DD" string) that falls on `weekday`. */
export function nextWeekday(date: string, weekday: number): string {
  try {
    const day = Temporal.PlainDate.from(date, { overflow: 'reject' })
    const delta = (weekday - day.dayOfWeek + 7) % 7
    return day.add({ days: delta }).toString()
  } catch {
    return date
  }
}

/** Builds a slot from a date input value and a time input value. Never throws. */
export function todayAt(date: string, time: string): Slot | null {
  const timeMatch = /^(\d{1,2}):(\d{1,2})$/.exec(time)
  if (!timeMatch) return null
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (hour > 23 || minute > 59) return null
  try {
    const day = Temporal.PlainDate.from(date, { overflow: 'reject' })
    return toSlot(day.toPlainDateTime({ hour, minute }))
  } catch {
    return null
  }
}

/**
 * Expands a recurrence into slots. Pure, total, and never throws: a nonsense recurrence
 * returns [] rather than an exception or a runaway loop.
 */
export function expandRecurrence(recurrence: Recurrence): Slot[] {
  const { interval, unit, weekday, start, count } = recurrence
  if (!Number.isInteger(interval) || interval < 1) return []
  if (!Number.isInteger(count) || count < 1) return []

  const parsed = parseSlot(start)
  if (!parsed) return []

  let cursor = parsed
  if (weekday !== null && unit === 'week') {
    // Snap forward to the requested weekday, never backward: a generator that moves the
    // series earlier than the date the user typed reads as a bug.
    const delta = (weekday - cursor.dayOfWeek + 7) % 7
    cursor = cursor.add({ days: delta })
  }

  const total = Math.min(count, MAX_SLOTS)
  const slots: Slot[] = []
  for (let i = 0; i < total; i++) {
    slots.push(toSlot(cursor))
    // Calendar addition, every iteration. This is the DST-correct line.
    cursor = cursor.add(
      unit === 'day'
        ? { days: interval }
        : unit === 'week'
          ? { weeks: interval }
          : { months: interval },
    )
  }
  return slots
}

/* ------------------------------------------------------------------------ *
 * Formatting. Local fields only; no Date, no toISOString, no UTC anywhere.  *
 * ------------------------------------------------------------------------ */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
}

const DATE_WITH_YEAR_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
}

const MONTH_OPTS: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
}

/**
 * Formats via Temporal's own toLocaleString, which takes the plain calendar fields
 * straight to Intl. No instant, no offset, so no day-early bug.
 */
export function formatSlotDate(slot: Slot): string {
  const parsed = parseSlot(slot)
  if (!parsed) return slot
  return parsed.toPlainDate().toLocaleString(undefined, DATE_WITH_YEAR_OPTS)
}

export function formatSlotTime(slot: Slot): string {
  const parsed = parseSlot(slot)
  if (!parsed) return slot
  return parsed.toPlainTime().toLocaleString(undefined, TIME_OPTS)
}

export function formatSlot(slot: Slot): string {
  const parsed = parseSlot(slot)
  if (!parsed) return slot
  const date = parsed.toPlainDate().toLocaleString(undefined, DATE_OPTS)
  return `${date}, ${formatSlotTime(slot)}`
}

/** "2026-09" — the grouping key for the schedule's month headings. */
export function monthKey(slot: Slot): string {
  return slot.slice(0, 7)
}

export function monthLabel(key: string): string {
  try {
    const month = Temporal.PlainYearMonth.from(key, { overflow: 'reject' })
    return month.toPlainDate({ day: 1 }).toLocaleString(undefined, MONTH_OPTS)
  } catch {
    return key
  }
}

/** The date part of a slot, for a <input type="date"> value. */
export function slotDate(slot: Slot): string {
  return slot.slice(0, 10)
}

/** The time part of a slot, for a <input type="time"> value. */
export function slotTime(slot: Slot): string {
  return slot.slice(11, 16)
}
