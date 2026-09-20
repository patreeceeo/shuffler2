import { useRef } from 'react'
import { useCopyFeedback } from './useCopyFeedback'

/** Some chat and mail clients mangle longer links (PLAN §3.6). */
export const URL_WARN_LENGTH = 1800

interface Props {
  url: string
  /** Plain-text fallback for when the link is too long to send (§3.6). */
  textTable: string
}

export default function ShareBar({ url, textTable }: Props) {
  const { copied, copy } = useCopyFeedback<'url' | 'text'>()
  const inputRef = useRef<HTMLInputElement>(null)
  // Without clipboard access, select the link so Ctrl+C still works.
  const selectLink = () => {
    inputRef.current?.select()
  }

  const tooLong = url.length > URL_WARN_LENGTH

  return (
    <div className="share-bar">
      <label className="share-url">
        <span className="visually-hidden">Shareable link</span>
        <input ref={inputRef} type="text" readOnly value={url} spellCheck={false} />
      </label>
      <button
        type="button"
        onClick={() => {
          copy('url', url, selectLink)
        }}
        disabled={url.length === 0}
      >
        {copied === 'url' ? 'Copied' : 'Copy link'}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          copy('text', textTable, selectLink)
        }}
      >
        {copied === 'text' ? 'Copied' : 'Copy as text'}
      </button>
      <span className={tooLong ? 'char-count warn' : 'char-count'}>
        {url.length} chars
        {tooLong && (
          <>
            {' '}
            <span role="img" aria-label="warning">
              ⚠
            </span>{' '}
            some chat apps mangle links this long — &ldquo;Copy as text&rdquo; instead
          </>
        )}
      </span>
    </div>
  )
}
