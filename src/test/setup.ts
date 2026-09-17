// Node 22 has no native Temporal, so the polyfill is what the test suite exercises.
// Same gate as src/main.tsx, so tests and the browser take the same code path.
if (!('Temporal' in globalThis)) {
  await import('temporal-polyfill/global')
}
