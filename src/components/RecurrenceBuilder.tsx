import { useId, useState } from 'react'
import {
  expandRecurrence,
  nextWeekday,
  slotFromInputs,
  type RecurrenceUnit,
} from '../lib/dates'
import { MAX_SLOTS, type Slot } from '../state/schema'
import NumberField from './NumberField'

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

/** Upper bound for the "every [N]" input. */
const MAX_INTERVAL = 52

interface Props {
  /** Appends and de-duplicates — it never silently wipes what is there (PLAN §5). */
  onGenerate: (slots: Slot[]) => void
  onAddSlot: (slot: Slot) => void
  slotCount: number
}

/**
 * Defaults on first load: weekly, the next upcoming Monday, 12 occurrences, no time of day
 * (09:00 once "Include a time of day" is ticked) (§5).
 */
function defaultStartDate(): string {
  const today = Temporal.Now.plainDateISO().toString()
  return nextWeekday(today, 1)
}

export default function RecurrenceBuilder({ onGenerate, onAddSlot, slotCount }: Props) {
  const ids = {
    interval: useId(),
    unit: useId(),
    weekday: useId(),
    time: useId(),
    date: useId(),
    count: useId(),
    manualDate: useId(),
    manualTime: useId(),
    includeTime: useId(),
  }

  // Off by default: most rotations only care which day it is. When off, generated and
  // added slots are date-only ("YYYY-MM-DD") rather than pinned to a time nobody chose.
  const [includeTime, setIncludeTime] = useState(false)

  // Named `every`, not `interval`, so its setter does not shadow window.setInterval.
  const [every, setEvery] = useState(1)
  const [unit, setUnit] = useState<RecurrenceUnit>('week')
  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState('09:00')
  const [date, setDate] = useState(defaultStartDate)
  const [count, setCount] = useState(12)

  const [manualDate, setManualDate] = useState(defaultStartDate)
  const [manualTime, setManualTime] = useState('09:00')

  const start = slotFromInputs(date, includeTime ? time : null)
  const preview = start
    ? expandRecurrence({
        interval: every,
        unit,
        weekday: unit === 'week' ? weekday : null,
        start,
        count,
      })
    : []
  const manualSlot = slotFromInputs(manualDate, includeTime ? manualTime : null)
  const remaining = MAX_SLOTS - slotCount

  return (
    <section aria-labelledby="when-heading">
      <h2 id="when-heading">When</h2>

      <label htmlFor={ids.includeTime} className="include-time">
        <input
          id={ids.includeTime}
          type="checkbox"
          checked={includeTime}
          onChange={(event) => {
            setIncludeTime(event.target.checked)
          }}
        />
        Include a time of day
      </label>

      <div className="sentence">
        <span>every</span>
        <label htmlFor={ids.interval} className="visually-hidden">
          Interval
        </label>
        <NumberField
          id={ids.interval}
          value={every}
          min={1}
          max={MAX_INTERVAL}
          onChange={setEvery}
        />
        <label htmlFor={ids.unit} className="visually-hidden">
          Unit
        </label>
        <select
          id={ids.unit}
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value as RecurrenceUnit)
          }}
        >
          <option value="day">{every === 1 ? 'day' : 'days'}</option>
          <option value="week">{every === 1 ? 'week' : 'weeks'}</option>
          <option value="month">{every === 1 ? 'month' : 'months'}</option>
        </select>

        {unit === 'week' && (
          <>
            <span>on</span>
            <label htmlFor={ids.weekday} className="visually-hidden">
              Weekday
            </label>
            <select
              id={ids.weekday}
              value={weekday}
              onChange={(event) => {
                setWeekday(Number(event.target.value))
              }}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </>
        )}

        {includeTime && (
          <>
            <span>at</span>
            <label htmlFor={ids.time} className="visually-hidden">
              Time of day
            </label>
            <input
              id={ids.time}
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value)
              }}
            />
          </>
        )}

        <span>starting</span>
        <label htmlFor={ids.date} className="visually-hidden">
          Start date
        </label>
        <input
          id={ids.date}
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value)
          }}
        />

        <span>for</span>
        <label htmlFor={ids.count} className="visually-hidden">
          Number of occurrences
        </label>
        <NumberField
          id={ids.count}
          value={count}
          min={1}
          max={MAX_SLOTS}
          onChange={setCount}
        />
        <span>times</span>
      </div>

      <button
        type="button"
        onClick={() => {
          onGenerate(preview)
        }}
        disabled={preview.length === 0 || remaining <= 0}
      >
        Generate
      </button>
      <p className="hint">
        {preview.length === 0
          ? includeTime
            ? 'Pick a valid start date and time.'
            : 'Pick a valid start date.'
          : `Adds ${String(preview.length)} date${preview.length === 1 ? '' : 's'}, starting ${preview[0] ?? ''}. Existing dates are kept.`}
      </p>

      <hr />

      <div className="sentence">
        <label htmlFor={ids.manualDate} className="visually-hidden">
          Single date
        </label>
        <input
          id={ids.manualDate}
          type="date"
          value={manualDate}
          onChange={(event) => {
            setManualDate(event.target.value)
          }}
        />
        {includeTime && (
          <>
            <label htmlFor={ids.manualTime} className="visually-hidden">
              Single time
            </label>
            <input
              id={ids.manualTime}
              type="time"
              value={manualTime}
              onChange={(event) => {
                setManualTime(event.target.value)
              }}
            />
          </>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (manualSlot) onAddSlot(manualSlot)
          }}
          disabled={manualSlot === null || remaining <= 0}
        >
          + Add a date
        </button>
      </div>
    </section>
  )
}
