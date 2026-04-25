# Phase 253 Summary: Professionalization & AI-Signal Removal

## Status

Completed on 2026-04-25.

## Outcome

- Protected PR CI now keeps frontend correctness plus repo/security contracts in the public path, while maintainer-facing governance checks live outside the normal protected lint path.
- Public repo-surface cleanup is complete and validated by repo hygiene contracts.
- Backend app bootstrap is consolidated into `backend/app/main.py`; the deleted bootstrap facade files were not restored.
- Approval resolution routes through one public orchestration entrypoint.
- Runtime log rotation intentionally keeps both behaviors:
  - admin updates persist config and apply it immediately;
  - startup restores validated persisted config and falls back to defaults for invalid values.
- Frontend routing is complete by architectural equivalence through the central typed route registry under `frontend/src/routing/`.
- Auth/session state is grouped under `frontend/src/services/session/`, with shared API request runtime in `frontend/src/services/api/requestRuntime.ts`.
- Benchmark tests are isolated from default backend test commands and documented in testing guidance.

## Intentional Deviations From Original Plan

- The backend suppression-budget gate remains in protected CI because it is a useful low-noise quality guard and currently passes.
- Startup DB-backed log rotation was retained because admin-configured log rotation should survive application restart.
- Frontend route cleanup closed around the typed route registry rather than only default-export normalization, because the registry gives a clearer single source for route metadata and sidebar visibility.
- `authApi` remains available as a thin service object for compatibility; named internal functions can be exported later if a concrete caller needs them.

## Verification

- `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_admin_logs.py ../tests/backend/pytest/test_approval_field_whitelist.py ../tests/backend/pytest/test_approval_edit_apply.py ../tests/backend/pytest/test_approvals.py ../tests/backend/pytest/test_approval_workflow.py` -> `87 passed, 1 skipped`
- `python3 scripts/security/validate_workflow_pins.py && python3 scripts/security/validate_repo_hardening.py && python3 scripts/security/validate_public_repo_hygiene.py && python3 scripts/check_docs_contract.py && make -f scripts/Makefile quality-repo-contracts` -> passed; repo hygiene contracts `19 passed`
- `cd frontend && npm run test:run -- src/pages src/services src/contexts` -> `68 passed`, `262 tests passed`
- `cd frontend && npx tsc --noEmit` -> passed
- `cd frontend && npm run lint` -> passed with 3 pre-existing hook dependency warnings

## Follow-Ups

- Export named `authApi` functions only when a real consumer benefits from direct named imports.
- Run full frontend build and full backend suite before a release branch, outside this targeted closeout.
