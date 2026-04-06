# Plan 252-02 Summary: Gate Ratchet Before Frontend Refactors

## Completed

- Enabled blocking frontend TypeScript safety rules:
  - `@typescript-eslint/no-unsafe-argument`
  - `@typescript-eslint/no-unsafe-assignment`
  - `@typescript-eslint/no-unsafe-return`
  - `@typescript-eslint/prefer-promise-reject-errors`
  - `@typescript-eslint/require-await`
- Fixed the full measured baseline across the known offender files by:
  - replacing untyped skeleton array spreads with typed `Array.from(...)`
  - tightening JSON parsing in `apiClient.ts` and `authApi.ts`
  - removing the unnecessary `async` from `UserNewPage` directory-import navigation
  - normalizing Promise rejection values in `authRequest.ts`
  - adding `frontend/src/env.d.ts` so `import.meta.env.VITE_API_URL` is typed
- Added frontend coverage tooling and blocking thresholds:
  - installed `@vitest/coverage-v8`
  - added coverage thresholds in `frontend/vitest.config.ts`
  - switched the `frontend-unit-tests` CI job in `.github/workflows/lint.yml` to `npm run test:coverage`
- Added backend typing and touched-file lint ratchets:
  - added `mypy` to `backend/requirements-dev.txt`
  - added `backend/mypy.ini`
  - added blocking mypy CI for the Phase 252 backend files only
  - added blocking touched-file Ruff `UP`/`SIM` CI for the Phase 252 backend files only
- Added backend coverage enforcement:
  - set `--cov-fail-under=69` in `backend/pytest.ini` based on the measured backend total coverage of `69.90%`
- Updated `docs/quality/lint-ratchet-status.md` to document the Phase 252 touched-file ratchet and the explicit exclusion of repo-wide `B` enforcement.
- Updated the workflow contract test to reflect the new blocking frontend coverage job.

## Verification

- `cd frontend && npm run lint` -> passed
- `cd frontend && npx tsc --noEmit` -> passed
- `cd frontend && npm run test:coverage` -> `83 files passed`, `290 tests passed`, coverage gate passed with:
  - statements: `57.02%` (threshold `57`)
  - branches: `47.17%` (threshold `47`)
  - functions: `47.57%` (threshold `47`)
  - lines: `58.67%` (threshold `58`)
- `cd backend && ./venv/bin/mypy --config-file mypy.ini app/core/activity_logger.py app/core/activity_redaction.py app/bootstrap_runtime.py app/bootstrap_validation.py` -> passed
- `cd backend && ./venv/bin/ruff check app/core/activity_logger.py app/core/activity_redaction.py app/bootstrap_runtime.py app/bootstrap_validation.py --select UP,SIM` -> passed
- `make -f scripts/Makefile test` -> `922 passed, 15 skipped`, backend coverage gate passed at `69.90%`

## Notes

- The initial backend fail-under of `70` was too high because `pytest-cov` evaluates the real total as `69.90%`; the threshold was corrected to `69` after measurement.
- The initial CI workflow contract test expected `npm run test:run`; it was updated to match the new blocking coverage gate.
- Structural ESLint rules (`no-console`, `max-lines`, `max-lines-per-function`, `complexity`) were applied to the new Phase 252-owned directories immediately. Façade enforcement is explicitly phased: every Phase 252 façade file is covered by `no-console`, strict façade caps apply as soon as that façade has been decomposed, and the still-monolithic façades stay on temporary no-growth file-size caps until their corresponding decomposition waves land.
