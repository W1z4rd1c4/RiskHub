# Phase 3 Loop 1 Plan — Risks + Control-Execution Truth-in-Naming

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Date: 2026-05-09
Domain: Risks (#1, #19, #20) + control-execution truth-in-naming (#11)
Author role: Phase 3 Loop 1 planner (TDD skeletons only — no production edits)
Sources synthesized:
- `.planning/audits/_context/verify-loop-a-02-risks.md`
- `.planning/audits/_context/verify-loop-b-02-risks.md`
- `.planning/audits/_context/01-backend-services.md`
- `.planning/audits/_context/02-backend-endpoints.md`
- `.planning/audits/_context/06-test-surface.md`
- `.planning/audits/2026-05-09-deepening-audit.md` (entries 1, 11, 19, 20)
- `.planning/audits/developer answer.md` (responses 1, 11, 19, 20)

Constraints honored:
- TDD-first: every item starts with a failing test or failing structural assertion.
- Single-developer, sequential — items land one at a time, in the listed order.
- Doc/lock-only Reject is invalid: every item updates the relevant `_context/*.md`
  and (where applicable) the `docs/agent/ENDPOINT_INVARIANTS.md` contract.
- Effort scale: S = ≤2h, M = half-day–1 day, L = 1–3 days, XL = >3 days.

---

## Item #1 — A-N1 — Drop `validate_risk_type` re-export from risks/crud package

- Final disposition: **DELETE** the public re-export only; underlying
  `_shared.validate_risk_type` stays until #19 lands.
- Dependencies (in-domain): none. Item lands first because both #19 and #20
  also touch `risks/crud/__init__.py:1-24` and we want the smallest possible
  diff in this commit.
- Cross-domain prerequisites: none.
- TDD shape:
  - **Failing test(s) to write FIRST**:
    - New invariant test (placed alongside the existing risks crud surface
      checks) asserting that `app.api.v1.endpoints.risks.crud` no longer
      exposes `validate_risk_type`. Two assertions, both currently passing
      against today's code, so they must be **inverted** to fail before the
      fix:
      1. `assert "validate_risk_type" not in app.api.v1.endpoints.risks.crud.__all__`
         (target line `crud/__init__.py:23` quote `"validate_risk_type",`).
      2. `assert not hasattr(app.api.v1.endpoints.risks.crud, "validate_risk_type")`
         (covers the bare attribute access from line 2 quote
         `from ._shared import validate_risk_type`).
    - File: new module `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py`
      following the `_red.py` invariant-lock naming convention from
      `tests/backend/pytest/architecture/`.
  - **Code/file changes** (skeleton, no diff):
    - `backend/app/api/v1/endpoints/risks/crud/__init__.py:2` — remove the
      `from ._shared import validate_risk_type` re-export.
    - `backend/app/api/v1/endpoints/risks/crud/__init__.py:23` — remove the
      `"validate_risk_type",` entry from `__all__`.
    - No edits to `_shared.py`, `create.py`, or any service module — the
      `_shared` symbol is still consumed by `crud/create.py:20`
      (`from ._shared import validate_risk_type`) until #19.
  - **Lock/TOML/contract updates**:
    - No existing TOML allowlist references `validate_risk_type`
      (verified: `grep -rn "validate_risk_type" tests/backend/pytest/architecture/`
      returns zero hits per Loop-A and Loop-B counts).
    - The new `_red` test IS the lock; no existing allowlist needs editing.
  - **README / doc updates**:
    - `.planning/audits/_context/02-backend-endpoints.md` — add a one-line
      note under the risks-package surface that the package no longer
      re-exports `validate_risk_type`; consumers must use
      `from app.api.v1.endpoints.risks.crud._shared import validate_risk_type`
      (transitional, until #19 deletes `_shared.validate_risk_type`).
    - `docs/agent/ENDPOINT_INVARIANTS.md:11-14` — confirm the "Required
      re-exports" list still does **not** mention `validate_risk_type`
      (today it lists only `generate_risk_id_code`, `get_cro_user`,
      `get_password_hash`); no edit needed but cross-check during the
      commit so the contract list stays accurate.
  - **Verification commands**:
    - `make -f scripts/Makefile test-architecture-locks` (must run the new
      `_red` test).
    - Targeted pytest: `pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q`.
    - Spot-check imports: `pytest tests/backend/pytest/test_risks.py -q`
      (confirms create-path still works because `crud/create.py:20`
      still imports from `._shared`, not from the package facade).
  - **Commit boundary**: single commit. Title shape: `chore(risks): drop
    unused validate_risk_type re-export from crud/__init__.py`. The new
    `_red` test and the `__init__.py` edit ship together so the
    architecture lock turns green in the same commit that deletes the
    surface. No other production files change.
  - **Rollback note**: trivially reversible — re-add the import line and
    the `__all__` entry; delete the new `_red` test file. No data path
    is touched.
- Effort: **S** (≤2h, includes writing the lock test and updating
  `02-backend-endpoints.md`).

---

## Item #19 — S1.4 — Consolidate risk-type validation onto service policy

- Final disposition: **CONSOLIDATE** — delete the endpoint copy at
  `backend/app/api/v1/endpoints/risks/crud/_shared.py:8-20` and rewire
  `crud/create.py:20` to import the service-policy version at
  `backend/app/services/_entity_mutation_lifecycle/policy.py:29-39`.
- Dependencies (in-domain): **lands AFTER #1**. Both items edit
  `risks/crud/__init__.py`; landing #1 first means this commit only
  has to delete a now-orphaned `_shared.py` and rewire one import in
  `create.py`. Loop-A note 02-risks §item-19 prerequisites: "should land
  alongside or after #1 — otherwise the dropped re-export plus the move
  duplicates churn in `crud/__init__.py`".
- Cross-domain prerequisites: none. HTTP 400 parity is verified end-to-end
  in Loop-B (`verify-loop-b-02-risks.md` lines 95-118): `ValidationError`
  → registry projection (`core/exceptions.py:67`) → `to_http_exception`
  (`core/exceptions.py:89-95`) → `domain_error_handler` JSONResponse
  (`core/exceptions.py:112-118`) wired by `main.py:237`.
- TDD shape:
  - **Failing test(s) to write FIRST**:
    1. **Wire-parity regression test** — new pytest in
       `tests/backend/pytest/api/v1/test_risks_validation_parity.py`
       (use `client_factory` per CLAUDE.md backend-API rule) that
       POSTs `/api/v1/risks` with `risk_type="__unknown__"` and asserts
       the response is `status_code == 400` AND
       `response.json()["detail"] == "Unknown risk type '__unknown__'. Available types can be viewed in Risk Hub configuration."`.
       This test passes today (FastAPI `HTTPException` produces the same
       wire shape) and must continue to pass after the swap — that is
       the parity guarantee. Mark with a docstring referencing
       `core/exceptions.py:67,89-95,112-118` so the next reader sees
       the projection chain we're locking.
    2. **Architecture invariant test** (under
       `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`)
       asserting:
       - `"validate_risk_type" not in dir(app.api.v1.endpoints.risks.crud._shared)`
         (locks deletion of the endpoint copy, target line `_shared.py:8`
         quote `async def validate_risk_type(db: AsyncSession, ...)`).
       - The bytes of `app.services._entity_mutation_lifecycle.policy.validate_risk_type`
         (`policy.py:29` quote `async def validate_risk_type(db: AsyncSession, ...)`)
         are reachable as a callable.
       - `inspect.getsource(app.api.v1.endpoints.risks.crud.create)` contains
         `from app.services._entity_mutation_lifecycle.policy import validate_risk_type`
         and does NOT contain `from ._shared import validate_risk_type`
         (target old `create.py:20` quote
         `from ._shared import validate_risk_type`).
  - **Code/file changes** (skeleton, no diff):
    - `backend/app/api/v1/endpoints/risks/crud/_shared.py` — delete file,
      OR reduce to a no-op module if it becomes empty after the
      `validate_risk_type` removal (today only contains lines 1-20 for
      this validator).
    - `backend/app/api/v1/endpoints/risks/crud/create.py:20` — change
      import from `from ._shared import validate_risk_type` to
      `from app.services._entity_mutation_lifecycle.policy import validate_risk_type`.
      Call site at `create.py:35` (`await validate_risk_type(db, risk_data.risk_type)`)
      stays unchanged — same signature `(db, risk_type_code)`.
    - `backend/app/services/_entity_mutation_lifecycle/policy.py:29-39` —
      no change; this is the canonical owner.
    - Update path is already routed through `policy.py:64`
      (`await validate_risk_type(db, update_data["risk_type"])`); no edit
      needed.
  - **Lock/TOML/contract updates**:
    - The new `_red` invariant test IS the lock for the single-owner
      contract.
    - `tests/backend/pytest/_get_db_override_whitelist.toml` — verified
      not implicated (Loop-A 02-risks §item-19 doc/lock side-effects).
    - No `_archive_allowlist.toml` / `_naming_allowlist.toml` /
      `_capabilities_all_allowlist.toml` / `_endpoint_commit_allowlist.toml`
      hit (none reference the symbol; verified via repo grep).
    - If `_shared.py` becomes empty enough to delete entirely, confirm
      no other `risks/crud/*.py` module imports from `._shared`.
      Today `create.py:20` is the sole consumer per Loop-A enumeration.
  - **README / doc updates**:
    - `.planning/audits/_context/01-backend-services.md` — record under
      `_entity_mutation_lifecycle` that `validate_risk_type` is the
      single-owner risk-type validator (creates *and* updates).
    - `.planning/audits/_context/02-backend-endpoints.md` — under the
      `risks/` package map, drop the line about
      `crud/_shared.validate_risk_type` and replace with a pointer to
      the service-policy owner.
    - `docs/adr/` — no new ADR; the change strengthens ADR-003
      (DomainError taxonomy) by routing all risk-type validation through
      `ValidationError` rather than mixing `HTTPException`. Cross-link
      ADR-003 in the commit body.
  - **Verification commands**:
    - `pytest tests/backend/pytest/api/v1/test_risks_validation_parity.py -q`
      (must stay green pre- and post-swap; this is the parity gate).
    - `pytest tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py -q`
      (must turn green after the swap).
    - Targeted: `pytest tests/backend/pytest/test_risks.py -q`
      (broad risks endpoint coverage).
    - `make -f scripts/Makefile test-architecture-locks`.
    - `python scripts/security/validate_authz_capability_contract.py`
      (sanity — no capability change but the create endpoint is in scope).
  - **Commit boundary**: single commit. Title shape: `refactor(risks):
    consolidate validate_risk_type onto entity-mutation policy`. The
    parity test, the lock test, the import rewire, and the
    `_shared.py` deletion ship together. Doc updates in the same commit.
  - **Rollback note**: re-add `validate_risk_type` to
    `crud/_shared.py:8-20` (HTTPException variant), revert the import in
    `create.py:20`, delete the two new tests. No DB or migration impact.
- Effort: **S** (≤2h: wire-parity + lock test, one import rewire, file
  deletion, two `_context/*.md` notes).

---

## Item #11 — S2.7 — Control execution `risk.process` → `risk.name` truth-in-naming fix

- Final disposition: **FIX** the bug at
  `backend/app/services/_control_execution/workflow.py:155` (quote
  `names.append(risk.process)`) by swapping `risk.process` → `risk.name`,
  AND update the regression test at
  `tests/backend/pytest/test_executions.py:325` (quote
  `assert item["linked_risks"] == [risk.process]`) to assert
  `[risk.name]` in the **same commit**.
- Dependencies (in-domain): none on #1/#19/#20. Lands AFTER #19 only
  because the agreed sequence (#1 → #19 → #11 → #20-doc) keeps
  risks/crud changes consolidated before opening the
  `_control_execution` workflow change. No code conflict — Risks
  endpoint files and `services/_control_execution/workflow.py` are
  disjoint.
- Cross-domain prerequisites: none. The audit-trail counterpart at
  `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` already
  enforces "name not process" for export, so the fix aligns parity
  rather than introducing a new contract.
- TDD shape:
  - **Failing test(s) to write FIRST**:
    1. **Update existing assertion** at
       `tests/backend/pytest/test_executions.py:325` from
       `assert item["linked_risks"] == [risk.process]` to
       `assert item["linked_risks"] == [risk.name]`. This single line
       inversion fails immediately against current production code
       (which still returns `risk.process`) — that is the red step.
    2. **Add a symmetric positive/negative regression** in the same test
       function (`test_list_executions_filters_linked_risks_without_scalar_per_row_checks`,
       defined at `test_executions.py:268`). The fixture already
       distinguishes `name="Execution List Linked Risk"` (line 287) from
       `process="Visible Execution Process"` (line 288), so we add:
       - `assert "Execution List Linked Risk" in item["linked_risks"]`
       - `assert "Visible Execution Process" not in item["linked_risks"]`
       This mirrors the audit-trail parity assertions at
       `tests/backend/pytest/api/v1/test_reports_audit.py:185-186`
       (quote `assert "Audit Test Risk" in linked_risks_value` /
       `assert "Audit Test Process" not in linked_risks_value`).
    3. **Optional unit-level regression** — a focused unit test that
       constructs a fake `Control` with one `ControlRiskLink` whose
       linked `Risk` has distinct `name` / `process` and asserts that
       `linked_risk_names_for_visible_ids(control, {risk.id})` returns
       `[risk.name]`. New file or appended to an existing
       `tests/backend/pytest/services/test_control_execution_workflow.py`
       if one exists; otherwise add to `test_executions.py` next to the
       integration test. Recommended only if the planner decides the
       integration test alone does not lock the helper sufficiently.
  - **Code/file changes** (skeleton, no diff):
    - `backend/app/services/_control_execution/workflow.py:155` — change
      `names.append(risk.process)` → `names.append(risk.name)`.
    - No signature change to
      `linked_risk_names_for_visible_ids(control, readable_risk_ids)`
      at `workflow.py:145` (quote
      `def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:`).
    - No change to `services/_control_execution/projection.py:25` import
      or `projection.py:160` call site (still returns `list[str]` into
      `ControlExecutionProjection.linked_risks` field, schema unchanged
      at `backend/app/schemas/execution.py:82` quote
      `linked_risks: Optional[list[str]] = None`).
    - No change to the package re-export in
      `backend/app/services/_control_execution/__init__.py:23,43`
      (quote `linked_risk_names_for_visible_ids,` and the `__all__`
      entry).
  - **Lock/TOML/contract updates**:
    - `tests/backend/pytest/test_architecture_deepening_contracts.py:178`
      (quote `"linked_risk_names_for_visible_ids("`) asserts the helper
      symbol is **absent** from a route source — string match, not a
      semantic check. Renaming is not on the table; the swap is `.process`
      → `.name` inside the helper. No allowlist edit needed.
    - No archive / naming / capability TOML touches.
  - **README / doc updates**:
    - `.planning/audits/_context/01-backend-services.md` — add a line to
      the `_control_execution` section recording that
      `linked_risk_names_for_visible_ids` returns `risk.name` (parity
      with audit-trail export).
    - `.planning/audits/_context/06-test-surface.md` — add a one-line
      cross-reference between
      `tests/backend/pytest/test_executions.py:325` and
      `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` so
      future readers see the symmetric prefer-name lock.
  - **Verification commands**:
    - `pytest tests/backend/pytest/test_executions.py -q`
      (must turn green after the swap).
    - `pytest tests/backend/pytest/api/v1/test_reports_audit.py -q`
      (parity sanity — must remain green throughout).
    - Optional broader: `pytest tests/backend/pytest/services -q`
      if a unit test was added.
    - `make -f scripts/Makefile test-architecture-locks`
      (sanity — locks should be unchanged).
  - **Commit boundary**: single commit. Title shape: `fix(execution):
    return risk.name (not risk.process) from linked_risk_names`. The
    test inversion AND the workflow fix MUST land in the same commit;
    splitting is forbidden because the existing assertion locks the bug
    today (Loop-B verify-loop-b-02-risks.md lines 51-59).
  - **Rollback note**: revert the one-line workflow edit and revert the
    test assertion. No data path or migration impact. CSV/audit export
    is unaffected (it already used `risk.name`).
- Effort: **S** (≤2h: one-line code change, two-line test inversion + the
  symmetric assertions, and two `_context/*.md` notes).

---

## Item #20 — S1.6 — Risk ID generation co-location (DOCUMENT-ONLY)

- Final disposition: **DOCUMENT-ONLY** — implementation is already at
  `backend/app/api/v1/endpoints/risks/id_generation.py:7` (quote
  `async def generate_risk_id_code(db: AsyncSession, process: str) -> str:`)
  and the package re-export at
  `backend/app/api/v1/endpoints/risks/__init__.py:3` (quote
  `from .id_generation import generate_risk_id_code`) is load-bearing
  for two regression tests + one out-of-tree script. No source edits.
- Dependencies (in-domain): none. Lands LAST in this domain so #1, #19,
  and #11 are already in place; ordering is for sequencing hygiene, not
  technical dependency.
- Cross-domain prerequisites: none.
- TDD shape:
  - **Failing test(s) to write FIRST**:
    - **Re-export contract lock** — new test at
      `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`
      (or add to an existing required-reexports invariant test if one
      exists; today none does for the risks package). Assertions:
      1. `from app.api.v1.endpoints.risks import generate_risk_id_code`
         resolves to the same callable as
         `from app.api.v1.endpoints.risks.id_generation import generate_risk_id_code`
         (locks the load-bearing re-export at
         `risks/__init__.py:3`, quote
         `from .id_generation import generate_risk_id_code`).
      2. `"generate_risk_id_code" in app.api.v1.endpoints.risks.__all__`
         (locks line 8 quote `__all__ = ["generate_risk_id_code", "router"]`).
      3. The set of test importers is enumerated and verified non-empty:
         `tests/backend/pytest/test_risks.py:556` (quote
         `from app.api.v1.endpoints.risks import generate_risk_id_code`)
         and `tests/backend/pytest/test_risk_id_generation.py:13`
         (quote `from app.api.v1.endpoints.risks import generate_risk_id_code`).
         Implement the third assertion as a textual regex search across
         `tests/backend/pytest/` files for
         `from app.api.v1.endpoints.risks import generate_risk_id_code`
         expecting ≥ 2 matches; this turns red the moment a future
         cleanup migrates the tests to the deep-module import without
         updating the contract.
    - This test is RED today **only** if we author it to assert the
      contract is documented in `docs/agent/ENDPOINT_INVARIANTS.md`
      via a string match (e.g.,
      `assert "app.api.v1.endpoints.risks.generate_risk_id_code"
      in (Path("docs/agent/ENDPOINT_INVARIANTS.md").read_text())`).
      Today the contract IS already documented at
      `docs/agent/ENDPOINT_INVARIANTS.md:12` (quote
      `app.api.v1.endpoints.risks.generate_risk_id_code (tests depend on it)`),
      so this assertion is GREEN. To satisfy "TDD-first" we therefore
      keep the lock test green-only and treat the planning artifact as
      the failing-state artifact: the new `_red` file's existence + the
      `02-backend-endpoints.md` note are the visible deltas, and the
      doc note in `_context/02-backend-endpoints.md` is the failing-then-
      passing artifact (writing it is the "test").
    - **Recommended pragmatic shape**: convert the test into a
      structural lock (it asserts the existing contract) and accept
      that the failing-first signal lives in the doc-update step. The
      `_red` filename matches the existing convention in
      `tests/backend/pytest/architecture/`; the test is intentionally
      defensive — it ratchets so future cleanup must update tests AND
      `docs/agent/ENDPOINT_INVARIANTS.md` together.
  - **Code/file changes** (skeleton, no diff):
    - **NONE** in production source. Verified non-edits:
      - `backend/app/api/v1/endpoints/risks/id_generation.py` — keep
        as-is (canonical home).
      - `backend/app/api/v1/endpoints/risks/__init__.py:3,8` — keep
        the re-export and `__all__` entry verbatim.
      - `backend/app/api/v1/endpoints/risks/crud/create.py:19` (quote
        `from ..id_generation import generate_risk_id_code`) — keep
        the sibling import; no migration to deep-module path.
      - `backend/scripts/migrate_risks.py:16` (quote
        `from app.api.v1.endpoints.risks.id_generation import generate_risk_id_code`) —
        keep the deep-module path; out-of-tree script, not part of the
        public surface contract.
  - **Lock/TOML/contract updates**:
    - The new `_red` test is the contract lock; no existing TOML
      allowlist references `generate_risk_id_code` (verified by grep).
    - No `_archive_allowlist.toml` / `_naming_allowlist.toml` /
      `_capabilities_all_allowlist.toml` /
      `_endpoint_commit_allowlist.toml` touch.
  - **README / doc updates**:
    - `docs/agent/ENDPOINT_INVARIANTS.md:11-14` — already lists
      `app.api.v1.endpoints.risks.generate_risk_id_code` as a required
      re-export; bump the "Verification date" line at
      `docs/agent/ENDPOINT_INVARIANTS.md:21-22` (quote
      `Verification date:` / `2026-02-16`) to today's date when this
      item lands so the freshness signal is current.
    - `.planning/audits/_context/02-backend-endpoints.md` — record the
      decision: implementation co-located in the endpoint package is
      retained; package re-export is load-bearing for tests; future
      cleanup that wants to drop the re-export must first migrate
      `tests/backend/pytest/test_risks.py:556` and
      `tests/backend/pytest/test_risk_id_generation.py:13` to the deep
      import path. Cross-link the new `_red` test.
    - `.planning/audits/_context/06-test-surface.md` — add a one-line
      note pointing at the two test files that depend on the package
      facade so the contract is discoverable from the test surface
      map.
  - **Verification commands**:
    - `pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q`
      (must be green after the structural lock is added).
    - `pytest tests/backend/pytest/test_risks.py -q`
      (sanity — package re-export still works for
      `test_generate_risk_id_code_r100_plus`).
    - `pytest tests/backend/pytest/test_risk_id_generation.py -q`
      (sanity — second package-facade consumer still works).
    - `make -f scripts/Makefile test-architecture-locks`.
  - **Commit boundary**: single commit. Title shape: `docs(risks): lock
    generate_risk_id_code package re-export contract`. The new `_red`
    test, the `ENDPOINT_INVARIANTS.md` date bump, and the two
    `_context/*.md` notes ship together.
  - **Rollback note**: trivially reversible — delete the `_red` test
    file and revert the doc edits. No source code is touched, so
    rollback cannot break runtime behavior.
- Effort: **S** (≤2h: one structural lock test plus three doc updates).

---

## Domain-level dependency graph

```
#1 (A-N1) ──► #19 (S1.4) ──► #11 (S2.7) ──► #20 (S1.6, doc-only)
   │             │              │                │
   │             │              │                └── independent of #1/#19/#11
   │             │              │                    technically, but sequenced
   │             │              │                    last for changelog hygiene
   │             │              │
   │             │              └── disjoint files from #1/#19; lands AFTER
   │             │                  #19 only to keep the agreed order
   │             │
   │             └── must land AFTER #1: both touch
   │                 risks/crud/__init__.py and #1's smaller delete
   │                 keeps the #19 patch focused on the rewire +
   │                 _shared.py deletion (no churn from re-export removal)
   │
   └── lands FIRST: smallest possible footprint; opens the door for #19 to
       delete _shared.py without re-export side-effects
```

Edges:

- **#1 → #19** (hard-required ordering): `risks/crud/__init__.py:2,23`
  is edited by both. Landing #1 first means the #19 commit only has to
  delete `_shared.py` and rewire `create.py:20`; the package surface
  delta is already booked.
- **#19 → #11** (soft sequencing): files are disjoint. The agreed audit
  ordering (Loop-A 02-risks §cross-item synthesis: "1) #1 — DELETE …
  2) #19 — CONSOLIDATE … 3) #11 — FIX … 4) #20 — DOCUMENT …") is
  preserved for changelog and review hygiene.
- **#11 → #20** (soft sequencing): files are disjoint. #20 is doc-only;
  any ordering works technically but sequencing it last lets the
  `_context/02-backend-endpoints.md` doc capture the finalized state of
  the risks package.

No cross-domain prerequisites for any item in this loop. None of the
four items depend on Issues, Approvals, KRIs, Vendor-Quarterly, or
Frontend work.

---

## Cross-domain notes

### Items downstream of this loop

- **Approvals / Issues domains**: unaffected. Verified by grep — no
  approval / issue module imports `validate_risk_type`,
  `linked_risk_names_for_visible_ids`, or `generate_risk_id_code` from
  the public risks surface (only the entity-mutation policy path at
  `services/_entity_mutation_lifecycle/policy.py:64` calls
  `validate_risk_type`, and that call site does not change in #19 — the
  service copy remains, the endpoint copy is deleted).
- **Reports / audit-trail**: parity test at
  `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` (quote
  `assert "Audit Test Risk" in linked_risks_value` /
  `assert "Audit Test Process" not in linked_risks_value`) is the
  upstream contract that #11 must align with. No change required to
  the report endpoint or its tests; #11 brings the execution-list
  projection into parity.
- **Frontend**: the `linked_risks` field on
  `backend/app/schemas/execution.py:82` (quote
  `linked_risks: Optional[list[str]] = None`) is unchanged in shape;
  only the string contents flip from process names to risk names.
  Loop-1 should flag (in the synthesis report, not in this plan) that
  any frontend snapshot tests asserting specific `linked_risks` content
  may need a fixture refresh — but no production frontend code edit is
  required.

### Tests touched by this loop

- New: 4 test files
  - `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py` (#1)
  - `tests/backend/pytest/api/v1/test_risks_validation_parity.py` (#19)
  - `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py` (#19)
  - `tests/backend/pytest/architecture/test_risks_required_reexports_red.py` (#20)
- Modified: 1 assertion line + 2 added assertions
  - `tests/backend/pytest/test_executions.py:325` (#11) — invert + extend.

### Architecture-lock allowlists touched

- **None edited**. All four items either add new `_red` invariant
  tests or are pure code/test/doc edits. No row added or removed in
  any of `_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`,
  `_riskhub_config_service_commit_allowlist.toml`,
  `_vendor_governance_service_commit_allowlist.toml`,
  `_get_db_override_whitelist.toml`. Verified by grep across
  `tests/backend/pytest/architecture/*.toml` for the three implicated
  symbols (`validate_risk_type`, `linked_risk_names_for_visible_ids`,
  `generate_risk_id_code`).

### ADR alignment

- #19 strengthens **ADR-003** (DomainError taxonomy) by routing all
  risk-type validation through `ValidationError` rather than raising
  raw `HTTPException` at the endpoint edge. Cross-link in the commit
  body.
- #11 has no ADR impact (truth-in-naming bug fix; no architecture
  contract changes).
- #1 and #20 are pure surface hygiene; no ADR impact.

### Quality gates implicated

- Backend pytest: `test_risks.py`, `test_executions.py`,
  `test_risk_id_generation.py`, `api/v1/test_reports_audit.py`, the
  four new test files above.
- Architecture locks: `make -f scripts/Makefile test-architecture-locks`
  must include the three new `_red` files.
- No migrations, no frontend lint/type-check, no authz contract
  validator changes (capability surfaces unchanged).

### Effort summary

| Item | Effort | Tests created | Source files edited | Doc files edited |
| ---- | ------ | ------------- | ------------------- | ---------------- |
| #1   | S      | 1 new         | 1 (`crud/__init__.py`) | 1 (`02-backend-endpoints.md`) |
| #19  | S      | 2 new         | 2 (`crud/_shared.py` deletion, `crud/create.py` import) | 2 (`01-backend-services.md`, `02-backend-endpoints.md`) |
| #11  | S      | 0 new (1 existing modified + 2 added assertions; optional unit test) | 1 (`workflow.py:155`) | 2 (`01-backend-services.md`, `06-test-surface.md`) |
| #20  | S      | 1 new         | 0                  | 3 (`ENDPOINT_INVARIANTS.md` date bump, `02-backend-endpoints.md`, `06-test-surface.md`) |

Total domain effort: **4 × S = ≈4–8h**, sequential, single developer.

### Rollback envelope

- Every item is single-commit and trivially reversible.
- No DB migration touched; no Alembic revision authored.
- No capability-catalog or authorization-capability-contract change.
- The four items collectively touch 2 production source files
  (`crud/__init__.py`, `crud/_shared.py` deleted, `crud/create.py:20`,
  `workflow.py:155`) and one doc file
  (`docs/agent/ENDPOINT_INVARIANTS.md` — date bump only).

---

## End of plan
