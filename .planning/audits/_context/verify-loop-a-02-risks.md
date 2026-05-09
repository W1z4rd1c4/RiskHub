# Phase 2 Loop A — Risks/Risk-Type/Risk-Questionnaire + Control Execution Verification

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Date: 2026-05-09

Scope: items #1, #11, #19, #20.

---

## Item #1 — A-N1 — `validate_risk_type` re-export drop

- Developer verdict: Accept (P2).
- Phase 2 verdict: CONFIRM.
- Current code state (file:line + ≤15-word quote):
  - `backend/app/api/v1/endpoints/risks/crud/__init__.py:2` — `from ._shared import validate_risk_type`.
  - `backend/app/api/v1/endpoints/risks/crud/__init__.py:23` — listed in `__all__`.
  - Only intra-package importer is `backend/app/api/v1/endpoints/risks/crud/create.py:20` — `from ._shared import validate_risk_type` (uses underscore-shared module, NOT the package re-export).
  - Zero importers reference `from app.api.v1.endpoints.risks.crud import validate_risk_type` outside the package (full-tree grep returned only the four occurrences listed above plus the unrelated `services/_entity_mutation_lifecycle/policy.py` symbol).
- True technical blocker: none. Re-export is dead code; `create.py` already pulls directly from `._shared`.
- Final disposition: DELETE (drop line 2 import and the `__all__` entry on line 23).
- Doc/lock side-effects:
  - No architecture-lock TOML references the symbol (`tests/backend/pytest/architecture/_*.toml` searched; no hits).
  - `.planning/audits/_context/02-backend-endpoints.md` should note the trimmed re-export when the change lands.
- Prerequisites: none (independent of #19/#20).

---

## Item #11 — S2.7 — Control execution `risk.process` → `risk.name`

- Developer verdict: Accept (P1).
- Phase 2 verdict: CONFIRM (real bug, regression test currently locks the wrong behavior).
- Current code state (file:line + ≤15-word quote):
  - `backend/app/services/_control_execution/workflow.py:145` — `def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:`.
  - `backend/app/services/_control_execution/workflow.py:155` — `names.append(risk.process)` — function named for risk **names** appends `process`.
  - `backend/app/services/_control_execution/projection.py:25` — `linked_risk_names_for_visible_ids,` (import).
  - `backend/app/services/_control_execution/projection.py:160` — `linked_risks=linked_risk_names_for_visible_ids(execution.control, readable_linked_risk_ids),` (uses returned list verbatim into `ControlExecutionProjection.linked_risks`).
  - `backend/app/schemas/execution.py:82` — `linked_risks: Optional[list[str]] = None` (downstream contract).
  - `backend/app/models/risk.py:62` — `name: Mapped[str] = mapped_column(String(255), index=True)` (column exists).
  - `backend/app/models/risk.py:65` — `process: Mapped[str] = mapped_column(String(255), index=True)` (column exists, separate field).
  - Audit-trail counterpart already prefers name: `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` — `assert "Audit Test Risk" in linked_risks_value` / `assert "Audit Test Process" not in linked_risks_value` (parity gap).
- True technical blocker: existing test `tests/backend/pytest/test_executions.py:325` — `assert item["linked_risks"] == [risk.process]` actively asserts the buggy behavior. Change must update this assertion in the same commit; otherwise the fix breaks CI.
- Final disposition: FIX (swap `risk.process` → `risk.name` at `workflow.py:155`) and update `test_executions.py:325` to assert `[risk.name]`. Add explicit regression assertion mirroring the audit-trail test (assert `risk.name` present, `risk.process` absent) so the prefer-name contract is locked symmetrically.
- Doc/lock side-effects:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:178` references the helper symbol `linked_risk_names_for_visible_ids(`; no rename, just the implementation. No allowlist changes.
  - `.planning/audits/_context/01-backend-services.md` and `06-test-surface.md` should record the parity fix between report-audit and execution projections.
- Prerequisites: none.

---

## Item #19 — S1.4 — Risk-type validation policy unification

- Developer verdict: Accept w/mod (verify HTTP 400 parity).
- Phase 2 verdict: CONFIRM (HTTP 400 parity is real and documented).
- Current code state (file:line + ≤15-word quote):
  - Endpoint copy: `backend/app/api/v1/endpoints/risks/crud/_shared.py:8` — `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:`.
  - `backend/app/api/v1/endpoints/risks/crud/_shared.py:17-19` — `raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown risk type '{risk_type_code}'. ...")`.
  - Service copy: `backend/app/services/_entity_mutation_lifecycle/policy.py:29` — `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:` (identical query, identical message).
  - `backend/app/services/_entity_mutation_lifecycle/policy.py:37-39` — `raise ValidationError(f"Unknown risk type '{risk_type_code}'. ...")`.
  - HTTP-400 parity chain:
    - `backend/app/core/exceptions.py:67` — `ValidationError: ExceptionProjection(status_code=400, retryable=False, audit_code="validation_error"),`.
    - `backend/app/core/exceptions.py:89-95` — `def to_http_exception(exc: DomainError) -> HTTPException:` returns `HTTPException(status_code=...projection.status_code...)`.
    - `backend/app/core/exceptions.py:112-118` — `domain_error_handler` returns `JSONResponse(status_code=http_exc.status_code, content={"detail": http_exc.detail}, ...)`.
    - `backend/app/main.py:237` — `app.add_exception_handler(DomainError, _domain_error_handler_adapter)` (wires registry into FastAPI).
  - Endpoint create-path uses the `_shared` copy: `backend/app/api/v1/endpoints/risks/crud/create.py:20` — `from ._shared import validate_risk_type`. Update path is already routed through the service copy via `policy.py:64`.
- True technical blocker: none. `ValidationError` deterministically projects to HTTP 400 with `detail=exc.detail`, so swapping the endpoint copy to call the service copy preserves the wire response.
- Final disposition: CONSOLIDATE (delete `_shared.validate_risk_type` and have `crud/create.py` import from `app.services._entity_mutation_lifecycle.policy`). Keeps single source of truth and aligns create with update.
- Doc/lock side-effects:
  - Update `.planning/audits/_context/01-backend-services.md` to record the consolidated owner (entity-mutation-lifecycle service).
  - No architecture-lock TOML touches `validate_risk_type`.
  - `_get_db_override_whitelist.toml` not affected (no test override changes implied).
- Prerequisites: should land alongside or after #1 — otherwise the dropped re-export plus the move duplicates churn in `crud/__init__.py`. Ordering: do #1 first, then #19.

---

## Item #20 — S1.6 — Risk ID generation co-location

- Developer verdict: Accept w/mod (preserve required endpoint re-export).
- Phase 2 verdict: MODIFY — implementation is already co-located inside the risks endpoint package; the developer's "preserve re-export" caveat is the entire ask. No real move work remains beyond aligning callers and confirming the re-export contract.
- Current code state (file:line + ≤15-word quote):
  - Implementation: `backend/app/api/v1/endpoints/risks/id_generation.py:7` — `async def generate_risk_id_code(db: AsyncSession, process: str) -> str:`.
  - Package re-export: `backend/app/api/v1/endpoints/risks/__init__.py:3` — `from .id_generation import generate_risk_id_code`.
  - Package `__all__`: `backend/app/api/v1/endpoints/risks/__init__.py:8` — `__all__ = ["generate_risk_id_code", "router"]`.
  - Importers (full-tree grep, four sites):
    1. `backend/app/api/v1/endpoints/risks/crud/create.py:19` — `from ..id_generation import generate_risk_id_code` (intra-package, sibling import).
    2. `backend/scripts/migrate_risks.py:16` — `from app.api.v1.endpoints.risks.id_generation import generate_risk_id_code` (out-of-package script — pulls direct module path).
    3. `tests/backend/pytest/test_risks.py:556` — `from app.api.v1.endpoints.risks import generate_risk_id_code` (uses package re-export).
    4. `tests/backend/pytest/test_risk_id_generation.py:13` — `from app.api.v1.endpoints.risks import generate_risk_id_code` (uses package re-export).
- True technical blocker: the package-level re-export in `risks/__init__.py:3` is load-bearing — both regression test files import via the package facade. Removing it would require simultaneous test edits.
- Final disposition: KEEP-AS-IS for placement; FIX-RE-EXPORT-CONTRACT (preserve the line and document it as the canonical public surface). The "co-location" the audit asked for already exists — implementation, package re-export, and the only out-of-tree caller (`migrate_risks.py`) all live next to risks. Document and lock this in the next audit pass instead of moving code.
- Doc/lock side-effects:
  - Update `.planning/audits/_context/02-backend-endpoints.md` to record the tests' reliance on the package-level re-export so future cleanup respects the contract.
  - Consider adding the symbol to a public-surface allowlist (e.g., a doc note in `02-backend-endpoints.md`); no existing lock test currently asserts it, so this is documentation-only.
  - `backend/scripts/migrate_risks.py` is out of the API package and may stay on the deep import; flag in `_context/06-test-surface.md` follow-up if uniform import style is preferred.
- Prerequisites: none for the doc-only confirmation. If a future task wants to drop the re-export, it must first migrate `tests/backend/pytest/test_risks.py:556` and `tests/backend/pytest/test_risk_id_generation.py:13` to the deep-module import.

---

## Cross-item synthesis

- All four items pass verification. No "Defer" findings; every item maps to a concrete disposition (DELETE, FIX, CONSOLIDATE, or DOCUMENT/LOCK).
- Suggested ordering when these reach implementation:
  1. #1 — DELETE `validate_risk_type` re-export from `crud/__init__.py`.
  2. #19 — CONSOLIDATE both copies onto `services/_entity_mutation_lifecycle.policy.validate_risk_type`; rewire `crud/create.py:20` import.
  3. #11 — FIX `risk.process` → `risk.name` at `workflow.py:155` and update `test_executions.py:325` accordingly.
  4. #20 — DOCUMENT the package re-export contract; no code move.
- Quality gates touched: backend pytest (`test_executions.py`, `test_risks.py`, `test_risk_id_generation.py`, `api/v1/test_reports_audit.py`), no architecture lock changes, no migrations.
