// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import NumberField from './NumberField'

afterEach(cleanup)

function Harness({ initial = 1, min = 1, max = 20 }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="n">Count</label>
      <NumberField id="n" value={value} min={min} max={max} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  )
}

function field() {
  return screen.getByLabelText('Count')
}

describe('NumberField', () => {
  it('can be emptied instead of snapping back to the minimum', async () => {
    const user = userEvent.setup()
    render(<Harness initial={1} />)
    await user.clear(field())
    // The old behaviour re-filled the field with `min` here, which is what made a value
    // not starting with that digit impossible to type on iOS.
    expect(field()).toHaveValue(null)
    expect(screen.getByTestId('value')).toHaveTextContent('1')
  })

  it('accepts a two-digit value that does not start with the minimum', async () => {
    const user = userEvent.setup()
    render(<Harness initial={1} />)
    await user.clear(field())
    await user.type(field(), '12')
    expect(field()).toHaveValue(12)
    expect(screen.getByTestId('value')).toHaveTextContent('12')
  })

  it('ignores an out-of-range value until blur, then clamps it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={2} max={20} />)
    await user.clear(field())
    await user.type(field(), '99')
    // '9' was in range and was reported; the second keystroke put the field out of range,
    // so it is held as text and the last good value stands until blur.
    expect(field()).toHaveValue(99)
    expect(screen.getByTestId('value')).toHaveTextContent('9')
    await user.tab()
    expect(field()).toHaveValue(20)
    expect(screen.getByTestId('value')).toHaveTextContent('20')
  })

  it('restores the last good value when left empty', async () => {
    const user = userEvent.setup()
    render(<Harness initial={3} />)
    await user.clear(field())
    await user.tab()
    expect(field()).toHaveValue(3)
    expect(screen.getByTestId('value')).toHaveTextContent('3')
  })

  it('clamps a value below the minimum on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initial={4} min={1} />)
    await user.clear(field())
    await user.type(field(), '0')
    await user.tab()
    expect(field()).toHaveValue(1)
    expect(screen.getByTestId('value')).toHaveTextContent('1')
  })

  it('shows a value that changed elsewhere once the field is left alone', async () => {
    const user = userEvent.setup()
    render(<Harness initial={5} />)
    await user.clear(field())
    await user.type(field(), '7')
    await user.tab()
    expect(field()).toHaveValue(7)
  })
})
