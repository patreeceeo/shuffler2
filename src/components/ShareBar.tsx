import { useEffect, useRef, useState } from 'react'

/** Some chat and mail clients mangle longer links (PLAN §3.6). */
export const URL_WARN_LENGTH = 1800

interface Props {
  url: string
  /** Plain-text fallback for when the link is too long to send (§3.6). */
  textTable: string
}

export default function ShareBar({ url, textTable }: Props) {
  const [copied, setCopied] = useState<'url' | 'text' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const copy = (what: 'url' | 'text', text: string) => {
    const done = () => {
      setCopied(what)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(null)
      }, 1800)
    }
    // navigator.clipboard is unavailable on http:// origins and in some embeds; fall back
    // to selecting the field so the user can still hit Ctrl+C.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, fallbackSelect)
    } else {
      fallbackSelect()
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const fallbackSelect = () => {
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
          copy('url', url)
        }}
        disabled={url.length === 0}
      >
        {copied === 'url' ? 'Copied' : 'Copy link'}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          copy('text', textTable)
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
