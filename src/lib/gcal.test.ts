import { describe, expect, it } from 'vitest'
import { gcalLink, toGcalTime } from './gcal'

function params(link: string | null): URLSearchParams {
  expect(link).not.toBeNull()
  const url = new URL(link!)
  expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
  return url.searchParams
}

describe('toGcalTime', () => {
  it('compacts a slot and adds seconds', () => {
    expect(toGcalTime('2026-09-21T09:00')).toBe('20260921T090000')
  })
})

describe('gcalLink', () => {
  it('builds a one-hour floating-time event', () => {
    const p = params(
      gcalLink({ slot: '2026-09-21T09:00', names: ['Ada'], title: 'Dishes' }),
    )
    expect(p.get('action')).toBe('TEMPLATE')
    expect(p.get('text')).toBe('Dishes: Ada')
    expect(p.get('dates')).toBe('20260921T090000/20260921T100000')
    expect(p.has('ctz')).toBe(false)
    expect(p.has('details')).toBe(false)
  })

  it('crosses midnight and year end with calendar arithmetic', () => {
    const p = params(gcalLink({ slot: '2026-12-31T23:30', names: ['Ada'], title: '' }))
    expect(p.get('dates')).toBe('20261231T233000/20270101T003000')
  })

  it('uses just the names when there is no title, joined for group slots', () => {
    const p = params(
      gcalLink({ slot: '2026-09-21T09:00', names: ['Ada', 'Grace'], title: '  ' }),
    )
    expect(p.get('text')).toBe('Ada, Grace')
  })

  it('puts the rotation link in the description', () => {
    const p = params(
      gcalLink({
        slot: '2026-09-21T09:00',
        names: ['Ada'],
        title: 'x',
        url: 'https://example.com/#s=abc',
      }),
    )
    expect(p.get('details')).toBe('Rotation: https://example.com/#s=abc')
  })

  it('keeps hostile text inside the query string', () => {
    const p = params(
      gcalLink({
        slot: '2026-09-21T09:00',
        names: ['&action=x#frag"><script>'],
        title: '',
      }),
    )
    expect(p.get('action')).toBe('TEMPLATE')
    expect(p.get('text')).toBe('&action=x#frag"><script>')
  })

  it('makes a date-only slot an all-day event ending the next day (exclusive)', () => {
    expect(toGcalTime('2026-09-21')).toBe('20260921')
    const p = params(gcalLink({ slot: '2026-12-31', names: ['Ada'], title: '' }))
    expect(p.get('dates')).toBe('20261231/20270101')
  })

  it('returns null for an invalid slot', () => {
    expect(gcalLink({ slot: 'nope', names: ['Ada'], title: '' })).toBeNull()
  })
})
