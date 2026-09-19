import { useEffect, useId, useRef, useState } from 'react'
import type { Schedule } from '../lib/schedule'
import { MAX_HOURS_BEFORE, toRemindCommands } from '../lib/slack'

interface Props {
  schedule: Schedule
  /** Rotation title, used as the subject of each reminder. */
  title: string
}

/**
 * Turns the rotation into `/remind` commands to paste into Slack.
 *
 * Shuffler has no server and holds no Slack token, so it cannot create reminders itself
 * (and Slack retired the reminders API in 2023 regardless). Slash commands sidestep all of
 * it: the person pasting them is already authenticated, so nothing here needs a secret.
 *
 * Slack does not allow setting a reminder for another person, so each command targets the
 * channel and @-mentions whoever is up.
 *
 * One row per command, each with its own Copy button, because these are pasted one at a
 * time — Slack runs a slash command per message sent, so a single blob would have to be
 * re-split by hand anyway.
 */
export default function SlackPanel({ schedule, title }: Props) {
  const [channel, setChannel] = useState('')
  // Kept as a string, not a number: an <input type="number"> can legitimately be empty
  // mid-typing, and coercing that to 0 fights the user's cursor.
  const [hoursBefore, setHoursBefore] = useState('0')
  /** Index of the row whose Copy button just fired, so only that row says "Copied". */
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const channelId = useId()
  const hoursId = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputs = useRef(new Map<number, HTMLInputElement>())

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const hours = Math.min(Math.max(Math.floor(Number(hoursBefore) || 0), 0), MAX_HOURS_BEFORE)
  const commands = toRemindCommands(schedule, { channel, title, hoursBefore: hours })

  const copy = (index: number, text: string) => {
    const done = () => {
      setCopiedIndex(index)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopiedIndex(null)
      }, 1800)
    }
    // navigator.clipboard is missing on http:// origins and in some embeds; fall back to
    // selecting that row's field so Ctrl+C still works.
    const fallback = () => {
      inputs.current.get(index)?.select()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback)
    } else {
      fallback()
    }
  }

  return (
    <section className="slack-panel" aria-labelledby="slack-heading">
      <h2 id="slack-heading">Slack</h2>

      <label htmlFor={channelId} className="slack-channel">
        Channel the reminders post in
        <input
          id={channelId}
          type="text"
          value={channel}
          placeholder="#chores"
          spellCheck={false}
          onChange={(event) => {
            setChannel(event.target.value)
          }}
        />
      </label>

      <label htmlFor={hoursId} className="slack-channel">
        Hours before the turn to remind
        <input
          id={hoursId}
          type="number"
          min={0}
          max={MAX_HOURS_BEFORE}
          step={1}
          value={hoursBefore}
          onChange={(event) => {
            setHoursBefore(event.target.value)
          }}
        />
      </label>

      {commands.length === 0 ? (
        <p className="hint">
          {schedule.empty
            ? 'Add some names and some dates first.'
            : 'Enter a channel name above to generate the reminder commands.'}
        </p>
      ) : (
        <ol className="slack-commands">
          {commands.map((command, index) => (
            <li key={command} className="slack-command">
              <input
                ref={(el) => {
                  if (el) inputs.current.set(index, el)
                  else inputs.current.delete(index)
                }}
                type="text"
                readOnly
                value={command}
                spellCheck={false}
                aria-label={`Command ${String(index + 1)}`}
                onFocus={(event) => {
                  // Selecting on focus makes keyboard copying one keystroke, and there is
                  // nothing to do with a caret in a read-only field.
                  event.target.select()
                }}
              />
              <button
                type="button"
                className="secondary"
                aria-label={`Copy command ${String(index + 1)}`}
                onClick={() => {
                  copy(index, command)
                }}
              >
                {copiedIndex === index ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="hint">
        Paste these into any Slack message box, one per message — Slack runs each as you send
        it. Names are used as Slack usernames, so they need to match up in your
        workspace for the person to tagged. Lead time of 0 reminds at the turn itself; anything more shifts the reminder earlier, across midnight where needed.
      </p>
    </section>
  )
}
