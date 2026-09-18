// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { encode, decode, blobFromHash } from './state/codec'
import { HASH_DEBOUNCE_MS } from './state/useRotationState'
import type { RotationState } from './state/schema'

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
    expect(table.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
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
    expect(document.querySelector('img')).toBeNull()
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
      expect(document.title).toBe('Bin night — Shuffler')
    })
  })
})
