import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@picocss/pico/css/pico.min.css'
import './styles.css'
import App from './App'

// Gated polyfill: Chrome 144+ and Firefox 139+ ship Temporal natively and download
// nothing. Safari (and Node 22) take the ~20 kB polyfill. This await sits in the same
// async boot as the hash decode, so it costs no extra complexity.
if (!('Temporal' in globalThis)) {
  await import('temporal-polyfill/global')
}

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
