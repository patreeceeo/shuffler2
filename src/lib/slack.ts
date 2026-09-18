import type { RotationState, Slot } from '../state/schema'
import type { Schedule } from './schedule'

/**
 * Slack message building — pure string work, and deliberately nothing more.
 *
 * This module exists because a *real* Slack integration is impossible from a static page
 * (PLAN §12), so the app's job is to make the copy-and-paste correct:
 *
 * - The Slack Web API sends no CORS headers, so `chat.postMessage` and `users.list` are
 *   unreachable from the browser. There is no fetch() anywhere in this file.
 * - `reminders.add` has been retired/degraded since 2023, so even with a token the app
 *   could not create the recurring reminder for you.
 * - The app stores no token and no webhook URL. Its entire state is a link people forward,
 *   and a secret in that link is a secret handed to everyone who receives it.
 *
 * `mrkdwn` is NOT Markdown. The differences this module has to get right:
 *   bold   `*one asterisk*`     (not `**two**`)
 *   italic `_underscores_`
 *   link   `<https://x|label>`  (not `[label](https://x)`)
 *   escape `&`, `<`, `>` as `&amp;`, `&lt;`, `&gt;` in any user-supplied text.
 */

/** Bold in mrkdwn is a single asterisk each side. `**x**` renders the asterisks. */
export function bold(text: string): string {
  return `*${text}*`
}

/** Italic is underscores; mrkdwn has no `*x*`-means-italic rule. */
export function italic(text: string): string {
  return `_${text}_`
}

/** Links are angle-bracketed with a pipe, not `[label](url)`. */
export function link(url: string, label: string): string {
  return `<${url}|${label}>`
}

/**
 * Escape the three characters Slack treats as control characters in mrkdwn.
 *
 * `&` first, or the ampersands of the later replacements get double-escaped.
 *
 * Escaping `&` is not cosmetic, it is what closes the hole: a name arriving from a
 * hand-crafted link can contain the literal text `&lt;!channel&gt;` or
 * `&lt;https://evil.example|Payroll&gt;`. Escape only `<` and `>` and Slack's parser turns
 * those entities back into `<` and `>`, reassembling exactly the broadcast-ping or
 * disguised-link syntax the escaping was supposed to prevent. All three, or none.
 */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Collapse newlines, tabs and other control whitespace to single spaces.
 *
 * `MAX_NAME` is the only limit the schema puts on a name, so a crafted link can put a
 * newline inside one. Left alone it breaks the aligned table's columns and — worse — lets
 * a name forge its own line in the message, e.g. a second "link" line pointing somewhere
 * else. One name is one line, always.
 */
export function flattenWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Make a fence unrepresentable in user-supplied text.
 *
 * Every run of two or more backticks collapses to one, so a three-backtick run cannot
 * survive however the pieces are later concatenated or padded. A lone backtick in a name
 * survives and is inert.
 *
 * This applies to user text *everywhere* in the message, not only inside the ``` block, and
 * both directions matter:
 *
 *  - Inside the block: code blocks do not nest and the first ``` closes the block, so a
 *    name containing one breaks out and the rest of the table renders as ordinary mrkdwn.
 *  - After the block: a ``` in the tally line opens a *new* block that swallows everything
 *    below it — including the link line, which stops being a clickable link. A name could
 *    therefore quietly strip the one thing the message exists to carry.
 */
export function codeBlockSafe(text: string): string {
  return text.replace(/`{2,}/g, '`')
}

/** User-supplied text, ready to drop anywhere in the message. */
function plain(text: string): string {
  return codeBlockSafe(escapeMrkdwn(flattenWhitespace(text)))
}

export interface SlackMessageOptions {
  /**
   * Prefix every assigned name with `@`. Off by default: turning it on pings real people.
   *
   * It is a *typed* `@handle`, which Slack's own composer linkifies when the text matches a
   * handle in the workspace. The proper `<@U01ABCDEF>` ID form is not available to us —
   * resolving a name to a member ID needs `users.list`, which needs a token and a server
   * (see the header comment). So this is a best-effort nudge, not a resolved mention.
   */
  mentions?: boolean
  /** The rotation link. Omitted or empty means no link line. */
  url?: string
}

const LINK_LABEL = 'Open or edit this rotation'

/**
 * Build a message ready to paste into Slack's composer or a Workflow Builder message step.
 *
 * Two shapes, because of a Slack rule with no way around it: `@handle` inside a ``` block
 * is not linkified. So mentions-off gets the aligned table in a code block (columns line
 * up, monospace), and mentions-on gets one plain line per slot outside any block (the
 * mentions work, the alignment is gone). See `SlackPanel` for how that is explained.
 */
export function toSlackMessage(
  state: RotationState,
  schedule: Schedule,
  formatSlot: (slot: Slot) => string,
  options: SlackMessageOptions = {},
): string {
  const mentions = options.mentions === true
  const url = options.url ?? ''

  const title = flattenWhitespace(state.title)
  const lines: string[] = [bold(title.length > 0 ? escapeMrkdwn(title) : 'Rotation')]

  if (schedule.empty) {
    lines.push('', italic('Nothing to post yet: this rotation has no names or no dates.'))
  } else {
    lines.push('')
    const dates = schedule.assignments.map((a) => formatSlot(a.slot))

    if (mentions) {
      // Outside a code block: mentions linkify, columns do not align.
      schedule.assignments.forEach((assignment, i) => {
        // Comma-separated, not space-separated: a name can be "Ada Lovelace", and
        // "@Ada Lovelace @Grace Hopper" gives no clue where one person ends.
        const who = assignment.names.map((name) => `@${plain(name)}`).join(', ')
        lines.push(`${plain(dates[i]!)} — ${who}`)
      })
    } else {
      // Inside a code block: columns align, and `@` would be inert anyway.
      const cells = dates.map((date) => plain(date))
      const width = Math.max(...cells.map((cell) => cell.length))
      lines.push('```')
      schedule.assignments.forEach((assignment, i) => {
        const who = assignment.names.map((name) => plain(name)).join(', ')
        lines.push(`${cells[i]!.padEnd(width)}  ${who}`)
      })
      lines.push('```')
    }

    // Tallies stay plain even with mentions on: one ping per person is a nudge, one ping
    // per person per occurrence is spam.
    lines.push('')
    lines.push(
      schedule.tallies.map((t) => `${plain(t.name)} ${String(t.count)}`).join(' · '),
    )
    if (!schedule.even) {
      lines.push(italic('Heads up: these dates do not split evenly between these names.'))
    }
  }

  // The link is the whole point — without it the recipient has a screenshot, not a
  // rotation they can open, edit and reshare.
  if (url.length > 0) {
    lines.push('', link(escapeMrkdwn(url), LINK_LABEL))
  }

  return lines.join('\n')
}
