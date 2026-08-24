# Architecture Cleanup Decision Ledger — 2026-05-09

> **Record type:** durable decision extraction from removed session-style planning artifacts  
> **Historical source blobs:** see [`legacy-planning-artifact-disposition-2026-08-24.md`](./legacy-planning-artifact-disposition-2026-08-24.md)

This ledger preserves only load-bearing architecture decisions that are enforced
by current repository tests. It is not a work tracker, execution log, or complete
copy of the removed planning session.

## Decision #10 — Keep the Risk Hub questionnaire endpoint module

**Verdict:** Reject deletion.

`backend/app/api/v1/endpoints/riskhub_questionnaires.py` remains load-bearing
because it exposes the mounted batch-send route used by the Risk Hub
questionnaire workflow. The module-presence and frontend call-chain contract is
enforced by:

- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`
- `docs/agent/ENDPOINT_INVARIANTS.md`

## Decision #57 — Keep the quarterly comparison compatibility facade

**Verdict:** Reject deletion.

`backend/app/services/quarterly_comparison_service.py` remains a compatibility
facade over `app.services._quarterly_comparison`. Existing imports may continue
to rely on that stable public module while the canonical implementation remains
inside the package. The re-export and documentation contract is enforced by:

- `tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py`
- the facade module's explicit `Audit #57` keep-decision annotation

## Scope boundary

The removed implementation log, developer response, and 751-KB resolution plan
remain available by Git blob identity through the disposition record and Git
history. This document deliberately excludes transient scheduling, estimates,
agent-invocation plans, and command-session output.
