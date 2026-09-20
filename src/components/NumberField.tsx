import { useState } from 'react'

interface Props {
  id: string
  value: number
  min: number
  max: number
  step?: number
  className?: string
  onChange: (value: number) => void
}

/**
 * A whole-number input that can actually be typed into.
 *
 * Clamping on every keystroke makes a field impossible to edit: deleting the last digit
 * leaves '', which clamps straight back to `min` and re-renders under the cursor. On iOS
 * that reads as "the first digit cannot be deleted, and typing replaces it with a 1".
 *
 * So the typed text is held as text. It is reported to the caller only while it is a whole
 * number inside [min, max] — an empty or out-of-range field simply leaves the last good
 * value in place — and it is clamped once, on blur, when the field is no longer being
 * edited.
 */
export default function NumberField({
  id,
  value,
  min,
  max,
  step = 1,
  className,
  onChange,
}: Props) {
  /**
   * What is being typed, or null when the field is not mid-edit. While it is a string,
   * it wins over `value`, so nothing re-renders under the cursor; clearing it on blur
   * hands display back to `value`, which by then has been clamped.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? String(value)

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      className={className}
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        const parsed = Number(next)
        if (
          next.trim() !== '' &&
          Number.isInteger(parsed) &&
          parsed >= min &&
          parsed <= max
        ) {
          onChange(parsed)
        }
      }}
      onBlur={() => {
        const settled = clampToRange(text, value, min, max)
        setDraft(null)
        if (settled !== value) onChange(settled)
      }}
    />
  )
}

/** The typed text as a whole number in [min, max]; `fallback` if it is not a number. */
function clampToRange(text: string, fallback: number, min: number, max: number): number {
  const parsed = Number(text.trim())
  if (text.trim() === '' || !Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
