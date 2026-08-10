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
