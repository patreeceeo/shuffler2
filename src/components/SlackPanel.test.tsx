// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SlackPanel from './SlackPanel'
import { derive } from '../lib/schedule'
import type { RotationState } from '../state/schema'

afterEach(cleanup)

const URL = 'https://zzt64.com/shuffler2/#s=BLOB'

function rotation(partial: Partial<RotationState> = {}): RotationState {
  return {
    v: 2,
    title: 'Dish duty',
    names: ['Ada', 'Grace'],
    slots: ['2026-09-21T09:00', '2026-09-28T09:00'],
    groupSize: 1,
    ...partial,
  }
}

function renderPanel(state = rotation(), url = URL) {
  render(
    <SlackPanel
      state={state}
      schedule={derive(state)}
      formatSlot={(slot) => slot}
      url={url}
    />,
  )
  return screen.getByRole('textbox', { name: 'Slack message' })
}

describe('SlackPanel', () => {
  it('shows a ready-to-paste message with the rotation link in it', () => {
    const area = renderPanel()
    const message = (area as HTMLTextAreaElement).value
    expect(message).toContain('*Dish duty*')
    expect(message).toContain('```')
    expect(message).toContain('2026-09-21T09:00  Ada')
    expect(message).toContain(`<${URL}|Open or edit this rotation>`)
  })

  it('is read-only — the message is generated, not edited here', () => {
    expect(renderPanel()).toHaveAttribute('readonly')
  })

  it('starts with mentions off, because turning them on pings real people', () => {
    const area = renderPanel()
    const box = screen.getByRole('checkbox')
    expect(box).not.toBeChecked()
    expect((area as HTMLTextAreaElement).value).not.toContain('@')
    // The label has to make the consequence obvious before you tick it.
    expect(screen.getByText(/will notify those people/i)).toBeInTheDocument()
  })

  it('switches to the un-blocked shape when mentions are turned on', async () => {
    const user = userEvent.setup()
    const area = renderPanel()
    await user.click(screen.getByRole('checkbox'))
    const message = (area as HTMLTextAreaElement).value
    expect(message).toContain('@Ada')
    // @handle does not linkify inside a code block, so there cannot be one.
    expect(message).not.toContain('```')
    expect(message).toContain(`<${URL}|Open or edit this rotation>`)
  })

  it('explains that the columns stop lining up once mentions are on', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByText(/do not work inside a code block/i)).toBeInTheDocument()
  })

  it('copies the message and flashes confirmation', async () => {
    // user-event installs its own navigator.clipboard stub, so read the copy back from it
    // rather than replacing navigator (which would knock that stub out again).
    const user = userEvent.setup()
    const area = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(await navigator.clipboard.readText()).toBe((area as HTMLTextAreaElement).value)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('is honest that Slack does the repeating, not Shuffler', () => {
    renderPanel()
    expect(screen.getByText(/cannot post to Slack itself/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Shuffler is not involved and schedules nothing/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Posting it every week/i }),
    ).toBeInTheDocument()
  })

  it('renders an empty rotation as a note, not a broken table', () => {
    const area = renderPanel(rotation({ names: [], slots: [], title: '' }), '')
    const message = (area as HTMLTextAreaElement).value
    expect(message).toContain('_Nothing to post yet:')
    expect(message).not.toContain('```')
  })

  it('keeps a name that looks like markup as text (untrusted link input)', () => {
    const area = renderPanel(rotation({ names: ['<img src=x onerror=alert(1)>'] }))
    expect((area as HTMLTextAreaElement).value).toContain(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
    // No markup reached the DOM: the message lives in a textarea's value.
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(document.querySelector('[onerror]')).toBeNull()
  })
})
