import mascotUrl from '../assets/mascot.gif'

interface Props {
  title: string
  onTitleChange: (title: string) => void
  onShuffle: () => void
  onReset: () => void
  canShuffle: boolean
}

/**
 * Purely decorative mascot (a hardstyle shuffle loop), served from our own assets so the
 * app makes no third-party requests at all. Imported rather than referenced from public/,
 * so Vite hashes it for cache-busting and rewrites the URL for whatever `base` we deploy at.
 *
 * It is a deliberately small derivative of the 640x360 original: 160x90, 10fps, 3s, 32
 * colours, ~208KB. It renders 48px tall, so that is ~1.9x pixel density -- the full-size
 * source was 22MB, which is two orders of magnitude of bytes for no visible difference.
 *
 *  - alt="" + aria-hidden keep it out of the accessibility tree
 *  - CSS hides it under prefers-reduced-motion: a looping GIF is moving content that cannot
 *    be paused (WCAG 2.2.2), and since it carries no information, hiding it costs nothing
 *
 * No width/height attributes and no onError, so the toolbar shifts a little when it lands.
 * Both are two lines away if that becomes annoying.
 */
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
        src={mascotUrl}
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
