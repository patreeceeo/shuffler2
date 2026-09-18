// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { HASH_DEBOUNCE_MS, useRotationState } from './useRotationState'
import { encode, decode, blobFromHash } from './codec'
import type { RotationState } from './schema'

function Probe({
  onReady,
}: {
  onReady?: (store: ReturnType<typeof useRotationState>) => void
}) {
  const store = useRotationState()
  onReady?.(store)
  return (
    <div>
      <output data-testid="title">{store.state.title}</output>
      <output data-testid="names">{store.state.names.join(',')}</output>
      <output data-testid="slots">{String(store.state.slots.length)}</output>
      <output data-testid="ready">{String(store.ready)}</output>
      <output data-testid="corrupted">{String(store.corrupted)}</output>
      <output data-testid="url">{store.shareUrl}</output>
    </div>
  )
}

let latest: ReturnType<typeof useRotationState> | null = null

function renderProbe() {
  latest = null
  return render(
    <Probe
      onReady={(store) => {
        latest = store
      }}
    />,
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
})

/**
 * Real timers, deliberately. The write path ends in CompressionStream, which in Node is
 * zlib on the thread pool — real I/O that fake timers cannot drain, so faking them makes
 * these tests assert before the write has happened.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, HASH_DEBOUNCE_MS + 120))
  })
}

describe('useRotationState seeding', () => {
  it('lands empty when there is no hash and no query string', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('names')).toHaveTextContent('')
    expect(screen.getByTestId('slots')).toHaveTextContent('0')
    expect(screen.getByTestId('corrupted')).toHaveTextContent('false')
  })

  it('writes no hash on a bare visit, so the URL stays clean until the first edit', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    await new Promise((resolve) => setTimeout(resolve, HASH_DEBOUNCE_MS + 120))
    expect(window.location.hash).toBe('')
  })

  it('seeds from a #s= hash', async () => {
    const state: RotationState = {
      v: 2,
      title: 'Bins',
      names: ['Zoe', 'Yan'],
      slots: ['2026-09-21T09:00'],
      groupSize: 1,
    }
    window.history.replaceState(null, '', `/#s=${await encode(state)}`)
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('title')).toHaveTextContent('Bins')
    expect(screen.getByTestId('names')).toHaveTextContent('Zoe,Yan')
  })

  it('flags a corrupted hash and falls back to an empty state without throwing', async () => {
    window.history.replaceState(null, '', '/#s=notarealblob!!!')
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('corrupted')).toHaveTextContent('true')
    expect(screen.getByTestId('names')).toHaveTextContent('')
    act(() => {
      latest?.dismissCorrupted()
    })
    expect(screen.getByTestId('corrupted')).toHaveTextContent('false')
  })

  it('imports a v1 query string and rewrites the URL into the #s= form', async () => {
    window.history.replaceState(
      null,
      '',
      '/?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17',
    )
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('names')).toHaveTextContent('Ada,Linus,Grace')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toMatch(/^#s=.+/)
    const decoded = await decode(blobFromHash(window.location.hash))
    expect(decoded?.groupSize).toBe(2)
  })
})

describe('useRotationState writing', () => {
  it('debounces the hash write', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    const before = window.location.hash
    act(() => {
      latest?.update((prev) => ({ ...prev, title: 'T' }))
      latest?.update((prev) => ({ ...prev, title: 'Ti' }))
      latest?.update((prev) => ({ ...prev, title: 'Tit' }))
    })
    // Nothing written yet — that is the whole point of the 300 ms debounce.
    expect(window.location.hash).toBe(before)
    await settle()
    const decoded = await decode(blobFromHash(window.location.hash))
    expect(decoded?.title).toBe('Tit')
  })

  it('uses replaceState for continuous edits and pushState for discrete ones', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')

    act(() => {
      latest?.update((prev) => ({ ...prev, title: 'typing' }))
    })
    await settle()
    expect(replace).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()

    replace.mockClear()
    act(() => {
      latest?.update((prev) => ({ ...prev, names: [...prev.names].reverse() }), 'push')
    })
    await settle()
    expect(push).toHaveBeenCalledTimes(1)

    push.mockRestore()
    replace.mockRestore()
  })

  it('does not downgrade a push to a replace when both land in one debounce window', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    const push = vi.spyOn(window.history, 'pushState')
    act(() => {
      latest?.update((prev) => ({ ...prev, names: ['a', 'b'] }), 'push')
      latest?.update((prev) => ({ ...prev, title: 'x' }))
    })
    await settle()
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
  })

  it('exposes a share URL with no query string', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    act(() => {
      latest?.update((prev) => ({ ...prev, title: 'Bins' }))
    })
    await settle()
    const url = screen.getByTestId('url').textContent ?? ''
    expect(url).toContain('#s=')
    expect(url).not.toContain('?')
  })
})

describe('hashchange echo guard (PLAN §7)', () => {
  it('ignores the hashchange caused by its own write', async () => {
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    act(() => {
      latest?.update((prev) => ({ ...prev, title: 'Echo' }))
    })
    await settle()
    const hashAfterWrite = window.location.hash

    // Re-dispatch the event the browser would have fired for our own write.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await settle()

    expect(window.location.hash).toBe(hashAfterWrite)
    expect(screen.getByTestId('title')).toHaveTextContent('Echo')
  })

  it('re-seeds from an externally changed hash (back button)', async () => {
    const other: RotationState = {
      v: 2,
      title: 'From history',
      names: ['Q'],
      slots: [],
      groupSize: 1,
    }
    renderProbe()
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    const blob = await encode(other)
    window.history.replaceState(null, '', `/#s=${blob}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await settle()
    await waitFor(() => {
      expect(screen.getByTestId('title')).toHaveTextContent('From history')
    })
    expect(screen.getByTestId('names')).toHaveTextContent('Q')
  })
})
