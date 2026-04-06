# frontend/scripts/quality

## Purpose

Folder for `frontend/scripts/quality` implementation assets.

## Contents

- `debt-allowlist.json`
- `debt-budget.mjs`

## Notes

- `debt-budget.mjs` resolves its frontend root from `--root`, then `cwd`, then the script-local frontend tree.
- Fixture and temp-worktree runs should prefer `--root=/abs/path/to/frontend-root` when executing outside that frontend directory.
Keep this README updated when responsibilities or structure in this folder change.
