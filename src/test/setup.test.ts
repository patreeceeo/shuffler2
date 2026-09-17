import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('has Temporal available (native or polyfilled)', () => {
    expect('Temporal' in globalThis).toBe(true)
    expect(Temporal.PlainDateTime.from('2026-09-21T09:00').toString()).toBe(
      '2026-09-21T09:00:00',
    )
  })

  it('has native CompressionStream with deflate-raw', () => {
    expect(typeof CompressionStream).toBe('function')
    const cs = new CompressionStream('deflate-raw')
    expect(cs).toBeDefined()
  })
})
