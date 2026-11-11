import { slotHasTime, type Slot } from '../state/schema'
import { parseSlot, toSlot } from './dates'

/**
 * Builds "add to Google Calendar" links — Google's public event-template URL, which opens
 * a pre-filled event for the user to save. No API, no token, no request from this app.
 *
 * Times are written with no `Z` and no `ctz`, which Google reads as the viewer's own
 * calendar timezone. That is exactly the floating wall-clock meaning a slot already has
 * (PLAN §3.5): 9:00 lands at 9:00 for whoever clicks it.
 */

const TEMPLATE_URL = 'https://calendar.google.com/calendar/render'

/** Slots have no end time; each calendar event is given this length. */
export const EVENT_MINUTES = 60

/**
 * "2026-09-21T09:00" -> "20260921T090000", the compact form Google's `dates` expects.
 * A date-only "2026-09-21" -> "20260921", which Google reads as an all-day date.
 */
export function toGcalTime(slot: Slot): string {
  const compact = slot.replace(/[-:]/g, '')
  return slotHasTime(slot) ? `${compact}00` : compact
}

export interface GcalEvent {
  slot: Slot
  names: readonly string[]
  /** Rotation title; may be empty. */
  title: string
  /** The rotation link, added to the event description when non-empty. */
  url?: string
}

/**
 * The template link for one assignment, or null if the slot is not a real date-time.
 * A date-only slot becomes an all-day event; Google's end date for those is exclusive,
 * so it is the following day.
 * Names and title come from an untrusted link, but they only ever go through
 * URLSearchParams into a fixed https origin, so they cannot change where the link points.
 */
export function gcalLink({ slot, names, title, url = '' }: GcalEvent): string | null {
  const start = parseSlot(slot)
  if (start === null) return null
  const end = slotHasTime(slot)
    ? toSlot(start.add({ minutes: EVENT_MINUTES }))
    : toSlot(start.add({ days: 1 }), false)
  const who = names.join(', ')
  const text = title.trim().length > 0 ? `${title.trim()}: ${who}` : who
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates: `${toGcalTime(slot)}/${toGcalTime(end)}`,
  })
  if (url.length > 0) params.set('details', `Rotation: ${url}`)
  return `${TEMPLATE_URL}?${params.toString()}`
}
