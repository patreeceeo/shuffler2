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
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
