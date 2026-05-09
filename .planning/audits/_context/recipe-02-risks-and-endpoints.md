# Phase 5 Recipe — Risks + Small Endpoints (Domain 2)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Date: 2026-05-09
Phase: 5 (per-item TDD recipe drafting)
Domain: Risks + small endpoints (10 items)
Author role: Phase 5 recipe drafter (TDD steps with verbatim citations)
Constraints honored:
- TDD-first; doc/lock-only Reject is invalid; Defers planned.
- Single sequential developer.
- Phase 4 corrections incorporated per item.
- New architecture tests use `pytestmark = pytest.mark.contract`.
- Backend integration tests use `client_factory` from
  `tests/backend/pytest/conftest.py`.
- Quote rule: ≤15 words; every cited claim names `file:line`.

Recipe item order (in-domain execution sequence):

1. #1 (A-N1)
2. #19 (S1.4)
3. #11 (S2.7)
4. #20 (S1.6) — DOC-ONLY
5. #10 (S8.5) — KEEP
6. #38 (S8.6)
7. #21 (S2.6)
8. #12 (D-N3)
9. #15 (D-N2)
10. #58 (S8.3)

---

## Item #1 — A-N1 — Drop `validate_risk_type` re-export from risks/crud package

### Context (Phase 4 corrections)

- Phase 2-B verdict: CORRECT (DELETE) — verified at
  `verify-loop-b-02-risks.md:33` quote `Final Phase 2-B verdict: CORRECT (DELETE crud/__init__.py:2 …)`.
- Zero external importers. Re-export is dead code.
- No Phase 4 correction overrides; recipe matches Loop-1 plan.

### Files in scope

- `backend/app/api/v1/endpoints/risks/crud/__init__.py:2` — quote
  `from ._shared import validate_risk_type`.
- `backend/app/api/v1/endpoints/risks/crud/__init__.py:23` — quote
  `"validate_risk_type",`.
- `backend/app/api/v1/endpoints/risks/crud/_shared.py:8` — quote
  `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:`
  (NOT touched by #1; it remains until #19).
- `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py` (NEW).

### TDD recipe

#### Step 1 — RED test (write FIRST; lock fails before fix)

Create `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py`:

```python
"""Lock that risks/crud package no longer re-exports validate_risk_type."""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_validate_risk_type_not_re_exported_in_crud_all() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert "validate_risk_type" not in getattr(crud, "__all__", ())


def test_validate_risk_type_attribute_absent_on_crud_facade() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert not hasattr(crud, "validate_risk_type")
```

Both assertions FAIL today (the symbol is currently in `__all__` and is set
as a module attribute via line 2 import). They turn GREEN once Step 2 lands.

#### Step 2 — GREEN code edit

Edit `backend/app/api/v1/endpoints/risks/crud/__init__.py`:

- Delete line 2 (`from ._shared import validate_risk_type`).
- Delete line 23 (`"validate_risk_type",` inside `__all__`).

Do NOT touch `_shared.py` (that is #19). Do NOT touch `create.py:20`
(`from ._shared import validate_risk_type`).

#### Step 3 — REFACTOR

None. Single-line surface trim.

### Lock/TOML/contract updates

- New `_red` test IS the lock; no allowlist edit.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml`,
  `_endpoint_commit_allowlist.toml`, `_archive_allowlist.toml`,
  `_naming_allowlist.toml` — none reference `validate_risk_type`. No edits.

### Doc updates (same commit)

- `.planning/audits/_context/02-backend-endpoints.md` — add note under risks
  package: package no longer re-exports `validate_risk_type`; only
  `_shared.validate_risk_type` (private) consumed by `crud/create.py:20`
  until #19.
- `docs/agent/ENDPOINT_INVARIANTS.md:11-14` — confirm "Required re-exports"
  list is unchanged (today: `generate_risk_id_code`, `get_cro_user`,
  `get_password_hash`); cross-check only, no edit.

### Verification commands

- `pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q`
  (must turn green after Step 2).
- `make -f scripts/Makefile test-architecture-locks`.
- `pytest tests/backend/pytest/test_risks.py -q` (sanity — `crud/create.py`
  still imports validator from `._shared`).

### Commit boundary

ONE commit. Title: `chore(risks): drop unused validate_risk_type re-export from crud/__init__.py`. New `_red` test, package edits, and `_context` doc note ship together.

### Rollback

Re-add the import line and `__all__` entry; delete the new test. No data path.

### Effort

S (≤2h).

---

## Item #19 — S1.4 — Consolidate risk-type validation onto service policy

### Context (Phase 4 corrections)

- Phase 2-B verdict: CORRECT (CONSOLIDATE) — see
  `verify-loop-b-02-risks.md:122-125`.
- HTTP 400 wire parity verified via `core/exceptions.py:67,89-95,112-118`
  → `main.py:237` `_domain_error_handler_adapter`. JSON body byte-for-byte
  identical.
- Lands AFTER #1 (both touch `risks/crud/__init__.py`).

### Files in scope

- DELETE `backend/app/api/v1/endpoints/risks/crud/_shared.py` (entire 20-line
  file; only contains the validator).
- EDIT `backend/app/api/v1/endpoints/risks/crud/create.py:20` quote
  `from ._shared import validate_risk_type`.
- KEEP UNCHANGED `backend/app/services/_entity_mutation_lifecycle/policy.py:29`
  quote `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:`.
- KEEP `backend/app/services/_entity_mutation_lifecycle/policy.py:64` quote
  `await validate_risk_type(db, update_data["risk_type"])`.
- New tests:
  - `tests/backend/pytest/api/v1/test_risks_validation_parity.py`
  - `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`

### TDD recipe

#### Step 1 — RED tests (write FIRST)

Create `tests/backend/pytest/api/v1/test_risks_validation_parity.py` (uses
`client_factory` from conftest):

```python
"""HTTP 400 wire parity for unknown risk_type before/after consolidation.

Locks the registry projection chain
core/exceptions.py:67,89-95,112-118 wired by main.py:237.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_risk_with_unknown_risk_type_returns_400_with_canonical_detail(
    client_employee: AsyncClient,
) -> None:
    payload = {
        "risk_id_code": "PARITY-1",
        "name": "Parity Test Risk",
        "process": "Parity Process",
        "description": "Parity test risk",
        "category": "Operational",
        "department_id": 1,
        "risk_type": "__unknown__",
        "gross_probability": 1,
        "gross_impact": 1,
        "net_probability": 1,
        "net_impact": 1,
        "status": "active",
    }
    response = await client_employee.post("/api/v1/risks", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Unknown risk type '__unknown__'. "
        "Available types can be viewed in Risk Hub configuration."
    )
```

This test PASSES today (HTTPException variant ships the same body) and must
remain PASSING after the swap — that IS the parity guarantee.

Create `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`:

```python
"""Lock single-owner contract for validate_risk_type."""
from __future__ import annotations

import importlib
import inspect
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_endpoint_shared_no_longer_exports_validate_risk_type() -> None:
    shared_path = REPO_ROOT / "backend/app/api/v1/endpoints/risks/crud/_shared.py"
    assert not shared_path.exists(), "endpoint copy must be deleted"


def test_service_policy_owns_validate_risk_type() -> None:
    policy = importlib.import_module(
        "app.services._entity_mutation_lifecycle.policy"
    )
    assert callable(getattr(policy, "validate_risk_type", None))


def test_create_endpoint_imports_from_service_policy() -> None:
    create_module = importlib.import_module(
        "app.api.v1.endpoints.risks.crud.create"
    )
    source = inspect.getsource(create_module)
    assert (
        "from app.services._entity_mutation_lifecycle.policy "
        "import validate_risk_type"
    ) in source
    assert "from ._shared import validate_risk_type" not in source
```

All three architecture assertions FAIL today (file exists, import path is
`._shared`).

#### Step 2 — GREEN code edits

1. Delete `backend/app/api/v1/endpoints/risks/crud/_shared.py` entirely.
2. Edit `backend/app/api/v1/endpoints/risks/crud/create.py:20` from
   `from ._shared import validate_risk_type` to
   `from app.services._entity_mutation_lifecycle.policy import validate_risk_type`.
3. Call site at `create.py:35` quote
   `await validate_risk_type(db, risk_data.risk_type)` — UNCHANGED (same
   signature `(db, risk_type_code)`).
4. Verify no other module imports `from ._shared import` under
   `backend/app/api/v1/endpoints/risks/crud/`. Today only `create.py:20`
   does (Loop-A enumeration).

#### Step 3 — REFACTOR

None.

### Lock/TOML/contract updates

- New architecture lock IS the contract; no TOML edit.
- `tests/backend/pytest/_get_db_override_whitelist.toml` — N/A.
- `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`,
  `_archive_allowlist.toml`, `_naming_allowlist.toml` — none reference
  `validate_risk_type`. No edits.

### Doc updates (same commit)

- `.planning/audits/_context/01-backend-services.md` — under
  `_entity_mutation_lifecycle` section, record `validate_risk_type` is the
  single-owner risk-type validator (covers both create and update paths).
- `.planning/audits/_context/02-backend-endpoints.md` — under risks package
  map, drop reference to `crud/_shared.validate_risk_type`; replace with
  pointer to service-policy owner.
- Cross-link ADR-003 (DomainError taxonomy) in commit body — `ValidationError`
  routing strengthens it.

### Verification commands

- `pytest tests/backend/pytest/api/v1/test_risks_validation_parity.py -q`
  (parity gate; must stay green pre and post).
- `pytest tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py -q`
  (turns green after edits).
- `pytest tests/backend/pytest/test_risks.py -q` (broad coverage).
- `make -f scripts/Makefile test-architecture-locks`.
- `python3 scripts/security/validate_authz_capability_contract.py`
  (capability sanity; no surface change).

### Commit boundary

ONE commit. Title: `refactor(risks): consolidate validate_risk_type onto entity-mutation policy`. Parity test, lock test, import rewire, `_shared.py` deletion, doc updates ship together.

### Rollback

Re-add `crud/_shared.py` (HTTPException variant), revert import in
`create.py:20`, delete the two new tests. No DB or migration impact.

### Effort

S (≤2h).

---

## Item #11 — S2.7 — Control execution `risk.process` → `risk.name` truth-in-naming fix

### Context (Phase 4 corrections)

- Phase 2-B verdict: CORRECT (FIX + update test in same commit) —
  `verify-loop-b-02-risks.md:70-73`.
- **Critical Phase 4 directive**: `tests/backend/pytest/test_executions.py:325`
  literally locks the bug; assertion MUST be inverted in the SAME commit
  as the fix to avoid CI red. Original: `assert item["linked_risks"] == [risk.process]`.
  Replacement: `assert item["linked_risks"] == [risk.name]` AND assert
  `risk.process` value is NOT in the list.
- Audit-trail parity test at
  `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` already
  enforces "name not process" — fix removes a parity drift.

### Files in scope

- `backend/app/services/_control_execution/workflow.py:155` quote
  `names.append(risk.process)`.
- `backend/app/services/_control_execution/workflow.py:145` quote
  `def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:`.
- `tests/backend/pytest/test_executions.py:325` (assertion inversion).
- `tests/backend/pytest/test_executions.py:268` containing test
  `test_list_executions_filters_linked_risks_without_scalar_per_row_checks`.
- Fixture distinguishes `name="Execution List Linked Risk"` (line 287) from
  `process="Visible Execution Process"` (line 288).
- KEEP UNCHANGED `backend/app/schemas/execution.py:82` quote
  `linked_risks: Optional[list[str]] = None`.

### TDD recipe

#### Step 1 — RED test (assertion inversion in SAME commit as fix)

Edit `tests/backend/pytest/test_executions.py` around line 325. Replace:

```python
assert item["linked_risks"] == [risk.process]
```

with:

```python
assert item["linked_risks"] == [risk.name]
assert risk.name in item["linked_risks"]
assert risk.process not in item["linked_risks"]
```

This MUST be in the SAME commit as Step 2; splitting is forbidden because
the existing assertion locks the bug. The new positive/negative assertions
mirror `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` quote
`assert "Audit Test Risk" in linked_risks_value` and quote
`assert "Audit Test Process" not in linked_risks_value`.

#### Step 2 — GREEN code edit (SAME commit)

Edit `backend/app/services/_control_execution/workflow.py:155`:

- Replace `names.append(risk.process)` with `names.append(risk.name)`.

No signature change. No other changes in:
- `backend/app/services/_control_execution/projection.py:25` (import unchanged).
- `backend/app/services/_control_execution/projection.py:160` (call unchanged).
- `backend/app/services/_control_execution/__init__.py:23,43` (re-exports unchanged).
- `backend/app/schemas/execution.py:82` (schema field unchanged).

#### Step 3 — REFACTOR

None.

### Lock/TOML/contract updates

- `tests/backend/pytest/test_architecture_deepening_contracts.py:178` quote
  `"linked_risk_names_for_visible_ids("` is a string-symbol presence check;
  unaffected by `.process` → `.name` swap.
- No allowlist TOML edits.

### Doc updates (same commit)

- `.planning/audits/_context/01-backend-services.md` — under
  `_control_execution` section, note `linked_risk_names_for_visible_ids`
  returns `risk.name` (parity with audit-trail export).
- `.planning/audits/_context/06-test-surface.md` — cross-reference
  `tests/backend/pytest/test_executions.py:325` and
  `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` so future
  readers see the symmetric prefer-name lock.

### Verification commands

- `pytest tests/backend/pytest/test_executions.py -q` (turns green after fix).
- `pytest tests/backend/pytest/api/v1/test_reports_audit.py -q` (parity
  sanity; must remain green throughout).
- `make -f scripts/Makefile test-architecture-locks` (sanity).

### Commit boundary

ONE commit (the inversion + fix MUST land together). Title:
`fix(execution): return risk.name (not risk.process) from linked_risk_names`.

### Rollback

Revert single line in workflow.py and the test assertion edits. No data
path; CSV/audit export already used `risk.name`.

### Effort

S (≤2h).

---

## Item #20 — S1.6 — Risk ID generation co-location (DOC-ONLY)

### Context (Phase 4 corrections)

- Phase 2-B verdict: CORRECT-WITH-CORRECTION — DOC-ONLY; no source edits —
  `verify-loop-b-02-risks.md:155-163`.
- Implementation already at
  `backend/app/api/v1/endpoints/risks/id_generation.py:7` quote
  `async def generate_risk_id_code(db: AsyncSession, process: str) -> str:`.
- Package re-export at `backend/app/api/v1/endpoints/risks/__init__.py:3`
  quote `from .id_generation import generate_risk_id_code` is load-bearing
  for two regression tests.

### Files in scope

- KEEP UNCHANGED `backend/app/api/v1/endpoints/risks/id_generation.py:7`.
- KEEP UNCHANGED `backend/app/api/v1/endpoints/risks/__init__.py:3,8`.
- KEEP UNCHANGED `backend/app/api/v1/endpoints/risks/crud/create.py:19`
  quote `from ..id_generation import generate_risk_id_code`.
- KEEP UNCHANGED `backend/scripts/migrate_risks.py:16`.
- KEEP UNCHANGED tests at
  `tests/backend/pytest/test_risks.py:556` and
  `tests/backend/pytest/test_risk_id_generation.py:13`.
- New: `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`.
- Doc: `docs/agent/ENDPOINT_INVARIANTS.md` date refresh.

### TDD recipe

#### Step 1 — RED test (structural lock)

Create `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`:

```python
"""Lock the load-bearing risks package re-export of generate_risk_id_code."""
from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_generate_risk_id_code_is_re_exported_from_risks_package() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    deep = importlib.import_module(
        "app.api.v1.endpoints.risks.id_generation"
    )
    assert getattr(pkg, "generate_risk_id_code") is deep.generate_risk_id_code


def test_generate_risk_id_code_listed_in_package_all() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    assert "generate_risk_id_code" in getattr(pkg, "__all__", ())


def test_two_or_more_test_files_use_package_facade_import() -> None:
    pattern = re.compile(
        r"from\s+app\.api\.v1\.endpoints\.risks\s+import\s+generate_risk_id_code"
    )
    matches = []
    for path in (REPO_ROOT / "tests/backend/pytest").rglob("*.py"):
        if pattern.search(path.read_text(encoding="utf-8")):
            matches.append(str(path.relative_to(REPO_ROOT)))
    assert len(matches) >= 2, matches


def test_endpoint_invariants_doc_pins_required_reexport() -> None:
    invariants = (
        REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md"
    ).read_text(encoding="utf-8")
    assert (
        "app.api.v1.endpoints.risks.generate_risk_id_code" in invariants
    )
```

Today, all four assertions PASS (contract is already documented). The
RED-then-GREEN signal lives in the doc-update steps below; the test is a
structural ratchet that fails the moment a future cleanup deletes the
re-export, the `__all__` entry, the test imports, or the doc entry.

#### Step 2 — GREEN doc edits

1. `docs/agent/ENDPOINT_INVARIANTS.md` — bump verification date stanza
   (currently lines 21-22 quote `Verification date:` / `2026-02-16`) to
   `2026-05-09`.
2. `.planning/audits/_context/02-backend-endpoints.md` — add note: risks
   package facade re-export is load-bearing for
   `tests/backend/pytest/test_risks.py:556` and
   `tests/backend/pytest/test_risk_id_generation.py:13`. Future cleanup
   that removes the re-export must first migrate both tests.
3. `.planning/audits/_context/06-test-surface.md` — add one-line pointer to
   the two tests that depend on the package facade.

#### Step 3 — REFACTOR

None.

### Lock/TOML/contract updates

- New `_red` test IS the lock; no TOML edit.
- No `_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml` edit.

### Doc updates

(All in same commit; see Step 2.)

### Verification commands

- `pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q`
  (must be green; ratchet locks contract).
- `pytest tests/backend/pytest/test_risks.py -q` (sanity).
- `pytest tests/backend/pytest/test_risk_id_generation.py -q` (sanity).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit. Title: `docs(risks): lock generate_risk_id_code package re-export contract`. Test, date bump, two `_context/*.md` notes ship together.

### Rollback

Delete the test file; revert doc edits. No source code touched.

### Effort

S (≤2h).

---

## Item #10 — S8.5 — Keep `riskhub_questionnaires.py` (live route + FE caller)

### Context (Phase 4 corrections)

- Phase 2-B verdict: REJECT-CONFIRMED stands —
  `verify-loop-b-07-endpoints.md:50-51`.
- Live route + UI button drive verified via:
  `RiskQuestionnairesPanel.tsx:257` quote `onClick={handleBatchSend}`,
  `riskQuestionnairePanelState.ts:170` quote
  `await riskHubApi.batchSendQuestionnaires(payload)`,
  `riskHubApi.ts:308-310` quote `batchSendQuestionnaires`,
  `riskhub_questionnaires.py:14` quote
  `router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])`,
  `riskhub_questionnaires.py:37` quote
  `@router.post("/batch-send", response_model=BatchSendResponse)`.
- Phase 4 explicit instruction: ADD presence-lock test.
- Sequencing: #10 lock comes BEFORE #38 (which moves the inline schemas).

### Files in scope

- KEEP `backend/app/api/v1/endpoints/riskhub_questionnaires.py:1` quote
  `"""Risk Hub questionnaire endpoints (CRO-only batch send)."""`.
- New: `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`.

### TDD recipe

#### Step 1 — RED test (presence lock)

Create `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`:

```python
"""Lock that riskhub_questionnaires.py exists and exposes its router.

Module hosts the CRO-only batch-send route consumed by
RiskQuestionnairesPanel Send button. Presence is load-bearing.
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi import APIRouter

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = (
    REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
)


def test_riskhub_questionnaires_module_file_exists() -> None:
    assert MODULE_PATH.exists()


def test_riskhub_questionnaires_module_exports_router() -> None:
    module = importlib.import_module(
        "app.api.v1.endpoints.riskhub_questionnaires"
    )
    assert isinstance(getattr(module, "router", None), APIRouter)


def test_riskhub_questionnaires_route_count_at_least_one() -> None:
    module = importlib.import_module(
        "app.api.v1.endpoints.riskhub_questionnaires"
    )
    routes = [
        route for route in module.router.routes
        if hasattr(route, "path")
    ]
    assert len(routes) >= 1
```

Today, all three pass — they are a presence ratchet that would fail the
moment a future "0 routes" mis-flag tries to delete the module.

#### Step 2 — GREEN doc nudge (no logic change)

Edit `backend/app/api/v1/endpoints/riskhub_questionnaires.py:1` to extend
the docstring (preserve verbatim phrase used in tests/grep where possible):

```python
"""Risk Hub questionnaire endpoints (CRO-only batch send).

Live module: hosts POST /api/v1/riskhub/questionnaires/batch-send,
consumed by RiskQuestionnairesPanel.tsx Send button via
frontend/src/services/api/riskHubApi.ts batchSendQuestionnaires.
Inline schemas relocate under #38 (schemas/riskhub.py); module stays.
"""
```

#### Step 3 — REFACTOR

None.

### Lock/TOML/contract updates

- New presence-lock IS the contract.
- No TOML edits.

### Doc updates (same commit)

- Optionally clarify
  `backend/app/api/v1/endpoints/README.md` that this is a sibling-of-package
  single-file module hosting one CRO route.
- AGENTS.md:162 quote
  `app.api.v1.endpoints.riskhub.get_cro_user (used by backend/app/api/v1/endpoints/riskhub_questionnaires.py)`
  cross-reference verified intact.

### Verification commands

- `pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q`.
- `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q`
  (existing 226-line behavior coverage).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit. Title: `chore(riskhub): lock riskhub_questionnaires module presence`. Presence-lock test + docstring extension ship together.

### Rollback

Delete test file and revert docstring; module is live regardless.

### Effort

S (≤2h).

---

## Item #38 — S8.6 — Move 8 inline endpoint Pydantic models to schemas

### Context (Phase 4 corrections)

- Phase 2-B verdict: CORRECT — `verify-loop-b-07-endpoints.md:158`.
- 8 inline models confirmed at:
  - `health.py:16` quote `class LivenessResponse(BaseModel):`
  - `health.py:22` quote `class ReadinessResponse(BaseModel):`
  - `health.py:32` quote `class HealthResponse(ReadinessResponse):`
  - `preferences.py:15` quote `class PreferencesUpdate(BaseModel):`
  - `preferences.py:36` quote `class PreferencesResponse(BaseModel):`
  - `riskhub_questionnaires.py:17` quote `class RiskFilters(BaseModel):`
  - `riskhub_questionnaires.py:24` quote `class BatchSendRequest(BaseModel):`
  - `riskhub_questionnaires.py:30` quote `class BatchSendResponse(BaseModel):`
- **Phase 4 correction**: rename `RiskFilters` → `BatchSendRiskFilters` to
  avoid future collision (per `verify-loop-b-07-endpoints.md:42-49,156-157`).
- Sequencing: lands AFTER #10 (presence-lock guarantees the file isn't deleted).

### Files in scope

- NEW `backend/app/schemas/health.py` (3 models).
- NEW `backend/app/schemas/preferences.py` (2 models).
- EXTEND `backend/app/schemas/riskhub.py` (3 models, with rename).
- EDIT `backend/app/api/v1/endpoints/health.py:16-35`.
- EDIT `backend/app/api/v1/endpoints/preferences.py:15-40`.
- EDIT `backend/app/api/v1/endpoints/riskhub_questionnaires.py:17-34, 37-42`.
- New: `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`.

### TDD recipe

#### Step 1 — RED test (write FIRST)

Create `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`:

```python
"""Lock that endpoint modules import schemas, not define them inline."""
from __future__ import annotations

import ast
import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

EVICTED_FROM_HEALTH = {
    "LivenessResponse",
    "ReadinessResponse",
    "HealthResponse",
}
EVICTED_FROM_PREFERENCES = {
    "PreferencesUpdate",
    "PreferencesResponse",
}
EVICTED_FROM_RISKHUB_Q = {
    "BatchSendRiskFilters",
    "BatchSendRequest",
    "BatchSendResponse",
}


def _module_classnames(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef)
    }


def test_health_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/health.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_HEALTH)


def test_preferences_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/preferences.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_PREFERENCES)


def test_riskhub_questionnaires_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
    assert _module_classnames(path).isdisjoint(
        EVICTED_FROM_RISKHUB_Q | {"RiskFilters"}
    )


def test_schema_modules_export_evicted_classes() -> None:
    health_schema = importlib.import_module("app.schemas.health")
    preferences_schema = importlib.import_module("app.schemas.preferences")
    riskhub_schema = importlib.import_module("app.schemas.riskhub")
    for name in EVICTED_FROM_HEALTH:
        assert hasattr(health_schema, name)
    for name in EVICTED_FROM_PREFERENCES:
        assert hasattr(preferences_schema, name)
    for name in EVICTED_FROM_RISKHUB_Q:
        assert hasattr(riskhub_schema, name)
```

All four assertions FAIL today (classes still defined inline; new schema
modules don't exist; `RiskFilters` not yet renamed).

#### Step 2 — GREEN code edits

1. Create `backend/app/schemas/health.py`:

```python
"""Health/readiness/liveness response schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class LivenessResponse(BaseModel):
    """Process liveness response model."""
    status: Literal["alive"]


class ReadinessResponse(BaseModel):
    """Readiness response model."""
    ready: bool
    database: Literal["connected", "disconnected"]
    redis: Literal["connected", "disconnected", "disabled"]
    scheduler_role: Literal["disabled", "leader", "follower"]
    scheduler_status: Literal["disabled", "leader_running", "follower_ready", "error"]


class HealthResponse(ReadinessResponse):
    """Diagnostic health response model."""
    status: Literal["healthy", "degraded"]
```

2. Create `backend/app/schemas/preferences.py`:

```python
"""User preferences request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, field_validator


class PreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""
    theme: str | None = None
    language: str | None = None

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ("light", "dark", "riskhub"):
            raise ValueError("Invalid theme. Must be one of: light, dark, riskhub")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is not None and v not in ("en", "cs"):
            raise ValueError("Invalid language. Must be one of: en, cs")
        return v


class PreferencesResponse(BaseModel):
    """Response schema for user preferences."""
    theme: str
    language: str
```

3. Append to `backend/app/schemas/riskhub.py` (under a new section comment):

```python
# ============================================================================
# Risk Hub Questionnaire Batch-Send Schemas
# ============================================================================


class BatchSendRiskFilters(BaseModel):
    """Filter criteria for batch questionnaire send (renamed from RiskFilters)."""

    department_id: int | None = None
    process: str | None = None
    category: str | None = None
    status: str | None = None


class BatchSendRequest(BaseModel):
    """Batch send questionnaire request payload."""

    select_all: bool
    risk_ids: list[int] | None = None
    filters: BatchSendRiskFilters | None = None


class BatchSendResponse(BaseModel):
    """Batch send questionnaire response payload."""

    created_count: int
    skipped_no_owner: list[int]
    skipped_open_exists: list[int]
    errors: list[str]
```

4. Edit `backend/app/api/v1/endpoints/health.py`:

- Delete inline classes lines 16-35.
- Add import at module top: `from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse`.
- Drop unused `pydantic.BaseModel` import line if it's no longer referenced.
- Drop `from typing import Literal` if no longer used in the file.

5. Edit `backend/app/api/v1/endpoints/preferences.py`:

- Delete inline classes lines 15-40.
- Add import: `from app.schemas.preferences import PreferencesResponse, PreferencesUpdate`.
- Drop `from pydantic import BaseModel, field_validator` if no longer used.

6. Edit `backend/app/api/v1/endpoints/riskhub_questionnaires.py`:

- Delete inline classes lines 17-34.
- Add import: `from app.schemas.riskhub import BatchSendRequest, BatchSendResponse, BatchSendRiskFilters`.
- Drop `from pydantic import BaseModel` import line.
- Internal references (`riskhub_questionnaires.py:39, 42`) — `payload: BatchSendRequest` and `response_model=BatchSendResponse` already use the names; ensure import resolves them.
- `payload.filters` is typed `BatchSendRiskFilters | None` after the rename; usages at lines 47-58 access `.department_id`, `.process`, `.category`, `.status` — fields preserved verbatim.

#### Step 3 — REFACTOR

Verify no other `from app.api.v1.endpoints.riskhub_questionnaires import RiskFilters` consumer exists in the repo (Loop-B grep showed none).

### Lock/TOML/contract updates

- New architecture lock IS the contract.
- Frontend Zod mirrors at
  `frontend/src/services/api/schemas/riskHub.ts` (e.g.
  `batchSendQuestionnairesResponseSchema`) — verify field names unchanged
  (only the class identifier moves; wire payload identical).
- No TOML edits.

### Doc updates (same commit)

- None required (mechanical move).

### Verification commands

- `pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q`
  (must turn green).
- `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q`
  (behavioral parity).
- `pytest tests/backend/pytest/test_health.py -q`.
- `cd frontend && npx tsc --noEmit` (Zod mirror sanity).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit ("Move 8 inline endpoint Pydantic models to schemas") OR optional
3-commit split per endpoint module if review pressure favors smaller diffs.
Plan elects ONE.

### Rollback

Revert; schemas can stay as orphan files (harmless) or revert in full.

### Effort

M (half-day).

---

## Item #21 — S2.6 — Collapse Control-Risk link loader duplicates

### Context (Phase 4 corrections)

- Phase 2-B verdict: CONFIRMED collapse — `plan-loop-1-07-endpoints.md:239-283`.
- Two duplicate loaders at
  `backend/app/services/_control_execution/link_policy.py:22` quote
  `async def load_link_for_control(db: AsyncSession, *, control_id: int, risk_id: int) -> ControlRiskLink:`
  and
  `link_policy.py:35` quote
  `async def load_link_for_risk(db: AsyncSession, *, risk_id: int, control_id: int) -> ControlRiskLink:`.
- Both raise identical `HTTPException(status_code=404, detail="Link not found")` (lines 31, 44).
- Architecture deepening contract `tests/backend/pytest/test_architecture_deepening_contracts.py`
  pins `load_control_for_link`, `load_risk_for_link`, `assert_*_for_link`
  but NOT the per-direction `load_link_for_control` / `load_link_for_risk`.

### Files in scope

- `backend/app/services/_control_execution/link_policy.py:22-32` (delete).
- `backend/app/services/_control_execution/link_policy.py:35-45` (delete).
- Add new `load_link` function in same file.
- `backend/app/services/_control_execution/link_governance.py:102` (caller swap).
- `backend/app/services/_control_execution/link_governance.py:181` (caller swap).
- New: `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`.

### TDD recipe

#### Step 1 — RED test (write FIRST)

Create `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`:

```python
"""Lock the collapsed load_link helper in control-risk link policy."""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_load_link_helper_present() -> None:
    link_policy = importlib.import_module(
        "app.services._control_execution.link_policy"
    )
    assert callable(getattr(link_policy, "load_link", None))


def test_per_direction_loaders_removed() -> None:
    link_policy = importlib.import_module(
        "app.services._control_execution.link_policy"
    )
    assert not hasattr(link_policy, "load_link_for_control")
    assert not hasattr(link_policy, "load_link_for_risk")


def test_link_governance_uses_collapsed_loader() -> None:
    import inspect
    link_governance = importlib.import_module(
        "app.services._control_execution.link_governance"
    )
    source = inspect.getsource(link_governance)
    assert "load_link(db, control_id=" in source or "load_link(db," in source
    assert "load_link_for_control(" not in source
    assert "load_link_for_risk(" not in source
```

All three FAIL today.

Add a behavioral regression in
`tests/backend/pytest/test_risks.py` (using `client_factory`-built fixtures
already present) covering the 404 branch for both direction call sites
(`delete_risk_control_link` and `delete_control_risk_link`). Skip if
existing tests already cover both 404 branches; spot-check confirms
404-on-missing-link path is exercised.

#### Step 2 — GREEN code edits

1. Replace lines 22-45 of `link_policy.py` with a single helper:

```python
async def load_link(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
) -> ControlRiskLink:
    link = (
        await db.execute(
            select(ControlRiskLink)
            .where(ControlRiskLink.control_id == control_id)
            .where(ControlRiskLink.risk_id == risk_id)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return link
```

2. Edit `link_governance.py:102` (was
`link = await load_link_for_control(db, control_id=control_id, risk_id=risk_id)`)
to `link = await load_link(db, control_id=control_id, risk_id=risk_id)`.

3. Edit `link_governance.py:181` (was
`link = await load_link_for_risk(db, risk_id=risk_id, control_id=control_id)`)
to `link = await load_link(db, control_id=control_id, risk_id=risk_id)`.

4. Update the local `from .link_policy import (...)` import block in
`link_governance.py` — remove `load_link_for_control`, `load_link_for_risk`;
add `load_link`.

#### Step 3 — REFACTOR

Verify no third-party importer outside `_control_execution/`. Loop-1
confirms only 2 callers exist. Spot-check via
`grep -rn "load_link_for_control\|load_link_for_risk" backend/`.

### Lock/TOML/contract updates

- New architecture lock IS the contract.
- No TOML edits.

### Doc updates (same commit)

- None required.

### Verification commands

- `pytest tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py -q`
  (turns green after edits).
- `pytest tests/backend/pytest/test_risks.py -q` (regression).
- `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q`
  (deepening contract sanity; this lock pins different symbols).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit. Title: `refactor(control-risk): collapse load_link_for_* into load_link`.

### Rollback

Revert single commit.

### Effort

S (≤2h).

---

## Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`

### Context (Phase 4 corrections)

- **Critical Phase 4 correction**: Loop-A recommended narrowing to
  `AuthorizationError`, but `ensure_business_view_access`
  (`backend/app/core/_permissions/evaluation.py:53` quote
  `raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)`)
  raises `HTTPException`, NOT `AuthorizationError`. See
  `verify-loop-b-07-endpoints.md:64-75`.
- Two blanket-excepts at:
  - `backend/app/api/v1/endpoints/users/summary.py:48` quote
    `except Exception:` (inside `_can_view_governance`).
  - `backend/app/api/v1/endpoints/users/summary.py:62` quote
    `except Exception:` (inside `_build_shell_summary`,
    `_count_questionnaire_inbox` path).
- Narrow target for `_can_view_governance` MUST be `HTTPException`
  (matches actual upstream raise type).
- Narrow target for `_build_shell_summary` is
  `(HTTPException, SQLAlchemyError)` (questionnaire-inbox call hits
  `db.execute` and may also propagate `HTTPException` from upstream
  permission gates).

### Files in scope

- `backend/app/api/v1/endpoints/users/summary.py:48`.
- `backend/app/api/v1/endpoints/users/summary.py:62`.
- New: `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`.
- New (optional): `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`.

### TDD recipe

#### Step 1 — RED test (behavioral; write FIRST)

Create `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`:

```python
"""Lock blanket-except narrowing in users/summary.py.

Phase 4 correction: ensure_business_view_access raises HTTPException(403),
NOT AuthorizationError. Narrow targets must catch the actual raise types.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_unrelated_exception_in_questionnaire_inbox_propagates(
    client_employee: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ZeroDivisionError must NOT be silently swallowed (today: returns 0)."""

    async def boom(*args, **kwargs):
        raise ZeroDivisionError("synthetic")

    monkeypatch.setattr(
        "app.api.v1.endpoints.users.summary._count_questionnaire_inbox",
        boom,
    )

    response = await client_employee.get("/api/v1/me/shell-summary")
    assert response.status_code == 500


async def test_http_exception_in_questionnaire_inbox_returns_zero(
    client_employee: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HTTPException-based denial degrades to questionnaire_inbox_count=0."""

    async def deny(*args, **kwargs):
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(
        "app.api.v1.endpoints.users.summary._count_questionnaire_inbox",
        deny,
    )

    response = await client_employee.get("/api/v1/me/shell-summary")
    assert response.status_code == 200
    assert response.json()["questionnaire_inbox_count"] == 0


async def test_governance_view_http_exception_falls_through_to_false(
    client_admin_user: AsyncClient,
) -> None:
    """Platform admin receives HTTPException(403) from ensure_business_view_access
    and _can_view_governance must catch it -> can_view_governance=False."""
    response = await client_admin_user.get("/api/v1/me/shell-summary")
    assert response.status_code == 200
    assert response.json()["can_view_governance"] is False
```

(Choose actual fixture names matching project convention — `client_employee`
and an admin/platform fixture available via `client_factory`.)

Optionally create `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`:

```python
"""Forbid bare `except Exception:` in users/summary.py."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SUMMARY_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/users/summary.py"


def test_no_blanket_except_in_users_summary() -> None:
    source = SUMMARY_PATH.read_text(encoding="utf-8")
    assert "except Exception:" not in source
```

This FAILS today (two occurrences). Pattern follows
`tests/backend/pytest/architecture/test_w9_schema_datetime_ban.py` style.

#### Step 2 — GREEN code edits

Edit `backend/app/api/v1/endpoints/users/summary.py`:

1. Add imports at the top (sorted alphabetically per project style):

```python
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
```

2. Edit lines 45-50 (`_can_view_governance`):

```python
def _can_view_governance(current_user: User) -> bool:
    try:
        ensure_business_view_access(
            current_user,
            detail="Platform admins cannot access Governance business data",
        )
    except HTTPException:
        return False
    return can_manage_users(current_user)
```

3. Edit lines 60-63 (`_build_shell_summary` questionnaire-inbox try):

```python
    try:
        questionnaire_inbox_count = await _count_questionnaire_inbox(db, current_user)
    except (HTTPException, SQLAlchemyError):
        questionnaire_inbox_count = 0
```

#### Step 3 — REFACTOR

If `app.core.exceptions.EXCEPTION_REGISTRY` (referenced by ADR-003) does
not include `NotFoundError`/`AuthorizationError` reachable from
`count_questionnaire_inbox`, leave the tuple at `(HTTPException,
SQLAlchemyError)`. Future ADR-003 follow-up may convert
`ensure_business_view_access` to raise `AuthorizationError`; that is OUT
OF SCOPE for #12.

### Lock/TOML/contract updates

- Architecture lock test (if added) declares `pytestmark = pytest.mark.contract`.
- No TOML edits.

### Doc updates (same commit)

- None required (narrow-and-test only).

### Verification commands

- `pytest tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py -q`.
- `pytest tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py -q`
  (if added).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit. Title: `fix(users): narrow blanket-except in users summary endpoint`.

### Rollback

Revert single commit.

### Effort

S (≤2h).

---

## Item #15 — D-N2 — Add `access_user` capability surface (8th surface) to catalog

### Context (Phase 4 corrections)

- Phase 2-B verdict: CONFIRM —
  `verify-loop-b-07-endpoints.md:117`.
- 7 catalog fields verified verbatim at
  `backend/app/schemas/access.py:66-72`:
  - line 66 `can_edit_identity: bool`
  - line 67 `can_edit_business_access: bool`
  - line 68 `can_edit_role: bool`
  - line 69 `can_deactivate: bool`
  - line 70 `can_change_active_status: bool`
  - line 71 `can_break_glass_enable: bool`
  - line 72 `can_revoke_sessions: bool`
- Backend class: `backend/app/schemas/access.py:63` quote
  `class AccessUserCapabilities(BaseModel):`.
- Frontend mirror: `frontend/src/types/access.ts:51` quote
  `export interface AccessUserCapabilities {`.
- **Phase 4 Pydantic↔Zod parity directive**: catalog parser at
  `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
  (`_extract_typescript_schema_body`) requires Zod schemas declared via
  `passthroughObject({...})`. Today FE `access.ts:51` is a TS interface,
  not a Zod schema — the catalog ADD MUST also create a Zod
  `accessUserCapabilitiesSchema = passthroughObject({ ... })` declaration
  in `frontend/src/services/api/schemas/...` and point the catalog there.

### Files in scope

- `docs/security/capability-catalog.json` — add 8th surface object.
- `docs/security/authorization-capability-contract.md` — add matrix row.
- New `frontend/src/services/api/schemas/entities/access.ts` (or
  appropriate sibling location) defining
  `accessUserCapabilitiesSchema = passthroughObject({...})` so the catalog
  parser can read it.
- `frontend/src/types/access.ts:51-58` — keep, but cross-reference the
  new Zod schema.
- New: `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`.

### TDD recipe

#### Step 1 — RED test (write FIRST)

Create `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`:

```python
"""Lock that capability-catalog declares an access_user surface."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"

EXPECTED_FIELDS = {
    "can_edit_identity",
    "can_edit_business_access",
    "can_edit_role",
    "can_deactivate",
    "can_change_active_status",
    "can_break_glass_enable",
    "can_revoke_sessions",
}


def _catalog() -> dict:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def test_access_user_surface_declared() -> None:
    surfaces = _catalog()["surfaces"]
    ids = {entry["id"] for entry in surfaces}
    assert "access_user" in ids


def test_access_user_surface_points_at_backend_schema() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    assert surface["backend"]["path"] == "backend/app/schemas/access.py"
    assert surface["backend"]["class"] == "AccessUserCapabilities"


def test_access_user_surface_points_at_frontend_zod_schema() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    fe_path = REPO_ROOT / surface["frontend"]["path"]
    assert fe_path.exists(), surface["frontend"]
    body = fe_path.read_text(encoding="utf-8")
    schema_name = surface["frontend"]["schema"]
    # Phase 4 catalog-parser requirement: passthroughObject({...}) literal.
    assert f"{schema_name} = passthroughObject(" in body or (
        f"const {schema_name}" in body and "passthroughObject(" in body
    )


def test_access_user_surface_lists_seven_fields() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    assert set(surface["fields"]) == EXPECTED_FIELDS
```

All four assertions FAIL today.

Add an empirical wrapper test running
`python3 scripts/security/validate_authz_capability_contract.py` and
asserting exit 0 — gate per AGENTS.md:205. May reuse an existing wrapper if
already present (search before adding).

#### Step 2 — GREEN code/data edits

1. Create `frontend/src/services/api/schemas/entities/access.ts` (or
   place inside an existing `entities/` neighbor following the repo's
   schema pattern). Required body shape:

```typescript
import { passthroughObject } from "../common";
import { z } from "zod";

export const accessUserCapabilitiesSchema = passthroughObject({
  can_edit_identity: z.boolean(),
  can_edit_business_access: z.boolean(),
  can_edit_role: z.boolean(),
  can_deactivate: z.boolean(),
  can_change_active_status: z.boolean(),
  can_break_glass_enable: z.boolean(),
  can_revoke_sessions: z.boolean(),
});

export type AccessUserCapabilitiesParsed =
  z.infer<typeof accessUserCapabilitiesSchema>;
```

(Adjust the import path of `passthroughObject` to wherever the helper
lives — search `frontend/src/services/api/schemas/common.ts` for the
canonical export.)

2. Edit `docs/security/capability-catalog.json` — append an 8th surface
   to the `surfaces` array (after `vendor`):

```json
{
  "id": "access_user",
  "backend": {
    "path": "backend/app/schemas/access.py",
    "class": "AccessUserCapabilities"
  },
  "frontend": {
    "path": "frontend/src/services/api/schemas/entities/access.ts",
    "schema": "accessUserCapabilitiesSchema"
  },
  "fields": [
    "can_edit_identity",
    "can_edit_business_access",
    "can_edit_role",
    "can_deactivate",
    "can_change_active_status",
    "can_break_glass_enable",
    "can_revoke_sessions"
  ]
}
```

3. Edit `docs/security/authorization-capability-contract.md` — add a row in
   the capability matrix referencing the new `access_user` surface and the
   schema/Zod paths.

#### Step 3 — REFACTOR

Verify the existing `frontend/src/types/access.ts:51-58` interface still
parses correctly (TS-only). Optionally derive it from the Zod schema via
`z.infer` to remove drift surface; this is OPTIONAL.

### Lock/TOML/contract updates

- New architecture lock IS the contract assertion.
- `architecture/test_authz_contract_doc_drift_red.py` reads the contract
  doc — adding `access_user` MUST NOT delete any existing substring needles.
  Cross-check before commit.
- `architecture/test_w11_docs_index_completeness_red.py` substring asserts
  must still pass.
- No TOML edits.

### Doc updates (same commit)

- `docs/security/authorization-capability-contract.md` — matrix update.
- Capability catalog change.
- Optional: cross-link from `AGENTS.md:209` if the catalog file is listed
  there (verify text — today references the JSON canonical source).

### Verification commands

- `pytest tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py -q`
  (turns green after edits).
- `python3 scripts/security/validate_authz_capability_contract.py`
  (must exit 0 — drift gate).
- `make -f scripts/Makefile test-architecture-locks`.
- `cd frontend && npx tsc --noEmit` (Zod schema typecheck).
- `cd frontend && npm run test:run` (Vitest — Zod schema parses).

### Commit boundary

ONE commit. Title: `feat(security): add access_user surface (8th) to capability catalog`.

### Rollback

Revert single commit; no schema migrations.

### Effort

M (half-day; doc + Zod schema + matrix update + test).

---

## Item #58 — S8.3 — Delete `OrphanedItemService` static-method class + facade

### Context (Phase 4 corrections)

- Phase 4 directive: 7 dotted call sites in `endpoints/orphaned_items.py`
  at lines 45, 70, 119, 120, 147, 164, 187 (NOT 8 — line 25 was the
  import, not a call).
- Static-method class at `backend/app/services/_orphaned_items/service.py:20`
  quote `class OrphanedItemService:`.
- Facade at `backend/app/services/orphaned_item_service.py:3` quote
  `from app.services._orphaned_items.service import OrphanedItemService`.
- Underlying module-level functions live in
  `_orphaned_items/{flagging,reads,resolution,stats}.py`. Verify each is
  exposed via the package or imported directly from the concrete module.

### Files in scope

- `backend/app/api/v1/endpoints/orphaned_items.py:25` quote
  `from app.services.orphaned_item_service import OrphanedItemService` (replace).
- `backend/app/api/v1/endpoints/orphaned_items.py:45,70,119,120,147,164,187` (call-site rewrite).
- `backend/app/services/orphaned_item_service.py` (delete).
- `backend/app/services/_orphaned_items/service.py` (delete; only contains the static-method class).
- `backend/app/services/_orphaned_items/__init__.py` (extend if needed; today only re-exports the docstring — verify direct imports work via concrete modules).
- New: `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`.

### TDD recipe

#### Step 1 — RED test (write FIRST)

Create `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`:

```python
"""Lock OrphanedItemService facade and static-method class removal."""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_orphaned_item_service_facade_module_deleted() -> None:
    facade = REPO_ROOT / "backend/app/services/orphaned_item_service.py"
    assert not facade.exists()


def test_orphaned_item_service_class_removed_from_internal_package() -> None:
    try:
        service_mod = importlib.import_module(
            "app.services._orphaned_items.service"
        )
    except ModuleNotFoundError:
        return  # entire module file removed = acceptable
    assert not hasattr(service_mod, "OrphanedItemService")


def test_endpoints_do_not_reference_orphaned_item_service() -> None:
    endpoint_path = (
        REPO_ROOT / "backend/app/api/v1/endpoints/orphaned_items.py"
    )
    source = endpoint_path.read_text(encoding="utf-8")
    assert "OrphanedItemService" not in source
    assert "orphaned_item_service" not in source


def test_module_level_orphan_functions_directly_callable() -> None:
    pkg = importlib.import_module("app.services._orphaned_items")
    for name in (
        "scan_uncategorised_items",
        "get_pending_orphans_with_details",
        "get_orphan_stats",
        "get_orphan_detail",
        "resolve_orphan",
    ):
        assert callable(getattr(pkg, name, None)), name
```

All four FAIL today.

#### Step 2 — GREEN code edits

1. Update `backend/app/services/_orphaned_items/__init__.py` to re-export
   the 5 functions consumed by `endpoints/orphaned_items.py`:

```python
"""Internal implementation for orphaned item management.

Public callable surface is exposed via this package's module-level imports.
"""
from .flagging import flag_orphaned_items, scan_uncategorised_items
from .reads import (
    get_orphan_detail,
    get_pending_orphans,
    get_pending_orphans_with_details,
)
from .resolution import _get_fallback_owner_id, resolve_orphan
from .stats import get_orphan_stats

__all__ = [
    "flag_orphaned_items",
    "get_orphan_detail",
    "get_orphan_stats",
    "get_pending_orphans",
    "get_pending_orphans_with_details",
    "resolve_orphan",
    "scan_uncategorised_items",
    "_get_fallback_owner_id",
]
```

2. Edit `backend/app/api/v1/endpoints/orphaned_items.py:25`:

Replace `from app.services.orphaned_item_service import OrphanedItemService`
with:

```python
from app.services._orphaned_items import (
    get_orphan_detail,
    get_orphan_stats,
    get_pending_orphans_with_details,
    resolve_orphan,
    scan_uncategorised_items,
)
```

3. Rewrite the 7 call sites:

- `:45` from `OrphanedItemService.scan_uncategorised_items(db)` to
  `scan_uncategorised_items(db)`.
- `:70` from `OrphanedItemService.get_pending_orphans_with_details(...)`
  to `get_pending_orphans_with_details(...)`.
- `:119` from `OrphanedItemService.get_orphan_stats(...)` to
  `get_orphan_stats(...)`.
- `:120` from `OrphanedItemService.get_pending_orphans_with_details(...)`
  to `get_pending_orphans_with_details(...)`.
- `:147` from `OrphanedItemService.get_orphan_stats(...)` to
  `get_orphan_stats(...)`.
- `:164` from `OrphanedItemService.get_orphan_detail(...)` to
  `get_orphan_detail(...)`.
- `:187` from `OrphanedItemService.resolve_orphan(...)` to
  `resolve_orphan(...)`.

4. Delete `backend/app/services/_orphaned_items/service.py` entirely.

5. Delete `backend/app/services/orphaned_item_service.py` entirely.

#### Step 3 — REFACTOR

Verify no remaining importer outside the deleted files. Run
`grep -rn "OrphanedItemService\|orphaned_item_service" backend/ tests/` and
expect zero hits.

### Lock/TOML/contract updates

- New architecture lock IS the contract.
- No TOML edits — the facade is not pinned in any allowlist.

### Doc updates (same commit)

- None required — Domain 8 confirms no README references the deleted file.

### Verification commands

- `pytest tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py -q`
  (turns green after edits).
- `pytest tests/backend/pytest/test_admin_orphans.py -q` (regression).
- `pytest tests/backend/pytest/api/v1/ -q` (broad).
- `make -f scripts/Makefile test-architecture-locks`.

### Commit boundary

ONE commit. Title: `refactor(orphans): delete OrphanedItemService facade and static-method class`. Endpoint rewrite + service.py deletion + facade.py deletion + new lock all ship together.

### Rollback

Revert single commit.

### Effort

M (half-day; 7 call-site edits + 2 file deletions + package __init__ update + test).

---

## Cross-domain handoff notes

### Items downstream of this loop

- **Approvals / Issues domains**: unaffected. No approval/issue module
  imports `validate_risk_type`, `linked_risk_names_for_visible_ids`,
  `generate_risk_id_code`, `OrphanedItemService`, or any inline schema we
  move under #38.
- **Reports / audit-trail (#11 sibling)**: parity test at
  `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` is the
  upstream contract; #11 brings execution-list projection into parity.
  No reports-side change.
- **Frontend implications**:
  - #11: `linked_risks: Optional[list[str]] = None` (`schemas/execution.py:82`)
    shape unchanged; only string contents flip from process names to risk
    names. Spot-check FE snapshot tests asserting specific `linked_risks`
    contents — may need fixture refresh (NOT a #11 task).
  - #38: `BatchSendRiskFilters` rename — verify
    `frontend/src/services/api/schemas/riskHub.ts` Zod parser still aligns
    with backend wire payload (field names and counts unchanged; only
    Python class identifier renamed).
  - #15: ADD a new Zod schema file at
    `frontend/src/services/api/schemas/entities/access.ts` referenced by
    the catalog. Coordinate with frontend-architecture domain owner.
- **Tests touched**: 8 NEW test files; 1 modified assertion line
  (`test_executions.py:325`); 1 facade re-export update
  (`_orphaned_items/__init__.py`).

### Validator-touching items (with rationale)

- **#19 (S1.4)** — Touches `validate_authz_capability_contract.py` only as
  a sanity check (no capability change). Authz contract validator MUST
  stay green; #19 is a service-policy refactor, not an authz change.
- **#15 (D-N2)** — DIRECTLY touches the validator:
  - `scripts/security/validate_authz_capability_contract.py` is the gate
    for the catalog change; new `access_user` surface MUST cause the
    validator to discover, parse (via the Zod `passthroughObject({...})`
    body), and pass field-shape parity.
  - `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
    (the `_extract_typescript_schema_body` parser) MUST resolve the new
    `accessUserCapabilitiesSchema = passthroughObject({...})` literal.
  - This is the ONLY recipe where validator behavior changes; all other
    items are validator-neutral.

### Phase 4 corrections applied per item

- **#1**: none beyond Loop-1 plan; verified DELETE is correct.
- **#11**: test-inversion-in-same-commit directive applied; new
  positive/negative parity assertions mirror `test_reports_audit.py`.
- **#19**: HTTP 400 wire parity verified end-to-end via
  `core/exceptions.py:67,89-95,112-118` and `main.py:237`.
- **#20**: DOWNGRADE to DOC-ONLY; structural lock test added; verification
  date bump in `ENDPOINT_INVARIANTS.md`.
- **#10**: REJECT-CONFIRMED upheld; presence-lock test added per Phase 4.
- **#12**: narrow target re-anchored from `AuthorizationError` to
  `HTTPException` for `_can_view_governance` (matches `evaluation.py:53`
  raise type). `_build_shell_summary` narrowed to
  `(HTTPException, SQLAlchemyError)`.
- **#15**: 7 fields verified verbatim at `access.py:66-72`; FE Zod schema
  via `passthroughObject({...})` MANDATORY for catalog parser.
- **#21**: confirmed two callers (no third-party importer); deepening
  contract pins different symbols.
- **#38**: `RiskFilters` → `BatchSendRiskFilters` rename added; sequencing
  AFTER #10 (presence-lock first).
- **#58**: 7 dotted call sites (NOT 8 per Loop-A); package __init__ re-
  export update added to support direct module-level callers.

### Sequencing inside this domain

```
#1 (S, A-N1)
  └── #19 (S, S1.4)
        └── #11 (S, S2.7)
              └── #20 (S, S1.6 doc-only)
                    └── #10 (S, S8.5 presence-lock)
                          └── #38 (M, S8.6 schema move)
                                └── #21 (S, S2.6 link loader collapse)
                                      └── #12 (S, D-N3 except narrow)
                                            └── #15 (M, D-N2 catalog)
                                                  └── #58 (M, S8.3 facade delete)
```

(Single sequential developer; ordering is hard-required only between #1→#19
and #10→#38; remaining edges are sequencing hygiene to keep diffs reviewable.)

### Verification gates implicated

- Backend pytest: `test_risks.py`, `test_executions.py`,
  `test_risk_id_generation.py`, `api/v1/test_reports_audit.py`,
  `api/v1/test_riskhub_questionnaires.py`, `test_health.py`,
  `test_admin_orphans.py`, plus 8 new test files.
- Architecture locks: `make -f scripts/Makefile test-architecture-locks`
  must include all 8 new `_red` files.
- Frontend gate: `cd frontend && npm run test:run` and `npx tsc --noEmit`
  for #38 and #15.
- Authz contract gate: `python3 scripts/security/validate_authz_capability_contract.py`
  for #15 (and as sanity for #19).
- Backend integration: `client_factory` from
  `tests/backend/pytest/conftest.py` for #19 (parity test) and #12 (blanket-
  except behavioral test).

### Effort summary

| Item | Effort | New tests | Source files edited | Doc files edited |
| ---- | ------ | --------- | ------------------- | ---------------- |
| #1   | S | 1 | 1 (`crud/__init__.py`) | 1 |
| #19  | S | 2 | 2 (`crud/_shared.py` deletion, `crud/create.py`) | 2 |
| #11  | S | 0 (1 modified) | 1 (`workflow.py`) | 2 |
| #20  | S | 1 | 0 | 3 |
| #10  | S | 1 | 1 (`riskhub_questionnaires.py` docstring) | 0–1 |
| #38  | M | 1 | 6 (3 endpoint edits + 3 schema files) | 0 |
| #21  | S | 1 | 2 (`link_policy.py`, `link_governance.py`) | 0 |
| #12  | S | 1–2 | 1 (`users/summary.py`) | 0 |
| #15  | M | 1 | 1 FE (Zod schema), 1 catalog JSON, 1 contract MD | 1 |
| #58  | M | 1 | 3 (endpoint, package __init__, 2 deletions) | 0 |

Total domain effort: 7 × S + 3 × M ≈ 5–8 working days for one developer.

### Rollback envelope

- Every item is single-commit and revertable.
- No DB migrations touched.
- No capability-catalog spec change OUTSIDE #15 (which adds an additive
  surface).
- Authorization-capability-contract enforcement remains the gate; only #15
  meaningfully exercises the validator.

---

End of Phase 5 recipe — Risks + small endpoints (Domain 2).
