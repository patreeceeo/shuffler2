import { useEffect, useRef, useState } from 'react'

/** How long a button reads "Copied" before reverting. */
export const COPIED_FLASH_MS = 1800

/**
 * Clipboard copy with a short "Copied" flash, shared by the Share and Slack panels.
 *
 * `copied` is the key of whatever was copied last (a button name, a row index) and resets
 * to null after COPIED_FLASH_MS, so only the button that fired says "Copied".
 *
 * `navigator.clipboard` is missing on http:// origins and in some embeds, and writeText
 * can be refused. Either way `onFallback` runs instead — callers use it to select the
 * text in its field so the user can still press Ctrl+C.
 */
export function useCopyFeedback<K>() {
  const [copied, setCopied] = useState<K | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const copy = (key: K, text: string, onFallback: () => void) => {
    const done = () => {
      setCopied(key)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(null)
      }, COPIED_FLASH_MS)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, onFallback)
    } else {
      onFallback()
    }
  }

  return { copied, copy }
}
