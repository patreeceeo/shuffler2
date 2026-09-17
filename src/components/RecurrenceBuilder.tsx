import { useId, useState } from 'react'
import { expandRecurrence, nextWeekday, todayAt, type RecurrenceUnit } from '../lib/dates'
import { MAX_SLOTS, type Slot } from '../state/schema'

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

interface Props {
  /** Appends and de-duplicates — it never silently wipes what is there (PLAN §5). */
  onGenerate: (slots: Slot[]) => void
  onAddSlot: (slot: Slot) => void
  slotCount: number
}

/** Defaults on first load: weekly, the next upcoming Monday, 09:00, 12 occurrences (§5). */
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
  }

  const [interval, setInterval] = useState(1)
  const [unit, setUnit] = useState<RecurrenceUnit>('week')
  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState('09:00')
  const [date, setDate] = useState(defaultStartDate)
  const [count, setCount] = useState(12)

  const [manualDate, setManualDate] = useState(defaultStartDate)
  const [manualTime, setManualTime] = useState('09:00')

  const start = todayAt(date, time)
  const preview = start
    ? expandRecurrence({
        interval,
        unit,
        weekday: unit === 'week' ? weekday : null,
        start,
        count,
      })
    : []
  const remaining = MAX_SLOTS - slotCount

  return (
    <section aria-labelledby="when-heading">
      <h2 id="when-heading">When</h2>

      <div className="sentence">
        <span>every</span>
        <label htmlFor={ids.interval} className="visually-hidden">
          Interval
        </label>
        <input
          id={ids.interval}
          type="number"
          min={1}
          max={52}
          value={interval}
          onChange={(event) => {
            setInterval(clamp(event.target.value, 1, 52, 1))
          }}
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
          <option value="day">{interval === 1 ? 'day' : 'days'}</option>
          <option value="week">{interval === 1 ? 'week' : 'weeks'}</option>
          <option value="month">{interval === 1 ? 'month' : 'months'}</option>
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
        <input
          id={ids.count}
          type="number"
          min={1}
          max={MAX_SLOTS}
          value={count}
          onChange={(event) => {
            setCount(clamp(event.target.value, 1, MAX_SLOTS, 12))
          }}
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
          ? 'Pick a valid start date and time.'
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
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const slot = todayAt(manualDate, manualTime)
            if (slot) onAddSlot(slot)
          }}
          disabled={todayAt(manualDate, manualTime) === null || remaining <= 0}
        >
          + Add a date
        </button>
      </div>
    </section>
  )
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
