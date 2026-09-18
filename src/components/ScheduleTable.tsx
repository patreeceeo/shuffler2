import { useAutoAnimate } from '@formkit/auto-animate/react'
import { formatSlot, monthKey, monthLabel } from '../lib/dates'
import type { Schedule } from '../lib/schedule'

interface Props {
  schedule: Schedule
  hasNames: boolean
  hasSlots: boolean
}

export default function ScheduleTable({ schedule, hasNames, hasSlots }: Props) {
  // One ref, no animation code, and it honours prefers-reduced-motion by default (§4.2).
  const [bodyRef] = useAutoAnimate<HTMLTableSectionElement>()

  if (schedule.empty) {
    return (
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Schedule</h2>
        <p className="hint">
          {!hasNames && !hasSlots
            ? 'Add some names and some dates, and the rotation appears here.'
            : !hasNames
              ? 'Add some names and the rotation appears here.'
              : 'Add some dates and the rotation appears here.'}
        </p>
      </section>
    )
  }

  // Precomputed rather than tracked with a mutable cursor inside the map: reassigning a
  // variable during render is exactly what the compiler's immutability rule forbids.
  const monthStarts = schedule.assignments.map(
    (assignment, index) =>
      index === 0 ||
      monthKey(assignment.slot) !== monthKey(schedule.assignments[index - 1]!.slot),
  )

  return (
    <section aria-labelledby="schedule-heading">
      <h2 id="schedule-heading">Schedule</h2>
      <div className="schedule-scroll">
        <table className="schedule">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {schedule.assignments.map((assignment, index) => {
              const key = monthKey(assignment.slot)
              const isNewMonth = monthStarts[index] === true
              return (
                <tr key={`${assignment.slot}-${String(assignment.index)}`}>
                  <td>
                    {isNewMonth && <span className="month-head">{monthLabel(key)}</span>}
                    {formatSlot(assignment.slot)}
                  </td>
                  {/* Plain text, always. Names arrive from a link a stranger may have
                      sent; dangerouslySetInnerHTML here is the v1 stored-XSS bug. */}
                  <td>{assignment.names.join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className={schedule.even ? 'tallies' : 'tallies uneven'}>
        {schedule.tallies.map((tally, index) => (
          <span key={`${tally.name}-${String(index)}`}>
            {tally.name === '' ? '(unnamed)' : tally.name} {tally.count}
          </span>
        ))}
        {!schedule.even && (
          <span className="uneven-note">
            — this does not divide evenly, so some people take an extra turn
          </span>
        )}
      </p>
    </section>
  )
}
