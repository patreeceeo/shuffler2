// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { encode, decode, blobFromHash } from './state/codec'
import { HASH_DEBOUNCE_MS } from './state/useRotationState'
import type { RotationState } from './state/schema'
import { URL_WARN_LENGTH } from './components/ShareBar'

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  return setTimeout(() => {
    cb(0)
  }, 0) as unknown as number
})

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(cleanup)

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, HASH_DEBOUNCE_MS + 150))
  })
}

function scheduleRows() {
  const table = screen.getByRole('table')
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '')
}

describe('App end to end (jsdom)', () => {
  it('lands with both lists empty and leaves the URL untouched', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
    })
    // No name rows, no slots, no schedule, and nothing written to the address bar.
    expect(screen.queryByLabelText('Name 1')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/Add some names and some dates/i)).toBeInTheDocument()
    await settle()
    expect(window.location.hash).toBe('')
  })

  it('shows the per-person tally and flags an uneven split', async () => {
    // 4 slots / 3 names does not divide evenly.
    const uneven: RotationState = {
      v: 2,
      title: '',
      names: ['Ada', 'Grace', 'Linus'],
      slots: [
        '2026-09-21T09:00',
        '2026-09-28T09:00',
        '2026-10-05T09:00',
        '2026-10-12T09:00',
      ],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(uneven)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    const rows = scheduleRows()
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain('Ada')
    expect(rows[3]).toContain('Ada')
    expect(screen.getByText(/does not divide evenly/i)).toBeInTheDocument()
  })

  it('adding a name from empty reaches the schedule and then the URL', async () => {
    const user = userEvent.setup()
    const datesOnly: RotationState = {
      v: 2,
      title: '',
      names: [],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(datesOnly)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '+ Add name' }))
    await user.type(await screen.findByLabelText('Name 1'), 'Zoe')
    expect(scheduleRows()[0]).toContain('Zoe')

    await settle()
    const decoded = await decode(blobFromHash(window.location.hash))
    expect(decoded?.names[0]).toBe('Zoe')
  })

  it('shuffle reorders the names and the back button undoes it (§4.1, §6 M4)', async () => {
    const user = userEvent.setup()
    // Enough names that a shuffle is overwhelmingly unlikely to be a visual no-op.
    const start: RotationState = {
      v: 2,
      title: 'Bins',
      names: ['Ada', 'Grace', 'Linus', 'Barbara', 'Katherine', 'Alan'],
      slots: ['2026-09-21T09:00', '2026-09-28T09:00'],
      groupSize: 1,
    }
    const blob = await encode(start)
    window.history.replaceState(null, '', `/#s=${blob}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })

    const before = start.names.join(',')
    await user.click(screen.getByRole('button', { name: /Shuffle/ }))
    const after = start.names
      .map((_, i) => {
        const input: HTMLInputElement = screen.getByLabelText(`Name ${String(i + 1)}`)
        return input.value
      })
      .join(',')
    expect(after).not.toBe(before)

    await settle()
    // The shuffle went in as a history entry, so the hash now differs from the seed.
    expect(blobFromHash(window.location.hash)).not.toBe(blob)

    // Walk back: the previous hash re-seeds the app with the original order.
    window.history.replaceState(null, '', `/#s=${blob}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await settle()
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    expect(screen.getByLabelText('Name 6')).toHaveValue('Alan')
  })

  it('disables shuffle when there is nothing to shuffle', async () => {
    const solo: RotationState = {
      v: 2,
      title: '',
      names: ['Only'],
      slots: [],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(solo)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Only')
    })
    expect(screen.getByRole('button', { name: /Shuffle/ })).toBeDisabled()
  })

  it('renders guidance, not NaN, when there are no names or no slots', async () => {
    const bare: RotationState = { v: 2, title: '', names: [], slots: [], groupSize: 1 }
    window.history.replaceState(null, '', `/#s=${await encode(bare)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/Add some names and some dates/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/NaN/)).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('generating dates fills the schedule', async () => {
    const user = userEvent.setup()
    const namesOnly: RotationState = {
      v: 2,
      title: '',
      names: ['Ada', 'Grace'],
      slots: [],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(namesOnly)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    // The date builder lives behind the Dates tab now, so switch to it first.
    await user.click(screen.getByRole('tab', { name: /Dates/ }))
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(scheduleRows()).toHaveLength(12)
  })

  it('shows one builder at a time and switches between them', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
    })

    const namesTab = screen.getByRole('tab', { name: /Names/ })
    const datesTab = screen.getByRole('tab', { name: /Dates/ })
    expect(namesTab).toHaveAttribute('aria-selected', 'true')
    expect(datesTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: '+ Add name' })).toBeVisible()
    // The date builder is kept mounted so a half-filled recurrence form survives a tab
    // switch, but it is `hidden` — out of the layout AND out of the accessibility tree,
    // which is why it takes { hidden: true } to find it at all.
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Generate', hidden: true }),
    ).not.toBeVisible()

    await user.click(datesTab)
    expect(datesTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Generate' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '+ Add name' })).toBeNull()
  })

  it('the tab labels count what is in each list, including the hidden one', async () => {
    const seeded: RotationState = {
      v: 2,
      title: '',
      names: ['Ada', 'Grace', 'Linus'],
      slots: ['2026-09-21T09:00', '2026-09-28T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(seeded)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    expect(screen.getByRole('tab', { name: /Names/ })).toHaveTextContent('Names 3')
    expect(screen.getByRole('tab', { name: /Dates/ })).toHaveTextContent('Dates 2')
  })

  it('the schedule renders above the builder tabs', async () => {
    const seeded: RotationState = {
      v: 2,
      title: '',
      names: ['Ada'],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(seeded)}`)
    render(<App />)
    const table = await screen.findByRole('table')
    const tablist = screen.getByRole('tablist')
    // DOCUMENT_POSITION_FOLLOWING: the tab strip comes after the schedule in the DOM.
    expect(
      table.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('a name that looks like markup stays text everywhere (v1 stored XSS)', async () => {
    const hostile: RotationState = {
      v: 2,
      title: '<script>alert(1)</script>',
      names: ['<img src=x onerror=alert(1)>', 'Ada'],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(hostile)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('<img src=x onerror=alert(1)>')
    })
    // The toolbar mascot is the ONLY legitimate <img>. Anything else would mean the
    // hostile name was parsed as markup instead of escaped as text.
    const images = [...document.querySelectorAll('img')]
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveClass('mascot')
    expect(images.some((img) => img.getAttribute('src') === 'x')).toBe(false)
    expect(document.querySelector('[onerror]')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    expect(scheduleRows()[0]).toContain('<img src=x onerror=alert(1)>')
  })

  it('shows a dismissible notice for a corrupted link', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/#s=thisisnotavalidblob')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/looked corrupted/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/looked corrupted/i)).toBeNull()
  })

  it('puts groupSize names in each slot', async () => {
    const pairs: RotationState = {
      v: 2,
      title: '',
      names: ['Ada', 'Grace', 'Linus', 'Barbara'],
      slots: ['2026-09-21T09:00', '2026-09-28T09:00'],
      groupSize: 2,
    }
    window.history.replaceState(null, '', `/#s=${await encode(pairs)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    const rows = scheduleRows()
    expect(rows[0]).toContain('Ada, Grace')
    expect(rows[1]).toContain('Linus, Barbara')
  })

  it('Reset clears the hash instead of leaving an empty blob behind', async () => {
    const user = userEvent.setup()
    const seeded: RotationState = {
      v: 2,
      title: 'Bins',
      names: ['Ada', 'Grace'],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(seeded)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })

    await user.click(screen.getByRole('button', { name: /Reset/ }))
    await settle()
    // No hash <=> empty rotation, in both directions.
    expect(window.location.hash).toBe('')
    expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
  })

  it('deleting the last name and date also leaves a clean URL', async () => {
    const user = userEvent.setup()
    const solo: RotationState = {
      v: 2,
      title: '',
      names: ['Ada'],
      slots: [],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(solo)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })
    await user.click(screen.getByRole('button', { name: 'Delete Ada' }))
    await settle()
    expect(window.location.hash).toBe('')
  })

  it('has a Help tab, with no count badge, that explains the link model', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
    })

    const helpTab = screen.getByRole('tab', { name: 'Help' })
    expect(helpTab).toHaveTextContent(/^Help$/)
    await user.click(helpTab)
    expect(helpTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /How this works/i })).toBeInTheDocument()
    // Help is prose, not a builder, so it unmounts when you leave it.
    await user.click(screen.getByRole('tab', { name: /Names/ }))
    expect(screen.queryByRole('heading', { name: /How this works/i })).toBeNull()
  })

  it('the share link lives in the Share tab and reproduces the state', async () => {
    const user = userEvent.setup()
    const seeded: RotationState = {
      v: 2,
      title: 'Bins',
      names: ['Ada', 'Grace'],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(seeded)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('Ada')
    })

    // Not on screen until you ask for it.
    expect(screen.queryByRole('textbox', { name: 'Shareable link' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: /Share/ }))
    const field = screen.getByRole('textbox', { name: 'Shareable link' })
    expect(field).toHaveValue(window.location.href)
    const decoded = await decode(
      blobFromHash(new URL(field.getAttribute('value') ?? '').hash),
    )
    expect(decoded).toEqual(seeded)
  })

  it('has a Slack tab, between Share and Help, with no count badge', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/No names yet/i)).toBeInTheDocument()
    })
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent ?? '')
    const slackIndex = tabs.findIndex((t) => /^Slack$/.test(t))
    expect(slackIndex).toBeGreaterThan(tabs.findIndex((t) => /^Share/.test(t)))
    expect(slackIndex).toBeLessThan(tabs.findIndex((t) => /^Help$/.test(t)))
    // No count badge: Slack is not one of the lists being built.
    expect(screen.getByRole('tab', { name: 'Slack' })).toHaveTextContent(/^Slack$/)

    await user.click(screen.getByRole('tab', { name: 'Slack' }))
    expect(screen.getByRole('heading', { name: /^Slack$/ })).toBeInTheDocument()
  })

  it('builds /remind commands from the rotation once a channel is given', async () => {
    const user = userEvent.setup()
    const seeded: RotationState = {
      v: 2,
      title: 'Dish duty',
      names: ['ada', 'grace'],
      slots: ['2026-09-21T09:00', '2026-09-28T17:30'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(seeded)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue('ada')
    })
    await user.click(screen.getByRole('tab', { name: 'Slack' }))
    await user.type(screen.getByLabelText(/Channel/i), 'chores')
    expect(screen.getByLabelText('Command 1')).toHaveValue(
      '/remind #chores @ada your Dish duty turn on 9/21/2026 at 9:00am! 9/21/2026 at 9:00am',
    )
    expect(screen.getByLabelText('Command 2')).toHaveValue(
      '/remind #chores @grace your Dish duty turn on 9/28/2026 at 5:30pm! 9/28/2026 at 5:30pm',
    )
  })
  it('warns from the tab strip when the link gets too long to send', async () => {
    // Deliberately high-entropy: 120 copies of "Person number N" deflate down to ~470
    // characters, nowhere near the threshold. Only incompressible names make a long link.
    let seed = 1
    const noise = (n: number) =>
      Array.from({ length: n }, () => {
        seed = (seed * 48271) % 2147483647
        return seed.toString(36)
      }).join('')
    const many: RotationState = {
      v: 2,
      title: '',
      names: Array.from({ length: 180 }, () => noise(3)),
      slots: [],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(many)}`)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Name 1')).toHaveValue(many.names[0])
    })
    expect(window.location.href.length).toBeGreaterThan(URL_WARN_LENGTH)
    // The warning is reachable without opening the panel that contains it.
    expect(
      within(screen.getByRole('tab', { name: /Share/ })).getByLabelText(
        /link may be too long/i,
      ),
    ).toBeInTheDocument()
  })

  it('sets the document title from the rotation title', async () => {
    const titled: RotationState = {
      v: 2,
      title: 'Bin night',
      names: ['Ada'],
      slots: [],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(titled)}`)
    render(<App />)
    await waitFor(() => {
      expect(document.title).toBe('Bin night — Shuffler2')
    })
  })
})
