

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
 *
 * Four things keep it from becoming a liability:
 *  - width/height are fixed, so it reserves its box and cannot shift the toolbar as it loads
 *  - onError hides it, so a changed or blocked Tenor URL leaves a gap rather than a broken
 *    image icon in the middle of the top bar
 *  - CSS hides it under prefers-reduced-motion: a looping GIF is moving content that cannot
 *    be paused (WCAG 2.2.2), and since it carries no information, hiding it costs nothing
 *  - alt="" + aria-hidden keep it out of the accessibility tree entirely
 *
 * It is the app's only third-party runtime request. If that ever matters more than the
 * joke, Tenor also publishes mp4/webm variants, and a muted looping <video> would be both
 * smaller and actually pausable.
 */
const MASCOT_SRC =
  'hardstyle.gif'


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
