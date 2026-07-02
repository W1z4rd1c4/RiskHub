# backend/app/services/_kri_history

## Purpose

Write-side bounded context (ADR-007), workflow-paired with
`_deadline_execution`. Owns KRI value intake and recording, period algebra
(`periods.py`, `clock.py`), history corrections — every correction emits its
value-change activity record inside `apply_history_correction`
(`corrections.py`) — approval-gated correction execution
(`approval_execution.py`, `approval_intake.py`), and the governance
entrypoints (`governance.py`), which own their commits per ADR-002.
Canonical import home for `KRIHistoryService` and `REPORTING_GRACE_DAYS`
(the old `app.services.kri_history_service` shim is deleted).
