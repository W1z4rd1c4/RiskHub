# frontend/scripts/quality

## Purpose

Folder for `frontend/scripts/quality` implementation assets.

## Contents

- `debt-allowlist.json`
- `debt-budget.mjs`
- `validate-debt-budget-report.mjs`
- `validate-dora-e2e-coverage.mjs`
- `validate-no-inline-styles.mjs`

## Notes

- `debt-budget.mjs` resolves its frontend root from `--root`, then `cwd`, then the script-local frontend tree.
- Fixture and temp-worktree runs should prefer `--root=/abs/path/to/frontend-root` when executing outside that frontend directory.
- `validate-dora-e2e-coverage.mjs` checks the versioned DORA requirements against the dynamically collected Playwright `ci` project.
Keep this README updated when responsibilities or structure in this folder change.
`validate-login-dependency-graph.mjs` is the production-build structural gate for
the public login path. It rejects static protected-application, Entra/MSAL, or
inactive-locale dependencies and prints exact local raw/gzip graph measurements.
Vite writes its module-level graph to ignored `.cache/` storage; the validator
always removes it, so local filesystem paths never enter deployable `dist/`.
Those measurements are diagnostics, not a self-selected performance budget. The
separate Vite `chunkSizeWarningLimit` remains a per-chunk warning only.
