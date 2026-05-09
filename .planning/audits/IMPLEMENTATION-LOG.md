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
