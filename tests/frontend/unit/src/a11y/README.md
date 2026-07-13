# tests/frontend/unit/src/a11y

Vitest unit tests guarding accessibility invariants: an aria-label sweep across
rendered surfaces (`ariaLabelSweep.test.tsx`) and contracts that pin the
`jsx-a11y` ESLint severity, strict-zero evidence policy, and Playwright a11y
collection (`eslintConfigJsxA11ySeverity.test.ts`,
`jsxA11yZeroPolicy.test.ts`, `playwrightA11yCollection.test.ts`).
