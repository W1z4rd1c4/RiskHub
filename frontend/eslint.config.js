import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Keep the rule enabled but non-blocking; the codebase still has a few
      // legitimate escape hatches where `unknown` is not ergonomic.
      '@typescript-eslint/no-explicit-any': 'warn',
      // This is a React guidance rule; in this codebase it produces false positives
      // (e.g. page-reset patterns) and blocks lint.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'src/contexts/**/*.{ts,tsx}',
      'src/test/**/*.{ts,tsx}',
      'src/components/ui/**/*.{ts,tsx}',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
