import { useAutoAnimate } from '@formkit/auto-animate/react'
import { formatSlot, slotDate, slotTime, todayAt } from '../lib/dates'
import type { Slot } from '../state/schema'

interface Props {
  slots: Slot[]
  onSlotsChange: (slots: Slot[], discrete?: boolean) => void
}

export default function SlotList({ slots, onSlotsChange }: Props) {
  const [listRef] = useAutoAnimate<HTMLUListElement>()

  const replace = (index: number, next: Slot) => {
    const copy = [...slots]
    copy[index] = next
    onSlotsChange(copy)
  }

  return (
    <div className="slot-list-wrap">
      <div className="slot-list-head">
        <h3>
          {slots.length} date{slots.length === 1 ? '' : 's'}
        </h3>
        {slots.length > 0 && (
          <button
            type="button"
            className="secondary outline"
            onClick={() => {
              onSlotsChange([], true)
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="hint">
          No dates yet. Generate a series above, or add a single date.
        </p>
      ) : (
        <ul className="slot-list" ref={listRef}>
          {slots.map((slot, index) => (
            <li key={`${slot}-${String(index)}`} className="slot-row">
              <input
                type="date"
                value={slotDate(slot)}
                aria-label={`Date for ${formatSlot(slot)}`}
                onChange={(event) => {
                  const next = todayAt(event.target.value, slotTime(slot))
                  if (next) replace(index, next)
                }}
              />
              <input
                type="time"
                value={slotTime(slot)}
                aria-label={`Time for ${formatSlot(slot)}`}
                onChange={(event) => {
                  const next = todayAt(slotDate(slot), event.target.value)
                  if (next) replace(index, next)
                }}
              />
              <button
                type="button"
                className="secondary row-delete"
                aria-label={`Delete ${formatSlot(slot)}`}
                onClick={() => {
                  onSlotsChange(slots.filter((_, i) => i !== index))
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
