/// <reference types="vite/client" />

// Temporal is not in TypeScript's built-in libs yet. `temporal-polyfill/global` ships
// its runtime but empty types; the spec types live in temporal-spec/global, which this
// import pulls into the global scope. At runtime we only load the polyfill when the
// engine lacks Temporal (see src/main.tsx), so Chrome/Firefox pay nothing.
import 'temporal-polyfill/types/global'
