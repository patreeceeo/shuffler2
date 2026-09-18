import * as v from 'valibot'

/**
 * A slot is a *floating* local wall-clock date-time: "YYYY-MM-DDTHH:mm", no zone, no UTC
 * conversion (PLAN §3.5). "Every Monday at 9am" reads as 9am to everyone who opens the
 * link. Right for a household chore chart, wrong for a cross-timezone on-call roster.
 */
export type Slot = string

export interface RotationState {
  v: 2
  title: string
  names: string[]
  /** Kept sorted ascending at all times. */
  slots: Slot[]
  /** Names per slot, >= 1. */
  groupSize: number
}

/** A hostile link must not be able to hang the render (PLAN §3.4). */
export const MAX_NAMES = 200
export const MAX_SLOTS = 500
export const MAX_TITLE = 200
export const MAX_NAME = 100
export const MAX_GROUP_SIZE = 20

/** "YYYY-MM-DDTHH:mm" — exactly minute precision, nothing else. */
export const SLOT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const SlotSchema = v.pipe(
  v.string(),
  v.regex(SLOT_RE, 'slot must be YYYY-MM-DDTHH:mm'),
  v.check(isRealCalendarSlot, 'slot must be a real calendar date-time'),
)

export const RotationStateSchema = v.object({
  v: v.literal(2),
  title: v.pipe(v.string(), v.maxLength(MAX_TITLE)),
  names: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(MAX_NAME))),
    v.maxLength(MAX_NAMES),
  ),
  slots: v.pipe(v.array(SlotSchema), v.maxLength(MAX_SLOTS)),
  groupSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_GROUP_SIZE)),
})

/**
 * Rejects "2026-02-31T09:00" and friends. Done by hand rather than by `new Date(...)`
 * because Date parsing of that string is implementation-defined and, worse, would drag a
 * timezone into a type that deliberately has none (§3.5).
 */
function isRealCalendarSlot(s: string): boolean {
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  const day = Number(s.slice(8, 10))
  const hour = Number(s.slice(11, 13))
  const minute = Number(s.slice(14, 16))
  if (month < 1 || month > 12) return false
  if (hour > 23 || minute > 59) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export const EMPTY_STATE: RotationState = Object.freeze({
  v: 2,
  title: '',
  names: [],
  slots: [],
  groupSize: 1,
})

/** Never throws. Returns null for anything that is not a valid RotationState. */
export function validate(value: unknown): RotationState | null {
  const result = v.safeParse(RotationStateSchema, value)
  return result.success ? result.output : null
}

/** Slots are kept sorted ascending; lexicographic order == chronological for this format. */
export function sortSlots(slots: readonly Slot[]): Slot[] {
  return [...slots].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Sorted, de-duplicated, capped. Used by every path that writes slots. */
export function normalizeSlots(slots: readonly Slot[]): Slot[] {
  return [...new Set(slots)]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_SLOTS)
}
