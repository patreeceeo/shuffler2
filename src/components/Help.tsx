import { URL_WARN_LENGTH } from './ShareBar'

/**
 * Deliberately plain prose. Every claim here has to stay true of the app: if a behaviour
 * changes, this text changes with it.
 */
export default function Help() {
  return (
    <section className="help" aria-labelledby="help-heading">
      <h2 id="help-heading">How this works</h2>

      <h3>The link is the document</h3>
      <p>
        There is no account and no server. The whole rotation — names, dates, title — is
        packed into the link in your address bar, which updates as you type. Copy it to
        share the rotation or to keep it; bookmark it and you have saved your work. Anyone
        who opens it sees exactly what you see, and can edit their own copy without
        affecting yours.
      </p>
      <p>
        Because the rotation lives after the <code>#</code> in the link, it never reaches a
        web server. Nothing you type here is uploaded anywhere.
      </p>

      <h3>Names take the dates in order</h3>
      <p>
        The first date goes to the first name, the second to the second, and so on,
        starting again from the top when the names run out. So the order of the names{' '}
        <em>is</em> the rotation. Set <strong>People per slot</strong> above 1 to put more
        than one name on each date.
      </p>
      <p>
        The tally under the schedule shows how many turns each person has. Round-robin
        only comes out even when the number of dates divides by the number of names, so
        the schedule tells you when it does not rather than hiding it.
      </p>

      <h3>Shuffling and reordering</h3>
      <p>
        <strong>Shuffle</strong> puts the names in a new random order and the schedule
        follows. Press it as many times as you like — your browser&rsquo;s back button
        undoes each shuffle, because every shuffle is a step in your history.
      </p>
      <p>
        To arrange the names yourself, drag a row by its handle, or focus the handle and
        press space, then the arrow keys, then space again. A manual order is a
        correction, not a pin: shuffling afterwards replaces it.
      </p>

      <h3>Dates</h3>
      <p>
        Build a recurring series — every week on a Tuesday at 09:00, say — and press{' '}
        <strong>Generate</strong>. Generating <em>adds</em> to the list and skips
        duplicates; it never wipes dates you already have. You can also add single dates
        one at a time, and edit or delete any of them. The list always stays in
        chronological order.
      </p>
      <p>
        Times carry no timezone on purpose. 09:00 reads as 09:00 for everyone who opens
        the link, wherever they are — right for a household chore chart, wrong for a
        rotation spread across countries.
      </p>

      <h3>If the link gets long</h3>
      <p>
        A big rotation makes a long link, and past about {URL_WARN_LENGTH} characters some
        chat and mail apps break it in half. The character count next to the link warns
        you when you get there. <strong>Copy as text</strong> gives you a plain table to
        paste instead.
      </p>

      <h3>Starting over</h3>
      <p>
        <strong>Reset</strong> empties everything and clears the link. If you did not mean
        to, the back button brings it all back.
      </p>
    </section>
  )
}
