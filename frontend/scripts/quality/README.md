# frontend/scripts/quality

## Purpose

Folder for `frontend/scripts/quality` implementation assets.

## Contents

- `debt-allowlist.json`
- `debt-budget.mjs`
- `test-tooling.test.mjs`
- `ui-consistency-baseline.json`
- `ui-consistency-ratchet.mjs`
- `validate-debt-budget-report.mjs`
- `validate-dora-e2e-coverage.mjs`
- `validate-font-assets.mjs`
- `validate-login-dependency-graph.mjs`
- `validate-no-inline-styles.mjs`

## Notes

- `test-tooling.test.mjs` (`npm run quality:test-tooling`) verifies centralized
  frontend test discovery, typed lint/module resolution and the coverage
  denominator/floors without running application suites.

- `validate-font-assets.mjs` runs after production builds and requires every vendored WOFF2
  file to be emitted byte-for-byte, present in the Vite manifest, and referenced by built CSS.
  It rejects missing assets and unresolved font URLs instead of accepting a fallback font.

- `debt-budget.mjs` resolves its frontend root from `--root`, then `cwd`, then the script-local frontend tree.
- Fixture and temp-worktree runs should prefer `--root=/abs/path/to/frontend-root` when executing outside that frontend directory.
- `validate-dora-e2e-coverage.mjs` checks the versioned DORA requirements against the dynamically collected Playwright `ci` project.
- `ui-consistency-ratchet.mjs` (`npm run quality:ui-ratchet`, G-RATCHET) counts design-system debt patterns per file
  in `src/**` (tests excluded). Every pattern is a hard zero except the allowlisted ones (each allowlisted file names
  its reason in the script), whose counts live in `ui-consistency-baseline.json` and may only go down.
  `--update-baseline` locks in decreases and refuses increases unless `--force` (pure file moves only). Runs in
  `lint.yml` and `maintenance-governance.yml`.
Keep this README updated when responsibilities or structure in this folder change.
`validate-login-dependency-graph.mjs` is the production-build structural gate for
the public login path. It rejects static protected-application, Entra/MSAL, or
inactive-locale dependencies and prints exact local raw/gzip graph measurements.
Vite writes its module-level graph to ignored `.cache/` storage; the validator
always removes it, so local filesystem paths never enter deployable `dist/`.
Those measurements are diagnostics, not a self-selected performance budget. The
separate Vite `chunkSizeWarningLimit` remains a per-chunk warning only.
