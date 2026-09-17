import { MAX_SLOTS, normalizeSlots, validate, type RotationState } from './schema'

/**
 * Wire format (PLAN §3.2). Positional tuple — keys cost bytes:
 *
 *   tuple  = [2, title, names, groupSize, anchor, deltas]
 *   anchor = minutes since 1970-01-01T00:00 of slots[0], read as naive local time
 *   deltas = [slots[1]-slots[0], slots[2]-slots[1], ...] in minutes
 *
 * JSON.stringify -> deflate-raw -> base64url.
 *
 * Delta encoding earns its keep: a weekly rotation is [10080, 10080, 10080, ...], which
 * deflate crushes to nothing.
 *
 * `v` is first so a decoder can branch before it knows the shape. Never renumber; only
 * append.
 */
export const WIRE_VERSION = 2

type Tuple = [number, string, string[], number, number | null, number[]]

const MINUTES_PER_DAY = 1440

/**
 * Minutes from 1970-01-01T00:00 in *naive* local time — a pure calendar count with no
 * timezone anywhere in it. Deliberately not Date.parse/getTime: those apply a zone offset,
 * which would make the same link decode differently in Berlin and in Denver (§3.5).
 */
export function slotToMinutes(slot: string): number {
  const year = Number(slot.slice(0, 4))
  const month = Number(slot.slice(5, 7))
  const day = Number(slot.slice(8, 10))
  const hour = Number(slot.slice(11, 13))
  const minute = Number(slot.slice(14, 16))
  return daysFromCivil(year, month, day) * MINUTES_PER_DAY + hour * 60 + minute
}

export function minutesToSlot(total: number): string {
  const days = Math.floor(total / MINUTES_PER_DAY)
  const rest = total - days * MINUTES_PER_DAY
  const { year, month, day } = civilFromDays(days)
  const hour = Math.floor(rest / 60)
  const minute = rest - hour * 60
  return (
    `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` +
    `T${pad(hour, 2)}:${pad(minute, 2)}`
  )
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

/** Howard Hinnant's days_from_civil — exact integer calendar math, no Date involved. */
function daysFromCivil(y: number, m: number, d: number): number {
  const year = m <= 2 ? y - 1 : y
  const era = Math.floor(year / 400)
  const yoe = year - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Inverse of daysFromCivil. */
function civilFromDays(z: number): { year: number; month: number; day: number } {
  const shifted = z + 719468
  const era = Math.floor(shifted / 146097)
  const doe = shifted - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) /
      365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  return { year: m <= 2 ? y + 1 : y, month: m, day: d }
}

export function toTuple(state: RotationState): Tuple {
  const slots = normalizeSlots(state.slots)
  const first = slots[0]
  if (first === undefined) {
    return [WIRE_VERSION, state.title, state.names, state.groupSize, null, []]
  }
  const anchor = slotToMinutes(first)
  let prev = anchor
  const deltas: number[] = []
  for (let i = 1; i < slots.length; i++) {
    const cur = slotToMinutes(slots[i]!)
    deltas.push(cur - prev)
    prev = cur
  }
  return [WIRE_VERSION, state.title, state.names, state.groupSize, anchor, deltas]
}

/** Never throws — returns null for anything that is not a well-formed tuple. */
export function fromTuple(tuple: unknown): RotationState | null {
  if (!Array.isArray(tuple)) return null
  const [version, title, names, groupSize, anchor, deltas] = tuple as unknown[]
  if (version !== WIRE_VERSION) return null
  if (typeof anchor !== 'number' && anchor !== null) return null
  if (!Array.isArray(deltas)) return null
  if (deltas.length + 1 > MAX_SLOTS) return null

  const slots: string[] = []
  if (typeof anchor === 'number') {
    if (!Number.isSafeInteger(anchor)) return null
    let cur = anchor
    slots.push(minutesToSlot(cur))
    for (const delta of deltas as unknown[]) {
      if (typeof delta !== 'number' || !Number.isSafeInteger(delta)) return null
      cur += delta
      // Anything outside a plausible calendar range is a corrupted or hostile link.
      if (cur < MIN_MINUTES || cur > MAX_MINUTES) return null
      slots.push(minutesToSlot(cur))
    }
  } else if (deltas.length > 0) {
    return null
  }

  return validate({ v: WIRE_VERSION, title, names, slots, groupSize })
}

// 0001-01-01T00:00 .. 9999-12-31T23:59, the range the "YYYY-..." slot format can express.
const MIN_MINUTES = slotToMinutes('0001-01-01T00:00')
const MAX_MINUTES = slotToMinutes('9999-12-31T23:59')

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

type Bytes = Uint8Array<ArrayBuffer>

async function pipeThrough(
  bytes: Bytes,
  stream: CompressionStream | DecompressionStream,
): Promise<Bytes> {
  const writer = stream.writable.getWriter()
  // The write/close promises reject when the stream errors (a truncated blob makes zlib
  // raise Z_BUF_ERROR). Swallow them here: the read below rejects with the same error and
  // that is the one decode()'s try/catch is positioned to see. Without this the rejection
  // is unhandled and surfaces as a process-level error long after decode returned null.
  const written = writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => undefined)
  const chunks: Bytes[] = []
  let total = 0
  const reader = stream.readable.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value
      chunks.push(chunk)
      total += chunk.byteLength
    }
  } finally {
    await written
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export function bytesToBase64Url(bytes: Bytes): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Throws on malformed input; every caller is inside decode()'s try/catch. */
export function base64UrlToBytes(text: string): Bytes {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * State -> the opaque blob that goes after `#s=`. Async because CompressionStream is;
 * the write path is debounced behind a 300 ms timer anyway, so that costs nothing (§3.2).
 */
export async function encode(state: RotationState): Promise<string> {
  const json = JSON.stringify(toTuple(state))
  const deflated = await pipeThrough(
    textEncoder.encode(json),
    new CompressionStream('deflate-raw'),
  )
  return bytesToBase64Url(deflated)
}

/**
 * Blob -> state. **Never throws** (PLAN §3.4). A hash can be hand-edited, truncated by a
 * chat client, or come from an older build; every one of those paths returns null and the
 * caller shows the "that link looked corrupted" notice.
 */
export async function decode(
  blob: string | null | undefined,
): Promise<RotationState | null> {
  if (typeof blob !== 'string' || blob.length === 0) return null
  try {
    const inflated = await pipeThrough(
      base64UrlToBytes(blob),
      new DecompressionStream('deflate-raw'),
    )
    const parsed: unknown = JSON.parse(textDecoder.decode(inflated))
    return fromTuple(parsed)
  } catch {
    return null
  }
}

/** Reads the `s` parameter out of a location hash. Never throws. */
export function blobFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (raw.length === 0) return null
  try {
    const value = new URLSearchParams(raw).get('s')
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}
