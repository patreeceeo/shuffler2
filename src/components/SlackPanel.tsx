import { useEffect, useRef, useState } from 'react'
import { toSlackMessage } from '../lib/slack'
import type { Schedule } from '../lib/schedule'
import type { RotationState, Slot } from '../state/schema'

interface Props {
  state: RotationState
  schedule: Schedule
  formatSlot: (slot: Slot) => string
  /** The rotation link, or '' before the first encode. */
  url: string
}

/**
 * The Slack tab: a message you paste, not an integration.
 *
 * Why there is no "Post to Slack" button here, in short (PLAN §12 has the long version):
 * the Slack Web API sends no CORS headers so a static page cannot call it, `reminders.add`
 * has been retired since 2023, and posting from the browser would need a token or webhook
 * URL stored in a link that people forward — i.e. handing posting rights to every
 * recipient. So this panel makes the manual path fast and correct instead. It issues no
 * network requests of any kind.
 */
export default function SlackPanel({ state, schedule, formatSlot, url }: Props) {
  const [mentions, setMentions] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const message = toSlackMessage(state, schedule, formatSlot, { mentions, url })

  const fallbackSelect = () => {
    areaRef.current?.select()
  }

  const copy = () => {
    const done = () => {
      setCopied(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(false)
      }, 1800)
    }
    // Same fallback as ShareBar: navigator.clipboard is missing on http:// origins and in
    // some embeds, so select the field and let the user hit Ctrl+C.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(message).then(done, fallbackSelect)
    } else {
      fallbackSelect()
    }
  }

  return (
    <section className="slack-panel" aria-labelledby="slack-heading">
      <h2 id="slack-heading">Post this to Slack</h2>
      <p>
        Shuffler cannot post to Slack itself — it has no server and holds no Slack token,
        by design. What it can do is hand you a message that is already formatted the way
        Slack wants, link included. Copy it, paste it in the channel.
      </p>

      <label className="slack-mentions">
        <input
          type="checkbox"
          checked={mentions}
          onChange={(event) => {
            setMentions(event.target.checked)
          }}
        />{' '}
        Add <code>@</code> before each name —{' '}
        <strong>this will notify those people</strong> every time the message is posted
      </label>
      <p className="hint">
        {mentions
          ? 'Slack turns @name into a real mention only when it matches that person’s Slack handle — check the names before you post. Mentions do not work inside a code block, so the schedule is plain lines here and the columns no longer line up.'
          : 'Off: the schedule goes in a code block, so the columns line up and nobody is notified.'}
      </p>

      <label className="slack-message">
        <span className="visually-hidden">Slack message</span>
        <textarea ref={areaRef} readOnly value={message} rows={12} spellCheck={false} />
      </label>
      <button type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy message'}
      </button>

      <h3>Posting it every week</h3>
      <p>
        Slack can repeat the post for you; Shuffler is not involved and schedules nothing.
        In Slack, open <strong>Automations → Workflow Builder</strong> and create a
        workflow:
      </p>
      <ol>
        <li>
          Start it <strong>on a schedule</strong> — pick the day, the time and how often
          it repeats.
        </li>
        <li>
          Add the step <strong>Send a message to a channel</strong> and choose the
          channel.
        </li>
        <li>Paste the message above into the message box, then publish the workflow.</li>
      </ol>
      <p className="hint">
        Slack moves this wording around between releases, so the labels may not match
        exactly. Two things worth knowing: the workflow posts the <em>same</em> text every
        time, so if you add dates later, paste a fresh copy into it — and if you only want
        one plain line, <code>/remind</code> still works, though it mangles code blocks.
        Slack&rsquo;s reminders <em>API</em> was retired in 2023, which is part of why
        even an app with a token could not set this up for you.
      </p>
    </section>
  )
}
