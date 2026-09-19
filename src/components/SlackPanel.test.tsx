// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
    const box = screen.getByLabelText('Slack /remind commands')
    expect(box).toHaveValue(
      'Enter a channel name above to generate the reminder commands.',
    )
    expect(screen.getByRole('button', { name: /Copy commands/ })).toBeDisabled()
  })

  it('generates a /remind per slot once a channel is given', async () => {
    const user = userEvent.setup()
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    await user.type(screen.getByLabelText(/Channel/i), '#chores')
    expect(screen.getByLabelText('Slack /remind commands')).toHaveValue(
      [
        '/remind #chores "@ada your turn 9/21/2026 at 9:00am: Dish duty" 9/21/2026 at 9:00am',
        '/remind #chores "@grace your turn 9/28/2026 at 5:30pm: Dish duty" 9/28/2026 at 5:30pm',
      ].join('\n'),
    )
    expect(screen.getByRole('button', { name: /Copy commands/ })).toBeEnabled()
  })

  it('is read-only — the commands are generated, not edited', () => {
    render(<SlackPanel schedule={derive(rotation)} title={rotation.title} />)
    expect(screen.getByLabelText('Slack /remind commands')).toHaveAttribute('readonly')
  })
})
