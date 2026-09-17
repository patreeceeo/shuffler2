interface Props {
  title: string
  onTitleChange: (title: string) => void
  onShuffle: () => void
  onReset: () => void
  canShuffle: boolean
}

export default function Toolbar({
  title,
  onTitleChange,
  onShuffle,
  onReset,
  canShuffle,
}: Props) {
  return (
    <div className="toolbar">
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
