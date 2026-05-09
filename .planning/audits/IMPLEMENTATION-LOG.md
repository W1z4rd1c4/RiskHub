# RiskHub Architecture Cleanup Implementation Log

## Pre-flight Baseline

- Started: 2026-05-09
- Baseline SHA: `18f42150980d998c2454bc0b5ab8027ebfee2138`
- Branch: `main`
- Plan: `.planning/audits/resolution-plan.md`
- Status: in progress

### Baseline Gates

- `git status --short --branch`: clean at baseline capture
- `make -f scripts/Makefile test-architecture-locks`: passed (`65 passed`, 1 snapshot passed)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `pytest -m contract`: passed under backend venv activation (`109 passed`, `1708 deselected`, 1 warning)
- `ruff check backend/app`: passed under backend venv activation (`All checks passed!`)
- `mypy backend/app`: baseline captured under backend venv activation (`8 errors in 6 files`)

### Baseline Environment Notes

- Default shell `pytest` resolved to system Python 3.13 and failed importing `syrupy`.
- Backend venv pytest resolved to `backend/venv/bin/pytest` and passed the contract gate.
- Default shell had no `ruff`; backend venv provided `ruff`.
- Baseline mypy error count for delta tracking: 8.

## Wave 1 — ADRs Ratified

- Completed: 2026-05-09 19:41:11 CEST
- Commit SHA: recorded by the Wave 1 commit containing this entry
- Items completed: `#72`, `#73`, `#74a`, `#10`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#74a`: used `_bounded_context_cross_cutting.toml`, not a `core` registry.
- `#74a`: paired `_orphaned_items` and `_notification_inbox` with `_identity_access_lifecycle`.
- `#73`: removed duplicate `REPORTING_GRACE_DAYS = 15` from `_config/lookup.py` and kept `_kri_history/constants.py` as SSOT.
- `#10`: corrected the frontend caller path to `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx`.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`84 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`128 passed`, `1708 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1803 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- Frontend gates: not run; Wave 1 did not edit frontend files
