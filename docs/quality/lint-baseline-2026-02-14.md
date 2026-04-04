# Lint Baseline Snapshot (2026-02-14)

## Scope

- Frontend: `frontend`
- Backend: `backend`

## Command Baseline

- `cd frontend && npm run lint` -> pass
- `cd frontend && npm run quality:debt` -> pass
- `cd backend && ./venv/bin/python -m ruff check .` -> pass
- `cd frontend && npm run cleanup:deadcode` -> pass

## Ruff Configuration Baseline

Source: `backend/ruff.toml`

- `select = ["E", "F", "W", "I"]`
- `ignore = ["E402", "E501", "E712", "W291", "W293"]` (baseline before ratchet)
- `exclude = ["alembic", "tests", "app/tests", "scripts", "venv", "coverage_html", "logs"]`

## Dead-Code Audit Baseline

Sources:
- `frontend/cleanup-audit/unreachable.md`
- `frontend/cleanup-audit/dormant.md`

- Unreachable candidates: `0`
- Dormant pages: `1` (`DirectoryEmulatorPage`)

## Notes

- This file is a pre-ratchet snapshot for Sweep 4.
- Subsequent ratchet waves must update quality docs if the lint contract changes.
- Post Wave A in this sweep: `W291` and `W293` were removed from `ignore` in `backend/ruff.toml`.
