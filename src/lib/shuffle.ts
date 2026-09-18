/**
 * Fisher-Yates over crypto.getRandomValues (PLAN §4.2).
 *
 * No seed is stored — the shuffled order *is* the state, so the link reproduces it
 * exactly. That is the whole reason v2 drops v1's permutation index (§1).
 */

/** Uniform integer in [0, max) with rejection sampling — `% max` alone is biased. */
function randomBelow(max: number): number {
  if (max <= 1) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    const value = buffer[0]!
    if (value < limit) return value % max
  }
}

export function shuffleOnce<T>(items: readonly T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1)
    const a = next[i]!
    const b = next[j]!
    next[i] = b
    next[j] = a
  }
  return next
}

/**
 * Rejects a permutation identical to the current one when there is more than one name:
 * a shuffle that visibly does nothing reads as a broken button (§4.2).
 *
 * Gives up after a bounded number of tries so a list of identical names (["a","a"], whose
 * every permutation *is* the original) cannot spin forever.
 */
export function shuffle<T>(items: readonly T[], maxAttempts = 12): T[] {
  if (items.length < 2) return [...items]
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = shuffleOnce(items)
    if (!sameOrder(items, candidate)) return candidate
  }
  return shuffleOnce(items)
}

function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}
