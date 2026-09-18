import { describe, expect, it } from 'vitest'
import {
  bold,
  codeBlockSafe,
  escapeMrkdwn,
  flattenWhitespace,
  italic,
  link,
  toSlackMessage,
} from './slack'
import { derive } from './schedule'
import type { RotationState } from '../state/schema'

function state(partial: Partial<RotationState>): RotationState {
  return {
    v: 2,
    title: '',
    names: ['Ada', 'Grace', 'Linus'],
    slots: ['2026-09-21T09:00', '2026-09-28T09:00', '2026-10-05T09:00'],
    groupSize: 1,
    ...partial,
  }
}

const URL = 'https://zzt64.com/shuffler2/#s=BLOB'

function message(s: RotationState, mentions = false, url = URL): string {
  return toSlackMessage(s, derive(s), (slot) => slot, { mentions, url })
}

describe('mrkdwn is not Markdown', () => {
  it('bolds with one asterisk each side, not two', () => {
    expect(bold('Dish duty')).toBe('*Dish duty*')
    expect(bold('Dish duty')).not.toContain('**')
  })

  it('italicises with underscores', () => {
    expect(italic('soon')).toBe('_soon_')
  })

  it('links with angle brackets and a pipe, not [text](url)', () => {
    expect(link('https://x.test/', 'Open')).toBe('<https://x.test/|Open>')
    expect(link('https://x.test/', 'Open')).not.toContain('](')
  })
})

describe('escapeMrkdwn', () => {
  it('escapes the three control characters', () => {
    expect(escapeMrkdwn('Ben & <Jerry>')).toBe('Ben &amp; &lt;Jerry&gt;')
  })

  it('escapes & first, so nothing is double-escaped', () => {
    expect(escapeMrkdwn('<')).toBe('&lt;')
    expect(escapeMrkdwn('&lt;')).toBe('&amp;lt;')
    expect(escapeMrkdwn('&amp;')).toBe('&amp;amp;')
  })

  it('leaves text with none of them untouched', () => {
    expect(escapeMrkdwn("Ada O'Hara-Smith")).toBe("Ada O'Hara-Smith")
  })
})

describe('codeBlockSafe', () => {
  it('makes a fence unrepresentable', () => {
    expect(codeBlockSafe('```')).toBe('`')
    expect(codeBlockSafe('a```b')).toBe('a`b')
    expect(codeBlockSafe('`````')).toBe('`')
  })

  it('keeps a lone backtick, which is inert inside a block', () => {
    expect(codeBlockSafe('a`b')).toBe('a`b')
  })
})

describe('flattenWhitespace', () => {
  it('collapses a newline so one name cannot forge a second line', () => {
    expect(flattenWhitespace('Ada\n<https://evil.test|Payroll>')).toBe(
      'Ada <https://evil.test|Payroll>',
    )
    expect(flattenWhitespace('  Ada \t Lovelace  ')).toBe('Ada Lovelace')
  })
})

describe('toSlackMessage: default shape (no mentions)', () => {
  it('bolds the title, puts the table in a code block and ends with the link', () => {
    const text = message(state({ title: 'Dish duty' }))
    expect(text).toContain('*Dish duty*')
    expect(text).toContain('```')
    expect(text).toContain('2026-09-21T09:00  Ada')
    expect(text).toContain('Ada 1 · Grace 1 · Linus 1')
    expect(text).toContain(`<${URL}|Open or edit this rotation>`)
    // Exactly one opening and one closing fence.
    expect(text.split('\n').filter((l) => l === '```')).toHaveLength(2)
  })

  it('falls back to a generic bold heading when the rotation is untitled', () => {
    expect(message(state({}))).toContain('*Rotation*')
  })

  it('aligns the date column with padding', () => {
    const s = state({
      slots: ['2026-09-21T09:00', '2026-10-05T14:30'],
      names: ['Ada', 'Bo'],
    })
    const lines = message(s).split('\n')
    const rows = lines.filter((l) => l.includes('Ada') || l.includes('Bo'))
    expect(rows[0]!.indexOf('Ada')).toBe(rows[1]!.indexOf('Bo'))
  })

  it('names all the names in a group', () => {
    const text = message(state({ groupSize: 2, names: ['Ada', 'Grace'] }))
    expect(text).toContain('Ada, Grace')
  })

  it('flags an uneven split in italics', () => {
    const s = state({ slots: ['2026-09-21T09:00', '2026-09-28T09:00'] })
    expect(message(s)).toContain('_Heads up: these dates do not split evenly')
  })

  it('does not put an @ anywhere by default', () => {
    expect(message(state({ title: 'Dish duty' }))).not.toContain('@')
  })

  it('omits the link line when there is no link yet', () => {
    const text = message(state({}), false, '')
    expect(text).not.toContain('<')
    expect(text).not.toContain('Open or edit')
  })

  it('says so rather than crashing when there is nothing to show', () => {
    const s = state({ names: [], slots: [] })
    const text = message(s)
    expect(text).toContain('_Nothing to post yet:')
    expect(text).not.toContain('```')
    // Still linked: the recipient can open it and fill it in.
    expect(text).toContain(URL)
  })
})

describe('toSlackMessage: mentions shape', () => {
  it('prefixes each assigned name with @ and drops the code block', () => {
    const text = message(state({ title: 'Dish duty' }), true)
    expect(text).toContain('2026-09-21T09:00 — @Ada')
    expect(text).not.toContain('```')
  })

  it('does not @ the tally line — one ping per person, not per occurrence', () => {
    const text = message(state({}), true)
    const tally = text.split('\n').find((l) => l.includes('Grace 1'))
    expect(tally).toBe('Ada 1 · Grace 1 · Linus 1')
  })

  it('mentions every name in a group', () => {
    const text = message(state({ groupSize: 2, names: ['Ada', 'Grace'] }), true)
    expect(text).toContain('@Ada, @Grace')
  })

  it('still carries the title and the link', () => {
    const text = message(state({ title: 'Dish duty' }), true)
    expect(text).toContain('*Dish duty*')
    expect(text).toContain(`<${URL}|Open or edit this rotation>`)
  })
})

describe('toSlackMessage: a name is untrusted input from someone else’s link', () => {
  const hostile = '<@channel> Ben & ``` `Jerry`'

  it('escapes and defuses it inside the code block', () => {
    const text = message(state({ names: [hostile], title: 'A & B <c>' }))
    expect(text).toContain('*A &amp; B &lt;c&gt;*')
    expect(text).toContain('&lt;@channel&gt; Ben &amp; ` `Jerry`')
    expect(text).not.toContain('<@channel>')
    // The fence it tried to smuggle in cannot exist anywhere: only our own two remain.
    // This is not just a code-block concern — a ``` in the tally line below the block
    // would open a new one and swallow the link line.
    expect(text.split('\n').filter((l) => l === '```')).toHaveLength(2)
    expect(text.replace(/^```$/gm, '')).not.toContain('``')
    expect(text.split('\n').filter((l) => l.startsWith('<https://'))).toHaveLength(1)
  })

  it('escapes it outside the code block too, with mentions on', () => {
    const text = message(state({ names: [hostile] }), true)
    expect(text).toContain('@&lt;@channel&gt; Ben &amp;')
    expect(text).not.toContain('<@channel>')
  })

  it('cannot forge its own line', () => {
    const forged = 'Ada\n<https://evil.test|Open or edit this rotation>'
    const text = message(state({ names: [forged], slots: ['2026-09-21T09:00'] }))
    expect(text).toContain('&lt;https://evil.test|Open or edit this rotation&gt;')
    // The pipe survives, but it is inert: the brackets around it are entities now.
    expect(text).not.toContain('<https://evil.test')
    // One real link line, and it is ours.
    expect(text.split('\n').filter((l) => l.startsWith('<https://'))).toHaveLength(1)
  })

  it('never emits a raw < or > that Slack could read as markup', () => {
    const text = message(state({ names: [hostile], title: hostile }), true)
    const withoutOurLink = text.replace(`<${URL}|Open or edit this rotation>`, '')
    expect(withoutOurLink).not.toContain('<')
    expect(withoutOurLink).not.toContain('>')
  })
})
