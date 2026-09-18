import type { RotationState, Slot } from '../state/schema'

/**
 * The schedule is a *derived* value, never stored (PLAN §2).
 *
 * Positional round-robin: with `g = groupSize`, slot `i` gets
 * `names[(i * g + j) % names.length]` for `j` in [0, g). The name list *is* the rotation
 * order, which keeps the mental model obvious and the URL small.
 */

export interface Assignment {
  slot: Slot
  index: number
  names: string[]
}

export interface Tally {
  name: string
  count: number
}

export interface Schedule {
  assignments: Assignment[]
  tallies: Tally[]
  /**
   * Round-robin is even only when (slots * groupSize) % names === 0. Surface the
   * imbalance rather than hide it (§5) — "is this actually even?" is the first question
   * anyone asks a rotation tool.
   */
  even: boolean
  /** True when there is nothing to assign; the caller renders guidance, not NaN. */
  empty: boolean
}

export function derive(state: RotationState): Schedule {
  const names = state.names
  const slots = state.slots
  const groupSize = Math.max(1, Math.floor(state.groupSize))

  // `i % 0` must be unreachable (§7). Zero names or zero slots is guidance, not NaN.
  if (names.length === 0 || slots.length === 0) {
    return { assignments: [], tallies: [], even: true, empty: true }
  }

  const counts = new Map<string, number>()
  const assignments: Assignment[] = slots.map((slot, index) => {
    const assigned: string[] = []
    for (let j = 0; j < groupSize; j++) {
      const name = names[(index * groupSize + j) % names.length]!
      assigned.push(name)
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return { slot, index, names: assigned }
  })

  // Tally in name-list order, so the footer reads in the same order as the panel above it.
  // Duplicate names are allowed and share one tally row — they really are one person.
  const seen = new Set<string>()
  const tallies: Tally[] = []
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    tallies.push({ name, count: counts.get(name) ?? 0 })
  }

  const even = (slots.length * groupSize) % names.length === 0

  return { assignments, tallies, even, empty: false }
}

/** "Copy as text table" — the readable escape hatch a long link needs (§3.6). */
export function toTextTable(
  state: RotationState,
  schedule: Schedule,
  formatSlot: (slot: Slot) => string,
): string {
  const lines: string[] = []
  if (state.title.length > 0) lines.push(state.title, '')
  if (schedule.empty) {
    lines.push('(no dates or no names yet)')
    return lines.join('\n')
  }
  const left = schedule.assignments.map((a) => formatSlot(a.slot))
  const width = Math.max(...left.map((text) => text.length))
  schedule.assignments.forEach((assignment, i) => {
    lines.push(`${left[i]!.padEnd(width)}  ${assignment.names.join(', ')}`)
  })
  lines.push('')
  lines.push(schedule.tallies.map((t) => `${t.name} ${String(t.count)}`).join(' · '))
  lines.push(`made with Shuffler2: ${location.href}`)
  return lines.join('\n')
}
