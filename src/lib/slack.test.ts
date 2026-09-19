import { describe, expect, it } from 'vitest'
import {
  MAX_HOURS_BEFORE,
  formatWhen,
  normalizeChannel,
  shiftEarlier,
  toHandle,
  toRemindCommands,
} from './slack'
import { derive } from './schedule'
import type { RotationState } from '../state/schema'

function state(over: Partial<RotationState> = {}): RotationState {
  return {
    v: 2,
    title: 'Dish duty',
    names: ['ada', 'grace'],
    slots: ['2026-09-21T09:00', '2026-09-28T17:30'],
    groupSize: 1,
    ...over,
  }
}

describe('formatWhen', () => {
  it('uses the American m/d/yyyy + h:mmam format Slack documents', () => {
    expect(formatWhen('2026-09-21T09:00')).toBe('9/21/2026 at 9:00am')
    expect(formatWhen('2026-12-01T17:30')).toBe('12/1/2026 at 5:30pm')
  })

  it('handles both ends of the 12-hour clock', () => {
    expect(formatWhen('2026-01-01T00:15')).toBe('1/1/2026 at 12:15am')
    expect(formatWhen('2026-01-01T12:00')).toBe('1/1/2026 at 12:00pm')
  })

  it('passes anything unparseable straight through rather than inventing a date', () => {
    expect(formatWhen('nonsense')).toBe('nonsense')
  })
})

describe('toHandle', () => {
  it('prefixes a username with @', () => {
    expect(toHandle('ada')).toBe('@ada')
  })

  it('does not double an @ the user typed', () => {
    expect(toHandle('@ada')).toBe('@ada')
  })

  it('collapses whitespace, so a name cannot end the command early', () => {
    expect(toHandle('ada\nlovelace')).toBe('@ada lovelace')
  })

  it('defangs broadcasts: a name must not ping the whole workspace', () => {
    for (const bad of ['channel', 'here', 'everyone', '@Channel']) {
      expect(toHandle(bad).startsWith('@')).toBe(false)
    }
  })
})

describe('normalizeChannel', () => {
  it('accepts a name with or without the #', () => {
    expect(normalizeChannel('#chores')).toBe('chores')
    expect(normalizeChannel('  chores ')).toBe('chores')
  })

  it('hyphenates spaces, since Slack channel names have none', () => {
    expect(normalizeChannel('dish duty')).toBe('dish-duty')
  })
})

describe('toRemindCommands', () => {
  it('emits one /remind per slot, targeting the channel', () => {
    const s = state()
    const lines = toRemindCommands(derive(s), { channel: '#chores', title: s.title })
    expect(lines).toEqual([
      '/remind #chores @ada your Dish duty turn on 9/21/2026 at 9:00am! 9/21/2026 at 9:00am',
      '/remind #chores @grace your Dish duty turn on 9/28/2026 at 5:30pm! 9/28/2026 at 5:30pm',
    ])
  })

  it('mentions everyone in a slot when groupSize is above 1', () => {
    const s = state({ names: ['ada', 'grace', 'linus', 'barbara'], groupSize: 2 })
    const lines = toRemindCommands(derive(s), { channel: 'chores', title: '' })
    expect(lines[0]).toBe(
      '/remind #chores @ada @grace your turn on 9/21/2026 at 9:00am 9/21/2026 at 9:00am',
    )
  })

  it('returns nothing without a channel or without a rotation', () => {
    const s = state()
    expect(toRemindCommands(derive(s), { channel: '  ', title: 'x' })).toEqual([])
    const bare = state({ names: [], slots: [] })
    expect(toRemindCommands(derive(bare), { channel: 'chores', title: 'x' })).toEqual([])
  })
})


describe('shiftEarlier', () => {
  it('moves the reminder back within the same day', () => {
    expect(shiftEarlier('2026-09-21T09:00', 2)).toBe('2026-09-21T07:00')
  })

  it('crosses midnight into the previous day', () => {
    expect(shiftEarlier('2026-09-21T01:00', 3)).toBe('2026-09-20T22:00')
  })

  it('crosses a month and a year boundary', () => {
    expect(shiftEarlier('2026-01-01T01:00', 2)).toBe('2025-12-31T23:00')
    expect(shiftEarlier('2026-03-01T00:30', 1)).toBe('2026-02-28T23:30')
  })

  it('leaves the slot alone for 0, negative or nonsense lead times', () => {
    expect(shiftEarlier('2026-09-21T09:00', 0)).toBe('2026-09-21T09:00')
    expect(shiftEarlier('2026-09-21T09:00', -5)).toBe('2026-09-21T09:00')
    expect(shiftEarlier('2026-09-21T09:00', Number.NaN)).toBe('2026-09-21T09:00')
  })

  it('caps absurd lead times instead of walking off the calendar', () => {
    const capped = shiftEarlier('2026-09-21T09:00', 100000)
    expect(capped).toBe(shiftEarlier('2026-09-21T09:00', MAX_HOURS_BEFORE))
  })
})

describe('toRemindCommands with lead time', () => {
  it('shifts the time and says how early it is', () => {
    const s = state({ slots: ['2026-09-21T09:00'], names: ['ada'] })
    const lines = toRemindCommands(derive(s), {
      channel: 'chores',
      title: 'Dish duty',
      hoursBefore: 2,
    })
    // Text states the turn (9:00am); the trailing time is when Slack fires it (7:00am).
    expect(lines).toEqual([
      '/remind #chores @ada your Dish duty turn on 9/21/2026 at 9:00am! 9/21/2026 at 7:00am',
    ])
  })

  it('shifts onto the previous date when the lead time crosses midnight', () => {
    const s = state({ slots: ['2026-09-21T01:00'], names: ['ada'] })
    const lines = toRemindCommands(derive(s), {
      channel: 'chores',
      title: '',
      hoursBefore: 3,
    })
    expect(lines[0]).toBe(
      '/remind #chores @ada your turn on 9/21/2026 at 1:00am 9/20/2026 at 10:00pm',
    )
  })
})

describe('quotes in user text', () => {
  it('are stripped from names and titles', () => {
    const s = state({ names: ['ada"'], title: 'Dish " duty', slots: ['2026-09-21T09:00'] })
    const line = toRemindCommands(derive(s), {
      channel: 'chores',
      title: s.title,
      hoursBefore: 1,
    })[0]
    expect((line?.match(/"/g) ?? []).length).toBe(0)
    expect(line).toBe(
      '/remind #chores @ada your Dish duty turn on 9/21/2026 at 9:00am! 9/21/2026 at 8:00am',
    )
  })
})
