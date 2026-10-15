# tests/frontend

## Purpose

Folder for `tests/frontend` implementation assets.

## Contents

- `e2e/`
- `unit/`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
Test execution is rooted from `frontend/` via `frontend/playwright.config.ts` and `frontend/vitest.config.ts`.

## Static checks

From `frontend/`, run `npm run lint:tests` and `npm run typecheck:tests`.
These cover every centralized unit test, Playwright spec, fixture and helper,
plus the frontend test configuration/setup files. `npm run lint` also includes
test lint. `npm run typecheck` checks the application and Vite projects in build
mode; a plain `tsc --noEmit` on the solution config does not check those projects.

The test projects inherit application strictness and resolve dependencies from
`frontend/node_modules`. Unit tests and setup use `tsconfig.tests.json`, with
Vitest/Node/DOM matcher types. Playwright specs and helpers use `tsconfig.e2e.json`,
with Node/Vite types and no Vitest globals. Runner configuration files use the
Node-only `tsconfig.test-tools.json`. The build-mode command checks all three
projects, and ESLint selects the matching project per file. Type declarations
are preferred over untyped package JavaScript; the parser's export-only types
entry has an explicit mapping. Imported maintenance JavaScript may be inferred
with `allowJs`; this does not disable checking of TypeScript tests.

Test lint uses type-aware correctness rules, including unhandled promises and
unsafe values. Application-only design, accessibility-markup and hot-refresh
restrictions do not apply to mocks or intentionally invalid markup fixtures.
There is no blanket lint/type suppression or accepted error baseline.

`npm run quality:test-tooling` checks file discovery, module resolution, rule
scope, runner-global isolation and coverage policy without running the application suites. CI runs the
lint, type and coverage gates independently after installation and retains all
diagnostics, even when an earlier check fails. Newly exposed debt must be fixed
or reviewed separately; a failed gate is not acceptance evidence.
