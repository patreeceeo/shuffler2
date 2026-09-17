import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  // React Compiler + Rules of React live here now (NOT eslint-plugin-react-compiler).
  // v7 moved the flat-config presets under .configs.flat.*
  reactHooks.configs.flat['recommended-latest'],
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'prettier.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // PLAN §7: toISOString() creeping back in is the exact bug v1 shipped.
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'toISOString',
          message:
            'toISOString() converts to UTC and renders user-facing dates a day early west of Greenwich. Format from local fields via lib/dates.ts.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='toISOString']",
          message:
            'toISOString() converts to UTC (v1 bug). Use formatters in lib/dates.ts, which read local Y/M/D fields.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Name/title text comes from an untrusted URL. dangerouslySetInnerHTML reopens v1 stored XSS.',
        },
      ],
    },
  },
  // The flat config itself is plain JS; type-aware rules have nothing to chew on.
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
)
