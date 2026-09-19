import type { Schedule } from './schedule'
import { parseSlot, toSlot } from './dates'

/**
 * Generates Slack `/remind` commands for a rotation — pure string work, nothing more.
 *
 * Why commands you paste rather than an integration: the Slack Web API sends no CORS
 * headers, so a static page cannot call it; `reminders.add` has been retired/degraded since
 * 2023; and this app's whole state is a link people forward, so it can hold no token. A
 * slash command the user runs themselves needs none of that. There is no fetch() here.
 *
 * Shape: `/remind [#channel] [what] [when]`. Slack's own docs are explicit that you
 * CANNOT set a reminder for another person, so these target the channel and @-mention
 * whoever is up — which is also how a chore rotation usually wants to read.
 *
 * Dates use American m/d/yyyy and `h:mmam`, the format Slack documents for best parsing.
 * The slot is a floating local wall-clock string, so this splits it rather than going
 * through Date — no timezone can be introduced and no `toISOString()` can creep in.
 */

/** A week of lead time is already absurd for a chore rota; past that it is a typo. */
export const MAX_HOURS_BEFORE = 168

/**
 * The slot, moved earlier by `hours`.
 *
 * This goes through `parseSlot`/`toSlot` — i.e. `Temporal.PlainDateTime` — rather than
 * doing string maths, because subtracting hours crosses midnight, month ends and years.
 * "2 hours before 2026-01-01T01:00" is 2025-12-31T23:00, and only calendar arithmetic
 * gets that right. The value stays a floating wall-clock string throughout, so no
 * timezone is introduced (PLAN §3.5).
 */
export function shiftEarlier(slot: string, hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return slot
  const parsed = parseSlot(slot)
  if (parsed === null) return slot
  return toSlot(parsed.subtract({ hours: Math.min(Math.floor(hours), MAX_HOURS_BEFORE) }))
}

/**
 * The reminder text is wrapped in double quotes so Slack knows where it ends and the time
 * expression begins — necessary because the text now contains a date of its own. That makes
 * a literal `"` a delimiter, so it cannot survive inside a name or title: one would close
 * the text early and hand the rest to Slack's time parser.
 */
function stripQuotes(text: string): string {
  return text.replace(/["\u201c\u201d]/g, '')
}

/** Broadcast tokens that would ping an entire channel if a name happened to spell one. */
const BROADCASTS = new Set(['channel', 'here', 'everyone'])

/**
 * One name, ready to sit in a command. Names are assumed to be Slack usernames, so they
 * get an `@`, but:
 *  - a newline would end the command early and forge a second one, so whitespace collapses
 *  - a leading `@` the user typed themselves is not doubled
 *  - `@channel`/`@here`/`@everyone` are defanged, or a crafted link could make the person
 *    pasting these ping their whole workspace
 */
export function toHandle(name: string): string {
  const flat = stripQuotes(name).replace(/\s+/g, ' ').trim().replace(/^@+/, '')
  if (flat.length === 0) return ''
  if (BROADCASTS.has(flat.toLowerCase())) return flat
  return `@${flat}`
}

/** `#general` from whatever the user typed: no leading #, no spaces, no empty string. */
export function normalizeChannel(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '-')
}

/** "2026-09-21T09:00" -> "9/21/2026 at 9:00am", Slack's documented parsing format. */
export function formatWhen(slot: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(slot)
  if (!match) return slot
  const [, y, mo, d, h, mi] = match as unknown as [string, string, string, string, string, string]
  const hour24 = Number(h)
  const suffix = hour24 < 12 ? 'am' : 'pm'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${String(Number(mo))}/${String(Number(d))}/${y} at ${String(hour12)}:${mi}${suffix}`
}

export interface RemindOptions {
  /** Channel the reminders post in, as typed by the user (with or without a #). */
  channel: string
  /** Rotation title, used as the thing being reminded about. */
  title: string
  /**
   * How many hours before the turn the reminder should fire. 0 means at the turn itself.
   * The wording changes with it, so a reminder that arrives early says so.
   */
  hoursBefore?: number
}

/**
 * One `/remind` per slot. Returns lines, not a blob, so the caller can join them and the
 * tests can assert per-command.
 */
export function toRemindCommands(schedule: Schedule, options: RemindOptions): string[] {
  if (schedule.empty) return []
  const channel = normalizeChannel(options.channel)
  if (channel.length === 0) return []
  const what = stripQuotes(options.title).replace(/\s+/g, ' ').trim()
  const hours = options.hoursBefore ?? 0
  return schedule.assignments.map((assignment) => {
    const handles = assignment.names.map(toHandle).filter((h) => h.length > 0).join(' ')
    // The turn's own time leads the text, so a reminder that arrives early still says
    // plainly when the turn actually is. The trailing time is when Slack fires it.
    const turn = formatWhen(assignment.slot)
    const subject = what.length > 0 ? `your turn ${turn}: ${what}` : `your turn ${turn}`
    const fires = formatWhen(shiftEarlier(assignment.slot, hours))
    return `/remind #${channel} "${handles} ${subject}" ${fires}`
  })
}

/** The whole textarea body, including the empty-state explanations. */
export function toRemindScript(schedule: Schedule, options: RemindOptions): string {
  if (schedule.empty) return 'Add some names and some dates first.'
  if (normalizeChannel(options.channel).length === 0) {
    return 'Enter a channel name above to generate the reminder commands.'
  }
  return toRemindCommands(schedule, options).join('\n')
}
