interface Props {
  title: string
  onTitleChange: (title: string) => void
  onShuffle: () => void
  onReset: () => void
  canShuffle: boolean
}

/**
 * Purely decorative mascot (a hardstyle shuffle loop), hotlinked from Tenor. This is the
 * 220x124 variant the share page declares as its og:image, not the 498x280 or 640x360 ones
 * -- it renders at 3rem tall, so the bigger files buy nothing but bytes.
 *
 *  - alt="" + aria-hidden keep it out of the accessibility tree entirely
 *  - CSS hides it under prefers-reduced-motion: a looping GIF is moving content that cannot
 *    be paused (WCAG 2.2.2), and since it carries no information, hiding it costs nothing
 *
 * Deliberately NOT handled, since this is only a joke: there are no width/height attributes,
 * so the toolbar shifts slightly when the GIF lands, and no onError, so a dead Tenor URL
 * shows a broken-image icon. Both are two lines away if they ever become annoying.
 *
 * It is the app's only third-party runtime request. If that ever matters more than the
 * joke, Tenor also publishes mp4/webm variants, and a muted looping <video> would be both
 * smaller and actually pausable.
 */
const MASCOT_SRC =
  'https://media.tenor.com/5Y9zxgcoTWEAAAAM/hardstyle-shuffle-hardstyle.gif'

export default function Toolbar({
  title,
  onTitleChange,
  onShuffle,
  onReset,
  canShuffle,
}: Props) {
  return (
    <div className="toolbar">
      <img
        className="mascot"
        src={MASCOT_SRC}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
      <input
        type="text"
        className="title-input"
        value={title}
        placeholder="Rotation title…"
        aria-label="Rotation title"
        onChange={(event) => {
          onTitleChange(event.target.value)
        }}
      />
      <button type="button" onClick={onShuffle} disabled={!canShuffle}>
        ⟳ Shuffle
      </button>
      <button type="button" className="secondary outline" onClick={onReset}>
        ⤫ Reset
      </button>
    </div>
  )
}
