# Plan 500-07 Summary: Smoke Test + Regression Verification Target

## Completed: 2026-02-16

### Scope Delivered

- Added a Phase 500 smoke test that asserts:
  - frontend responds on `FRONTEND_HOST_PORT`,
  - backend health is reachable via frontend `/api` proxy and reports `healthy/connected`,
  - backend `/docs` and `/openapi.json` are disabled in production (checked inside the backend container).
- Added a read-only diagnostics helper (`verify_runtime.sh`) for operator troubleshooting.
- Added a repo verification entrypoint:
  - `make verify-prod-install-scripts` runs:
    - `bash -n` over scripts,
    - dockerized `shellcheck` over scripts,
    - `cd backend && venv/bin/pytest tests/test_production_hardening.py -q`

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/smoke_test.sh` | NEW |
| `scripts/prod/verify_runtime.sh` | NEW |
| `Makefile` | MODIFY |

### Verification

- `make verify-prod-install-scripts` → passed (`10 passed` in `tests/test_production_hardening.py`)
- `docker run --rm -v "$PWD":/work -w /work koalaman/shellcheck:stable -x scripts/prod/*.sh` → no findings

### Outcome

The Phase 500 install scripts have a repeatable validation loop and a minimal smoke check that proves external DB connectivity via the production health endpoint and confirms production hardening behavior.

