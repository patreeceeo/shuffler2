import { MAX_NAMES, normalizeSlots, validate, type RotationState } from './schema'

/**
 * Reading v1 links (PLAN §3.3).
 *
 * v1's state was in the query string:
 *   ?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17
 *
 * v2 opens any URL v1 could produce, which matters most if v2 ever replaces v1 at
 * zzt64.com/shuffler/ — every link ever shared then lands here (§9.3).
 */

/** v1 hardcoded group-size to 2 (the control existed but was `disabled`). */
export const LEGACY_GROUP_SIZE = 2

/**
 * 19! exceeds Number.MAX_SAFE_INTEGER, and v1's float division loses precision before
 * that, so v1's own permutation index was only ever meaningful up to 18 items.
 */
export const LEGACY_MAX_ITEMS = 18

/**
 * v1's Lehmer-style index -> permutation, ported verbatim in behaviour.
 *
 * `n` is a single integer in [0, items.length!) that encodes one permutation: repeatedly
 * take `n % remaining` as the index of the next item, then divide `n` down. This is the
 * v1 idea that made its URLs tiny; v2 drops it (§1) because it cannot represent a manual
 * reorder and breaks at 19 items — but the decode has to stay exact or old links shuffle
 * differently than they did.
 */
export function integerToPermutation<T>(n: number, items: readonly T[]): T[] {
  const pool = [...items]
  const out: T[] = []
  let remaining = Math.max(0, Math.floor(n))
  // v1 clamped an out-of-range randomizer into range rather than erroring.
  const total = factorial(pool.length)
  if (total > 0) remaining %= total
  while (pool.length > 0) {
    const index = remaining % pool.length
    remaining = Math.floor(remaining / pool.length)
    out.push(pool.splice(index, 1)[0]!)
  }
  return out
}

function factorial(n: number): number {
  let acc = 1
  for (let i = 2; i <= n; i++) acc *= i
  return acc
}

/**
 * v1's slot rule: start of the week *after* `rotationStart`, Sunday-based, then weekly,
 * `ceil(items.length / 2)` occurrences, at 00:00.
 *
 * Calendar arithmetic, not millisecond addition (§3.5) — v1 used
 * `setDate(getDate() + n*7)`, which was the one thing it got right about dates.
 */
export function legacySlots(rotationStart: string, occurrences: number): string[] {
  const parsed = parseISODate(rotationStart)
  if (!parsed) return []
  let cursor = Temporal.PlainDate.from(parsed)
  // Sunday-based "week after": Temporal's dayOfWeek is 1=Mon..7=Sun.
  const daysToSunday = 7 - (cursor.dayOfWeek % 7)
  cursor = cursor.add({ days: daysToSunday })
  const slots: string[] = []
  for (let i = 0; i < occurrences; i++) {
    slots.push(`${cursor.toString()}T00:00`)
    cursor = cursor.add({ weeks: 1 })
  }
  return slots
}

function parseISODate(text: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  try {
    // Rejects 2026-02-31 etc.
    Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' })
  } catch {
    return null
  }
  return { year, month, day }
}

/**
 * v1 query string -> RotationState. Never throws; returns null when there is nothing
 * recognisably v1 in the search params.
 */
export function decodeLegacy(search: string): RotationState | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  } catch {
    return null
  }
  const items = params.getAll('items').filter((item) => item.length > 0)
  if (items.length === 0) return null

  const capped = items.slice(0, MAX_NAMES)
  const randomizer = Number(params.get('randomizer') ?? 0)
  const seed = Number.isFinite(randomizer) ? randomizer : 0

  // Above 18 items v1's own index was already meaningless, so keep the given order
  // rather than invent a different wrong one.
  const names =
    capped.length <= LEGACY_MAX_ITEMS ? integerToPermutation(seed, capped) : [...capped]

  const rotationStart = params.get('rotationStart') ?? ''
  const occurrences = Math.ceil(capped.length / LEGACY_GROUP_SIZE)
  const slots = normalizeSlots(legacySlots(rotationStart, occurrences))

  return validate({
    v: 2,
    title: '',
    names,
    slots,
    groupSize: LEGACY_GROUP_SIZE,
  })
}
