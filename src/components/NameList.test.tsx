// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import NameList from './NameList'

// auto-animate uses requestAnimationFrame + Web Animations; jsdom has neither fully.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => {
    cb(0)
  }, 0) as unknown as number
})

afterEach(cleanup)

function Harness({ initial = ['Ada', 'Grace'] }: { initial?: string[] }) {
  const [names, setNames] = useState(initial)
  const [groupSize, setGroupSize] = useState(1)
  return (
    <>
      <NameList
        names={names}
        groupSize={groupSize}
        onNamesChange={setNames}
        onGroupSizeChange={setGroupSize}
      />
      <output data-testid="names">{names.join('|')}</output>
      <output data-testid="group">{groupSize}</output>
    </>
  )
}

describe('NameList', () => {
  it('renders one input per name', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    expect(screen.getByLabelText('Name 2')).toHaveValue('Grace')
  })

  it('renders markup-looking names as text, never as HTML (v1 stored XSS)', () => {
    render(<Harness initial={['<img src=x onerror=alert(1)>']} />)
    const input = screen.getByLabelText('Name 1')
    expect(input).toHaveValue('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })

  it('Enter commits and opens a new row', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('Name 1'))
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('names')).toHaveTextContent('Ada||Grace')
  })

  it('Backspace on an empty row deletes it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Ada', '']} />)
    await user.click(screen.getByLabelText('Name 2'))
    await user.keyboard('{Backspace}')
    expect(screen.getByTestId('names')).toHaveTextContent('Ada')
    expect(screen.queryByLabelText('Name 2')).toBeNull()
  })

  it('splits a multi-line paste into rows', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['']} />)
    await user.click(screen.getByLabelText('Name 1'))
    await user.paste('Ada\nGrace\nLinus')
    expect(screen.getByTestId('names')).toHaveTextContent('Ada|Grace|Linus')
  })

  it('leaves a single-line paste to the input itself', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['']} />)
    await user.click(screen.getByLabelText('Name 1'))
    await user.paste('Smith, John')
    expect(screen.getByTestId('names')).toHaveTextContent('Smith, John')
  })

  it('adds and deletes rows by button', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '+ Add name' }))
    expect(screen.getByTestId('names')).toHaveTextContent('Ada|Grace|')
    await user.click(screen.getByRole('button', { name: 'Delete Ada' }))
    expect(screen.getByTestId('names')).toHaveTextContent('Grace|')
  })

  it('clamps people per slot to at least 1', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText(/People per slot/i)
    await user.clear(input)
    await user.type(input, '0')
    expect(screen.getByTestId('group')).toHaveTextContent('1')
  })

  it('exposes a keyboard-reachable drag handle for every row', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Reorder Ada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorder Grace' })).toBeInTheDocument()
  })

  it('shows guidance when there are no names at all', () => {
    render(<Harness initial={[]} />)
    expect(screen.getByText(/paste a whole list at once/i)).toBeInTheDocument()
  })
})
