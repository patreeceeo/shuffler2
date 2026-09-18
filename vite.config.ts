import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// NOTE: @vitejs/plugin-react v6 dropped its internal Babel for oxc, so the React
// Compiler runs through @rolldown/plugin-babel. The babel plugin MUST come before
// react() in the plugins array. (The installed @rolldown/plugin-babel@0.2 exposes a
// default export and takes `presets`, not the `{ babel }` / `babelConfig` shape some
// docs still show.)
export default defineConfig({
  base: './',
  server: {
    // Open the app and reload on save. Vite watches by default, so the only thing worth
    // configuring is HOW it watches.
    open: true,
    watch: {
      /*
       * Polling, on purpose.
       *
       * Native filesystem events do not cross a Windows/Linux boundary: run `npm run dev`
       * inside WSL (or a container) against a project on an NTFS drive and inotify never
       * fires for edits made by a Windows-side editor, so the page silently never reloads
       * and you end up staring at a stale bundle. The same is true of network drives and
       * some virtualised mounts. Polling is immune to all of it.
       *
       * The usual objection is CPU cost, which does not apply at this size: Vite already
       * excludes node_modules from the watcher, leaving a few dozen files in src/ to stat
       * every 300ms. If you are on a machine where native events work and you would rather
       * have them, set VITE_NO_POLL=1.
       */
      usePolling: process.env.VITE_NO_POLL !== '1',
      interval: 300,
      binaryInterval: 1000,
    },
  },
  plugins: [
    babel({
      include: /\.[jt]sx?$/,
      presets: [reactCompilerPreset()],
    }),
    react(),
  ],
  test: {
    // Default to node: the codec relies on CompressionStream and the date code on
    // Temporal, both of which are plain platform/globals work. Component tests opt in
    // with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts', './src/test/dom-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Constructing a jsdom environment costs ~25s in this VM, so a fresh one per file
    // makes the suite unusable. One forked process, environment reused across files;
    // every DOM test calls cleanup() in afterEach, which is what makes that safe.
    isolate: false,
    pool: 'forks',
    maxWorkers: 1,
  },
})
