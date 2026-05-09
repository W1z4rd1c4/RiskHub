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

## Wave 2 — P1/P2 Cleanup

- Completed: 2026-05-09 20:21:52 CEST
- Commit SHA: recorded by the Wave 2 commit containing this entry
- Items completed: `#57`, `#37`, `#12`, `#13`, `#1`, `#19`, `#11`, `#14`, `#15`, `#76`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#37`: completed before `#12` so the shell summary capability extraction landed before exception tightening.
- `#13`: removed `vendor_link_helpers.py` citations from the authorization contract artifacts.
- `#19`: used the current `_entity_mutation_lifecycle.policy.validate_risk_type` helper instead of the stale recipe path.
- `#14`: removed the live `endpoints/issues/_shared/notifications.py` in-process helper and kept outbox emitters as the only notification path.
- `#15`: used the current capability catalog `id`/`fields` shape and made `access_user.capabilities` required across backend and frontend contracts.
- `#76`: kept the auth-flow endpoint commit cleanup inside the Wave 2 commit despite the recipe's internal multi-commit note.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`100 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`144 passed`, `1724 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1835 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `cd frontend && npm run test:run`: passed (`163 passed`, `734 tests passed`)
- `cd frontend && npm run lint`: passed
- Fix-forward attempts: 1; the first frontend unit gate exposed stale access-user fixtures that still omitted required capability fields, then the full gate was restarted and passed.

## Wave 3 — P2 Dead-Code A

- Completed: 2026-05-09 21:03:31 CEST
- Commit SHA: recorded by the Wave 3 commit containing this entry
- Items completed: `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#41`, `#50`, `#52`, `#53`, `#54`, `#75`, `#18`, `#20`
- Items failed: none
- Elapsed time: current session wave execution

### Phase 4 Corrections Honored

- `#2`: used the live issue source-validation aliases instead of stale line references.
- `#3` / `#4` / `#5` / `#6`: added frontend absence locks and updated the frontend architecture audit context.
- `#7`: updated backend endpoint context after removing the approval department shim.
- `#41`: repointed endpoint serialization barrels to the canonical issue-register functions.
- `#50`: removed `_kri_history/submission.py` from authorization contract artifacts.
- `#52`: updated the architecture-deepening contract for deleted KRI correction-plan facade.
- `#53`: used direct issue-workflow execution imports and deleted both facade modules.
- `#54`: rewrote approval-queue deepening locks to assert direct queue-module exports.
- `#75`: consolidated the KRI auto-reject helper in `_approval_execution.results`.
- `#18`: locked approval read response parity and repointed endpoints to `_approval_queue.projection`.
- `#20`: kept the risk ID package re-export stable and documented it as load-bearing.

### Gate Results

- `make -f scripts/Makefile test-architecture-locks`: passed (`113 passed`, 1 snapshot passed)
- `pytest -m contract`: passed under backend venv activation (`163 passed`, `1726 deselected`, 1 warning)
- `pytest tests/backend/pytest -m "not postgres and not benchmark" -x`: passed (`1856 passed`, `3 skipped`, `30 deselected`, 17 warnings)
- `python3 scripts/security/validate_authz_capability_contract.py`: passed
- `ruff check backend/app`: passed
- `mypy backend/app`: baseline delta clean (`8 errors in 6 files`, unchanged from baseline)
- `cd frontend && npx tsc --noEmit`: passed
- `npm run -w tests/frontend/unit test -- --run`: runbook command failed before tests (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && npm run test:run` passed (`167 passed`, `737 tests passed`)
- `npm run -w tests/frontend/unit lint`: runbook command failed before lint (`ENOENT` for missing root `package.json`); equivalent repo command `cd frontend && npm run lint` passed
