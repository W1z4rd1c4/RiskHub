# Phase 2 Loop B — Risks Domain Adversarial Re-Verification

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Date: 2026-05-09
Scope: items #1, #11, #19, #20.

Adversarial mandate: challenge every quoted snippet, recount importers,
re-trace exception chain, re-test the test-line claim. Empirical only.

---

## Item #1 — Loop A said: DELETE re-export; zero external importers

- Quote check (each quoted snippet):
  - `crud/__init__.py:2` `from ._shared import validate_risk_type` — PASS (verbatim).
  - `crud/__init__.py:23` `"validate_risk_type",` inside `__all__` — PASS (verbatim, line 23).
  - `crud/create.py:20` `from ._shared import validate_risk_type` — PASS (verbatim, line 20).
- Importer count check (fresh full-tree grep, no extension filter):
  Production hits = 7 across 4 files.
    1. `crud/_shared.py:8` def site
    2. `crud/__init__.py:2` re-export import
    3. `crud/__init__.py:23` `__all__` listing
    4. `crud/create.py:20` import (uses `_shared` directly)
    5. `crud/create.py:35` call site `await validate_risk_type(...)`
    6. `services/_entity_mutation_lifecycle/policy.py:29` second def
    7. `services/_entity_mutation_lifecycle/policy.py:64` call site
  Zero hits for `from app.api.v1.endpoints.risks.crud import validate_risk_type`
  (confirmed with `grep -rn "from app.api.v1.endpoints.risks.crud import"`
  returns no result mentioning validate_risk_type).
  Loop A's "four occurrences plus the unrelated services policy symbol"
  is consistent with this fresh count. PASS.
- Blocker missed: none. Re-export truly is dead code.
- Final Phase 2-B verdict: CORRECT (DELETE crud/__init__.py:2 and the
  `__all__` entry on line 23).

---

## Item #11 — Loop A said: FIX `risk.process` → `risk.name` at workflow.py:155 and update test_executions.py:325

- Quote check (each quoted snippet):
  - `workflow.py:145` `def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:` — PASS (verbatim line 145).
  - `workflow.py:155` `names.append(risk.process)` — PASS (verbatim line 155, inside `if risk.id in readable_risk_ids:` on 154).
  - `projection.py:25` `linked_risk_names_for_visible_ids,` — PASS (line 25 inside import-from block 23-28).
  - `projection.py:160` `linked_risks=linked_risk_names_for_visible_ids(execution.control, readable_linked_risk_ids),` — PASS (verbatim line 160).
  - `schemas/execution.py:82` `linked_risks: Optional[list[str]] = None` — PASS (verbatim).
  - `models/risk.py:62` `name: Mapped[str] = mapped_column(String(255), index=True)` — PASS (verbatim).
  - `models/risk.py:65` `process: Mapped[str] = mapped_column(String(255), index=True)` — PASS (verbatim).
  - Audit-trail parity test `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` — PASS:
    line 185 `assert "Audit Test Risk" in linked_risks_value`,
    line 186 `assert "Audit Test Process" not in linked_risks_value`.
- Test assertion check (#11): The test cited as the regression is
  `tests/backend/pytest/test_executions.py:325` — Loop A claimed
  `assert item["linked_risks"] == [risk.process]`.
  Re-read line 325: PASS — exact match.
  Containing test is `test_list_executions_filters_linked_risks_without_scalar_per_row_checks`
  (line 268). The risk fixture sets
  `name="Execution List Linked Risk"` (line 287) and
  `process="Visible Execution Process"` (line 288), so `risk.name` differs
  from `risk.process` and the assertion truly locks the buggy behaviour.
- Importer / call-site check: only one production caller of
  `linked_risk_names_for_visible_ids` outside its own module —
  `projection.py:23-25` and the call at `projection.py:160`.
  Plus `tests/.../test_architecture_deepening_contracts.py:178` references
  the symbol as a string `"linked_risk_names_for_visible_ids("`. Renaming
  not required; only the inner `.process` → `.name` swap.
- Blocker missed: none. Loop A correctly flagged that the test must be
  updated in the same commit, otherwise CI red. Confirm that
  `test_reports_audit.py` already locks the prefer-name behaviour, so the
  fix removes a parity drift rather than introducing a new contract.
- Final Phase 2-B verdict: CORRECT (real bug; fix `workflow.py:155` from
  `risk.process` to `risk.name`; update `test_executions.py:325` to
  `[risk.name]` in the same commit; consider mirroring the audit-trail
  positive/negative assertion for symmetry).

---

## Item #19 — Loop A said: CONSOLIDATE — HTTP 400 parity via ValidationError

- Quote check (each quoted snippet):
  - `_shared.py:8` `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:` — PASS.
  - `_shared.py:17-19` raise block — PASS:
    ```
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration.",
    )
    ```
    (lines 17, 18, 19 verbatim; the detail message is identical between
    `_shared` and `policy`).
  - `policy.py:29` `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:` — PASS.
  - `policy.py:37-39` `raise ValidationError(f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration.")` — PASS (lines 37-39 wrap the multi-line raise).
  - `policy.py:64` `await validate_risk_type(db, update_data["risk_type"])` — PASS (verbatim, line 64 inside `validate_risk_update_payload`).
  - `crud/create.py:20` `from ._shared import validate_risk_type` — PASS.

- Exception-chain check (#19):
  - `core/exceptions.py:12-13` `class DomainError(Exception):` with
    `status_code = 400` default. PASS (defaults present, line 13).
  - `core/exceptions.py:31-32` `class ValidationError(DomainError):`
    overrides `status_code = 400`. PASS.
  - `core/exceptions.py:67` `ValidationError: ExceptionProjection(status_code=400, retryable=False, audit_code="validation_error"),` — PASS (verbatim).
  - `core/exceptions.py:89-95` `def to_http_exception(exc: DomainError) -> HTTPException:` returning
    `HTTPException(status_code=getattr(exc, "status_code", projection.status_code), detail=exc.detail, headers=exc.headers,)` — PASS
    (line 89 def, line 92 status_code passthrough, line 93 detail, line 94 headers, line 95 close).
  - `core/exceptions.py:112-118` `async def domain_error_handler(...) -> JSONResponse:` returning
    `JSONResponse(status_code=http_exc.status_code, content={"detail": http_exc.detail}, headers=http_exc.headers,)` — PASS (line 112 def, line 113 build, lines 114-118 the JSONResponse args).
  - `main.py:237` `app.add_exception_handler(DomainError, _domain_error_handler_adapter)` — PASS (verbatim, inside `register_exception_handlers` body lines 232-237).
  - Adapter is registered for `DomainError` and `ValidationError` is a
    subclass, so the handler dispatches by class hierarchy.
  - End-to-end trace: `policy.validate_risk_type` raises `ValidationError` →
    `_domain_error_handler_adapter` casts to `DomainError` →
    `domain_error_handler` calls `to_http_exception` → projection returns
    400 with `detail=exc.detail` (verbatim message) → JSONResponse with
    `{"detail": "Unknown risk type '...'. Available types can be viewed in Risk Hub configuration."}`.
    Endpoint copy raises `HTTPException(status_code=400, detail=<same message>)`,
    which FastAPI ships through its built-in handler returning identical
    400 + `{"detail": ...}`. Wire response is byte-for-byte equivalent
    (modulo whether headers are forwarded — both pass `None`/empty).
  - Trace gap: NONE. PASS.
- Blocker missed: none. Loop A's "doc-only side-effects" is correct;
  no architecture lock asserts the symbol; `_get_db_override_whitelist.toml`
  not implicated.
- Final Phase 2-B verdict: CORRECT (CONSOLIDATE — delete
  `_shared.validate_risk_type` and have `crud/create.py` import the
  service-policy version; HTTP 400 parity verified end-to-end through
  the registry → adapter → handler → JSONResponse chain).

---

## Item #20 — Loop A said: implementation already at id_generation.py:7; KEEP

- Quote check (each quoted snippet):
  - `risks/id_generation.py:7` `async def generate_risk_id_code(db: AsyncSession, process: str) -> str:` — PASS (verbatim, line 7 def).
  - `risks/__init__.py:3` `from .id_generation import generate_risk_id_code` — PASS.
  - `risks/__init__.py:8` `__all__ = ["generate_risk_id_code", "router"]` — PASS.
- Importer count check (fresh full-tree grep, all extensions):
  Production importers / call sites = 4 distinct sites as Loop A claimed:
    1. `backend/app/api/v1/endpoints/risks/crud/create.py:19` —
       `from ..id_generation import generate_risk_id_code` (sibling import,
       used at line 50 `risk_id_code = await generate_risk_id_code(db, risk_data.process)`).
    2. `backend/scripts/migrate_risks.py:16` —
       `from app.api.v1.endpoints.risks.id_generation import generate_risk_id_code`
       (used at lines 365, 391).
    3. `tests/backend/pytest/test_risks.py:556` —
       `from app.api.v1.endpoints.risks import generate_risk_id_code`
       (test_generate_risk_id_code_r100_plus, line 549).
    4. `tests/backend/pytest/test_risk_id_generation.py:13` —
       `from app.api.v1.endpoints.risks import generate_risk_id_code`
       (multiple call sites: lines 62, 80, 91, 111, 123-126).
  PASS — counts and import paths exactly match Loop A's enumeration.
  Both test files use the package re-export; only `migrate_risks.py`
  uses the deep-module path.
- Blocker missed: none. The package-level re-export at `risks/__init__.py:3`
  is genuinely load-bearing for both regression tests; removing it is a
  multi-file edit, so the doc-only disposition is correct.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION — Loop A is right that
  the "co-location" the audit asked for already exists, and the developer's
  caveat ("preserve required endpoint re-export") is the only contract to
  document. The minor correction: this is genuinely a DOCUMENT-ONLY
  disposition; no source edits at all are required for the audit ask. The
  architecture-lock follow-up suggested by Loop A (allowlist note in
  `02-backend-endpoints.md`) is appropriate but optional. Mark as item
  with no implementation work — only a documentation/contract delta in
  the deepening-context files.

---

## Cross-item synthesis (Loop B)

- All four Loop A verdicts hold under adversarial re-verification.
- Quote integrity: 100% PASS — every cited file:line + quote re-read and
  matched verbatim. No hallucinated paraphrases.
- Importer counts:
  - #1 `validate_risk_type`: 7 production hits across 4 files (matches
    Loop A's count when "four occurrences" is read as 4 risks/crud sites).
  - #20 `generate_risk_id_code`: 4 importer sites (matches Loop A).
- Exception-chain (#19): full trace from `ValidationError` raise through
  `_domain_error_handler_adapter` → `to_http_exception` → `JSONResponse`
  is unbroken; HTTP 400 + `{"detail": <same message>}` parity holds.
- Test assertion (#11): `tests/backend/pytest/test_executions.py:325`
  literally asserts `[risk.process]` and the fixture distinguishes
  `name` from `process`, so the bug + lock-in is real.
- Final Phase 2-B verdicts:
  - #1 — CORRECT (DELETE)
  - #11 — CORRECT (FIX + update test in same commit)
  - #19 — CORRECT (CONSOLIDATE; HTTP 400 parity verified)
  - #20 — CORRECT-WITH-CORRECTION (DOCUMENT-ONLY; no source edits)
- No new blockers surfaced. No defers required. Suggested ordering from
  Loop A (#1 → #19 → #11 → #20-doc) remains valid.
