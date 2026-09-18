import { useEffect, useId, useRef, useState } from 'react'
import type { Schedule } from '../lib/schedule'
import { toRemindScript } from '../lib/slack'

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
 */
export default function SlackPanel({ schedule, title }: Props) {
  const [channel, setChannel] = useState('')
  const [copied, setCopied] = useState(false)
  const channelId = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const script = toRemindScript(schedule, { channel, title })
  const hasCommands = !schedule.empty && channel.trim().length > 0

  const copy = () => {
    const done = () => {
      setCopied(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(false)
      }, 1800)
    }
    // navigator.clipboard is missing on http:// origins and in some embeds; fall back to
    // selecting the field so Ctrl+C still works.
    const fallback = () => {
      textRef.current?.select()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(script).then(done, fallback)
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

      <label className="slack-message">
        <span className="visually-hidden">Slack /remind commands</span>
        <textarea
          ref={textRef}
          readOnly
          rows={Math.min(14, Math.max(4, schedule.empty ? 4 : schedule.assignments.length + 1))}
          value={script}
          spellCheck={false}
        />
      </label>

      <button type="button" onClick={copy} disabled={!hasCommands}>
        {copied ? 'Copied' : 'Copy commands'}
      </button>

      <p className="hint">
        Paste these into any Slack message box, one at a time — Slack runs each as you send
        it. Names are used as Slack usernames, so they need to match the handles in your
        workspace. Slack does not let you set a reminder for someone else, so each reminder
        posts in the channel and @-mentions whoever is up.
      </p>
    </section>
  )
}
