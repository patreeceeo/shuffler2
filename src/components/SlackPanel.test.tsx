// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SlackPanel from './SlackPanel'
import { derive } from '../lib/schedule'
import type { RotationState } from '../state/schema'

afterEach(cleanup)

const rotation: RotationState = {
  v: 2,
  title: 'Dish duty',
  names: ['ada', 'grace'],
  slots: ['2026-09-21T09:00', '2026-09-28T17:30'],
  groupSize: 1,
}

describe('SlackPanel', () => {
  it('asks for a channel before it will generate anything', () => {
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    expect(screen.getByText(/Enter a channel name/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Command 1')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Copy command/ })).toBeNull()
  })

  it('gives every command its own field and its own Copy button', async () => {
    const user = userEvent.setup()
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    await user.type(screen.getByLabelText(/Channel/i), '#chores')

    expect(screen.getByLabelText('Command 1')).toHaveValue(
      '/remind #chores @ada your Dish duty turn on 9/21/2026 at 9:00am! 9/21/2026 at 9:00am',
    )
    expect(screen.getByLabelText('Command 2')).toHaveValue(
      '/remind #chores @grace your Dish duty turn on 9/28/2026 at 5:30pm! 9/28/2026 at 5:30pm',
    )
    // One button per command, each distinguishable to a screen reader.
    expect(screen.getAllByRole('button', { name: /^Copy command/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Copy command 2' })).toBeInTheDocument()
  })

  it('every field is read-only — the commands are generated, not edited', async () => {
    const user = userEvent.setup()
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    await user.type(screen.getByLabelText(/Channel/i), 'chores')
    for (const label of ['Command 1', 'Command 2']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly')
    }
  })

  it('only the row you copied says Copied, and it copies that row', async () => {
    // userEvent.setup() installs a clipboard stub; jsdom's own navigator.clipboard is
    // getter-only, so assigning over it throws.
    const user = userEvent.setup()
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    await user.type(screen.getByLabelText(/Channel/i), 'chores')
    await user.click(screen.getByRole('button', { name: 'Copy command 2' }))

    const written = await navigator.clipboard.readText()
    expect(written).toContain('@grace')
    expect(written).not.toContain('@ada')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy command 2' })).toHaveTextContent(
        'Copied',
      )
    })
    expect(screen.getByRole('button', { name: 'Copy command 1' })).toHaveTextContent('Copy')
  })
})
