import { MAX_NAME, MAX_NAMES } from '../state/schema'

/**
 * Multi-line paste splits into rows (PLAN §5) — v1 users are used to pasting a block, and
 * the textarea was the fastest name entry there is. Splits on newlines; a pasted CSV-ish
 * line with no newlines is left alone, because "Smith, John" is one person.
 */
export function splitPastedNames(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, MAX_NAME))
}

/** Duplicates are allowed — someone may genuinely take two slots per cycle (§5). */
export function insertNames(
  names: readonly string[],
  at: number,
  incoming: readonly string[],
): string[] {
  const index = Math.max(0, Math.min(at, names.length))
  const next = [...names.slice(0, index), ...incoming, ...names.slice(index)]
  return next.slice(0, MAX_NAMES)
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
