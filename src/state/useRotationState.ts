import { useCallback, useEffect, useRef, useState } from 'react'
import { blobFromHash, decode, encode } from './codec'
import { decodeLegacy } from './legacy'
import { EMPTY_STATE, type RotationState } from './schema'

/**
 * The only code in the app that touches `location` (PLAN §4.1).
 *
 * - On mount: decode the hash. No hash but a v1 query string -> §3.3. Neither -> empty.
 * - On change: encode and write the hash, debounced ~300 ms. Writing history on every
 *   keystroke is slow and destroys the back button.
 * - replaceState for continuous edits (typing, dragging); pushState for discrete actions
 *   (shuffle, generate, delete-all), which makes the back button undo for free.
 * - hashchange/popstate re-seed, guarded against the echo of our own write.
 */

export const HASH_DEBOUNCE_MS = 300

/** pushState for discrete actions, replaceState for continuous ones. */
export type WriteMode = 'replace' | 'push'

export interface RotationStore {
  state: RotationState
  /** null until the async decode finishes; the UI renders a quiet skeleton meanwhile. */
  ready: boolean
  /** True when the incoming link could not be decoded. Dismissible (§3.4). */
  corrupted: boolean
  dismissCorrupted: () => void
  update: (
    next: RotationState | ((prev: RotationState) => RotationState),
    mode?: WriteMode,
  ) => void
  /** The full shareable URL for the current state, or '' before the first encode. */
  shareUrl: string
}

/**
 * The query string is deliberately dropped: the only thing that ever puts one there is a
 * v1 link, and §3.3 step 5 says to rewrite those into the `#s=` form.
 */
function currentUrlWithBlob(blob: string): string {
  const { origin, pathname } = window.location
  const base = `${origin}${pathname}`
  return blob.length > 0 ? `${base}#s=${blob}` : base
}

export function useRotationState(): RotationStore {
  const [state, setState] = useState<RotationState>(EMPTY_STATE)
  /**
   * Mirrors `state` so `update` can resolve a functional updater inside the event handler
   * rather than inside a setState callback — React StrictMode double-invokes those, and
   * this one has to schedule a timer and stage a write.
   */
  const stateRef = useRef<RotationState>(EMPTY_STATE)
  const [ready, setReady] = useState(false)
  const [corrupted, setCorrupted] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  /**
   * The last blob this hook itself wrote. The hashchange listener compares against it and
   * ignores a match — without this guard, our own write re-seeds the hook, which re-encodes,
   * which writes again (§7, "hash-write echo loop").
   */
  const lastWritten = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ state: RotationState; mode: WriteMode } | null>(null)
  /** Bumped on every external re-seed so an in-flight encode from the old state is dropped. */
  const generation = useRef(0)

  const flush = useCallback(() => {
    const job = pending.current
    if (!job) return
    pending.current = null
    const mine = ++generation.current
    void encode(job.state).then((blob) => {
      if (generation.current !== mine) return
      lastWritten.current = blob
      const url = currentUrlWithBlob(blob)
      setShareUrl(url)
      const method = job.mode === 'push' ? 'pushState' : 'replaceState'
      try {
        window.history[method](null, '', url)
      } catch {
        // Some sandboxed contexts (srcdoc iframes, file:// in a few browsers) refuse
        // history writes. The app keeps working; only the address bar goes stale.
        window.location.hash = `s=${blob}`
      }
    })
  }, [])

  const update = useCallback(
    (
      next: RotationState | ((prev: RotationState) => RotationState),
      mode: WriteMode = 'replace',
    ) => {
      const resolved = typeof next === 'function' ? next(stateRef.current) : next
      stateRef.current = resolved
      setState(resolved)
      // A push must never be downgraded to a replace by a debounce collision: if a
      // shuffle and the keystroke after it land in the same window, the entry is still
      // worth a history step.
      const merged: WriteMode = pending.current?.mode === 'push' ? 'push' : mode
      pending.current = { state: resolved, mode: merged }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, HASH_DEBOUNCE_MS)
    },
    [flush],
  )

  /** Adopt state that came from outside (mount, back/forward). Does not write history. */
  const adopt = useCallback((next: RotationState, blob: string | null) => {
    generation.current++
    pending.current = null
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    lastWritten.current = blob
    stateRef.current = next
    setState(next)
    setShareUrl(blob === null ? currentUrlWithBlob('') : currentUrlWithBlob(blob))
  }, [])

  // Mount: seed from the hash, a v1 query string, or an empty rotation.
  useEffect(() => {
    let cancelled = false
    const seed = async () => {
      const blob = blobFromHash(window.location.hash)
      if (blob !== null) {
        const decoded = await decode(blob)
        if (cancelled) return
        if (decoded) {
          adopt(decoded, blob)
        } else {
          setCorrupted(true)
          adopt(EMPTY_STATE, null)
        }
        setReady(true)
        return
      }

      const legacy = decodeLegacy(window.location.search)
      if (legacy) {
        // Rewrite the v1 link into the v2 form and drop the query string (§3.3 step 5).
        const encoded = await encode(legacy)
        if (cancelled) return
        adopt(legacy, encoded)
        try {
          window.history.replaceState(
            null,
            '',
            `${window.location.origin}${window.location.pathname}#s=${encoded}`,
          )
        } catch {
          /* address bar stays stale; the app still works */
        }
        setReady(true)
        return
      }

      if (cancelled) return
      // Nothing to restore: start empty. adopt(_, null) deliberately writes no hash, so a
      // bare visit keeps a clean URL until the first edit.
      adopt(EMPTY_STATE, null)
      setReady(true)
    }
    void seed()
    return () => {
      cancelled = true
    }
  }, [adopt])

  // Back/forward and manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      const blob = blobFromHash(window.location.hash)
      // Our own write echoing back. Ignore it, or we loop.
      if (blob === lastWritten.current) return
      if (blob === null) {
        adopt(EMPTY_STATE, null)
        return
      }
      void decode(blob).then((decoded) => {
        if (decoded) {
          adopt(decoded, blob)
        } else {
          setCorrupted(true)
        }
      })
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('popstate', onHashChange)
    }
  }, [adopt])

  // Flush a pending write if the component unmounts mid-debounce.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const dismissCorrupted = useCallback(() => {
    setCorrupted(false)
  }, [])

  return { state, ready, corrupted, dismissCorrupted, update, shareUrl }
}
