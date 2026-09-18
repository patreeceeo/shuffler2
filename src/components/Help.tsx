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

      <h3>Browser history is the document history</h3>
      <p>
        Because the link is the document, every change to the document is recorded by your browser history.
        Want to undo a mistake? Just use your browser's back button. Want to redo? Forward button.
      </p>

      <h3>Names take the dates in order</h3>
      <p>
        The first date goes to the first name, the second to the second, and so on,
        starting again from the top when the names run out. So the order of the names{' '}
        <em>is</em> the rotation. Set <strong>People per slot</strong> above 1 to put more
        than one name on each date.
      </p>

      <h3>Shuffling and reordering</h3>
      <p>
        <strong>Shuffle</strong> puts the names in a new random order and the schedule
        follows. Press it as many times as you like. The order is part of the link, so it's part of the history.
      </p>
      <p>
        To arrange the names yourself, drag a row by its handle, or focus the handle and
        press space, then the arrow keys, then space again.
      </p>

      <h3>Dates</h3>
      <p>
        Build a recurring series — every week on a Tuesday at 09:00, say — and press{' '}
        <strong>Generate</strong>. Generating <em>adds</em> to the list and skips
        duplicates; it never wipes dates you already have. You can also add single dates
        one at a time, and edit or delete any of them. The list always stays in
        chronological order.
      </p>

      <h3>If the link gets long</h3>
      <p>
        A big rotation makes a long link, and past about {URL_WARN_LENGTH} characters some
        chat and mail apps break it in half. The character count next to the link warns
        you when you get there.
      </p>

      <h2>Brought to you by</h2>
      <p>
        <a href="/">Patrick Canfield.</a> <a href="venmo.com/u/Patrick-Canfield-1">Buy me a coffee</a> if this is making your life easier or you want more things like this!
      </p>
    </section>
  )
}
