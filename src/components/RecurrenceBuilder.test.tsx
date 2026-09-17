// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecurrenceBuilder from './RecurrenceBuilder'
import SlotList from './SlotList'
import { useState } from 'react'
import { normalizeSlots, type Slot } from '../state/schema'

afterEach(cleanup)

function Harness({ initial = [] as Slot[] }) {
  // App always writes slots through normalizeSlots; mirror that invariant here.
  const [slots, setSlots] = useState<Slot[]>(() => normalizeSlots(initial))
  return (
    <>
      <RecurrenceBuilder
        slotCount={slots.length}
        onGenerate={(generated) => {
          setSlots((prev) => normalizeSlots([...prev, ...generated]))
        }}
        onAddSlot={(slot) => {
          setSlots((prev) => normalizeSlots([...prev, slot]))
        }}
      />
      <SlotList
        slots={slots}
        onSlotsChange={(next) => {
          setSlots(normalizeSlots(next))
        }}
      />
      <output data-testid="slots">{slots.join('|')}</output>
    </>
  )
}

describe('RecurrenceBuilder', () => {
  it('defaults to weekly, Monday, 09:00, 12 times (PLAN §5)', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Unit')).toHaveValue('week')
    expect(screen.getByLabelText('Weekday')).toHaveValue('1')
    expect(screen.getByLabelText('Time of day')).toHaveValue('09:00')
    expect(screen.getByLabelText('Number of occurrences')).toHaveValue(12)
  })

  it('generates twelve 9am slots and every one is still 9am', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    const slots = (screen.getByTestId('slots').textContent ?? '').split('|')
    expect(slots).toHaveLength(12)
    expect(slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
  })

  it('generates across a DST boundary without losing the hour', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // 2026-03-02 is the Monday before US spring-forward on 2026-03-08.
    const dateInput = screen.getByLabelText('Start date')
    await user.clear(dateInput)
    await user.type(dateInput, '2026-03-02')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    const slots = (screen.getByTestId('slots').textContent ?? '').split('|')
    expect(slots).toContain('2026-03-09T09:00')
    expect(slots.every((slot) => slot.endsWith('T09:00'))).toBe(true)
  })

  it('appends and de-duplicates rather than wiping existing dates', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['2020-01-01T08:00']} />)
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    const slots = (screen.getByTestId('slots').textContent ?? '').split('|')
    expect(slots[0]).toBe('2020-01-01T08:00')
    expect(slots).toHaveLength(13)

    // Generating the same series twice must not double the dates.
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect((screen.getByTestId('slots').textContent ?? '').split('|')).toHaveLength(13)
  })

  it('hides the weekday picker for daily and monthly series', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(screen.getByLabelText('Unit'), 'day')
    expect(screen.queryByLabelText('Weekday')).toBeNull()
  })

  it('adds a single date manually', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const date = screen.getByLabelText('Single date')
    await user.clear(date)
    await user.type(date, '2026-12-25')
    await user.click(screen.getByRole('button', { name: '+ Add a date' }))
    expect(screen.getByTestId('slots')).toHaveTextContent('2026-12-25T09:00')
  })
})

describe('SlotList', () => {
  it('lists slots sorted ascending and deletes one', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['2026-02-01T09:00', '2026-01-01T09:00']} />)
    expect(screen.getByTestId('slots').textContent).toBe(
      '2026-01-01T09:00|2026-02-01T09:00',
    )
    const deletes = screen.getAllByRole('button', { name: /^Delete / })
    await user.click(deletes[0]!)
    expect(screen.getByTestId('slots')).toHaveTextContent('2026-02-01T09:00')
  })

  it('clears every slot', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['2026-02-01T09:00', '2026-01-01T09:00']} />)
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByTestId('slots').textContent).toBe('')
  })

  it('guides rather than showing NaN when there are no slots', () => {
    render(<Harness />)
    expect(screen.getByText(/No dates yet/i)).toBeInTheDocument()
  })
})

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => {
    cb(0)
  }, 0) as unknown as number
})
