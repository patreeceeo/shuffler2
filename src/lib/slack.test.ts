import { describe, expect, it } from 'vitest'
import {
  formatWhen,
  normalizeChannel,
  toHandle,
  toRemindCommands,
  toRemindScript,
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
      '/remind #chores @ada your turn: Dish duty 9/21/2026 at 9:00am',
      '/remind #chores @grace your turn: Dish duty 9/28/2026 at 5:30pm',
    ])
  })

  it('mentions everyone in a slot when groupSize is above 1', () => {
    const s = state({ names: ['ada', 'grace', 'linus', 'barbara'], groupSize: 2 })
    const lines = toRemindCommands(derive(s), { channel: 'chores', title: '' })
    expect(lines[0]).toBe('/remind #chores @ada @grace your turn 9/21/2026 at 9:00am')
  })

  it('returns nothing without a channel or without a rotation', () => {
    const s = state()
    expect(toRemindCommands(derive(s), { channel: '  ', title: 'x' })).toEqual([])
    const bare = state({ names: [], slots: [] })
    expect(toRemindCommands(derive(bare), { channel: 'chores', title: 'x' })).toEqual([])
  })
})

describe('toRemindScript', () => {
  it('explains itself instead of going blank when something is missing', () => {
    const bare = state({ names: [], slots: [] })
    expect(toRemindScript(derive(bare), { channel: 'chores', title: '' })).toMatch(
      /names and some dates/i,
    )
    expect(toRemindScript(derive(state()), { channel: '', title: '' })).toMatch(
      /channel name/i,
    )
  })
})
