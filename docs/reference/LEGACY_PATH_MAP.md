# Legacy Path Map

> Historical reference only. Current startup and operational guidance lives in
> [`docs/development/README.md`](../development/README.md).

This repository was restructured to centralize tests and move operational entrypoints under `scripts/`.

## Canonical path changes

- `backend/tests/` -> `tests/backend/pytest/`
- `frontend/e2e/` -> `tests/frontend/e2e/`
- `frontend/tests/` -> `tests/frontend/e2e/legacy/`
- `frontend/src/**/*.test|spec` -> `tests/frontend/unit/src/**/*.test|spec`
- `frontend/src/test/` -> `tests/frontend/unit/src/test/`
- `Makefile` -> `scripts/Makefile`
- legacy Docker/dev setup entrypoints -> `scripts/compose.sh`
- `test-results/` -> `tests/results/legacy/test-results/`
- `coverage_html/` -> `tests/results/legacy/coverage_html/`

## Notes

- Historical planning archives under `.planning/phases/` may still reference legacy paths.
- Runtime and CI contracts should follow the active docs in `docs/development/README.md`, not this archive note.
- JS test suites under `tests/frontend/` resolve package dependencies through `tests/frontend/node_modules` (symlink to `../../frontend/node_modules`).
