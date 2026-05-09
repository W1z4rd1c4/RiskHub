# Final Section 5 — Per-Item Recipes Part 3 — Items in Waves 6-8 (Slots 59-79+) + Migration Window Detail

Phase: **7 (production-write)**. Build commit ref: `1ee872a4` on `main`.
Source: Phase 5 recipes (`recipe-01-issues.md`, `recipe-02-risks-and-endpoints.md`, `recipe-03-approvals.md`, `recipe-04-kris.md`, `recipe-05-vendor-migration.md`, `recipe-06-frontend-deadcode.md`, `recipe-07-frontend-authz.md`, `recipe-08-crosscut-adrs.md`).
Phase 6 corrections applied: see verify-recipe-01..08 reports.
Master sequence: `plan-loop-3-07-integration-v2.md:343-422` (79 items).

This section documents items in **Waves 6a, 6b, 7, and 8** of the 79-item v2 master sequence:

- **Wave 6a (slots 59-66) — P3 infrastructure + #77a**: #42, #58, #63, #46 (L+), #65 (CRITICAL: literal flat schemas), #67, #62, #77a, #45a
- **Wave 6b (slots 67-71) — P3 capability + admin**: #39, #40, #66 (CRITICAL: render-counter test), #45b
- **Wave 7 (slots 72-76) — P4 deferred**: #68, #71 (CRITICAL: single-flight preservation), #60
- **Wave 8 (slots 77-79+) — Migration + FE TS cleanup**: #69+#70 atomic (XL), #77b

Plus the **Detailed Migration Window section** for #69+#70 (the 9-step sequence, all 8 RED tests including 4 NEW Phase 4 tests, snapshot/restore procedure, postgres-lane test plan).

All recipes assume single sequential developer; TDD red→green; new architecture
tests carry `pytestmark = pytest.mark.contract`; backend integration tests use
`client_factory` from `tests/backend/pytest/conftest.py`. Quote rule: ≤15 words.

> **Phase 6 critical corrections applied to this section** (key list):
>
> - **#46**: 33 inline `queryKey: [` literals (verified by fresh grep, NOT 45);
>   per-commit budget ratchet test pattern.
> - **#65 CRITICAL**: literal flat schemas only — parser at
>   `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
>   does NOT walk `.merge()` / `.extend()`. Each entity Zod schema copies
>   fields verbatim.
> - **#66**: render-counter test pattern (`useRef(0)` + `useEffect(() => { count.current += 1 })`).
> - **#71**: module-scope state at `frontend/src/services/session/sso.ts:9-11`
>   (`refreshInFlight`, `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`)
>   MUST survive merge.
> - **#39**: `AdminConsoleCapabilities` is a 4-boolean static stub at
>   `backend/app/api/v1/endpoints/admin/capabilities.py:14-22` with
>   `_ = current_user` line; replace with role-aware builder.
> - **#69+#70 atomic CRITICAL fixes**:
>   1. `tests/backend/pytest/migrations/` directory does NOT exist — recipe
>      must create `__init__.py` + conftest.py with postgres fixtures.
>   2. `make -f scripts/Makefile postgres-up` does NOT exist — use
>      `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`.
>   3. Include all 4 NEW Phase 4 RED tests: idempotency, concurrent-write,
>      FK-orphan precheck, partial-failure recovery.
>   4. Down_revision is `j5k6l7m8n9o0` (current head verified at
>      `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).
> - **#77a**: use literal `'active'` (NOT `VENDOR_STATUS_VALUES[0]`).
> - **#77b**: post-migration; touches `frontend/src/types/vendor.ts:1,64,94`.

---

## Wave 6a — P3 Infrastructure + #77a (Slots 59-69, 60.5h, Weeks 10-11)

Wave 6a sets up FE infrastructure for the next sub-wave; #46's L+ query-keys
factory unblocks 3 dependent items in Wave 6b/7. **Validator runs**: 0 (Wave 6a
infrastructure does NOT touch the capability contract).

---

### Item #1 (Section 5) — #42 — `ActorPayloadModel(OutboxPayloadModel)` shared base

**Wave**: 6a  | **Slot**: v2 Seq 61  | **Effort**: S (~1h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

Six outbox payload classes redeclare `actor_user_id: int` verbatim. A shared
`ActorPayloadModel(OutboxPayloadModel)` base, inserted into
`backend/app/services/outbox/payloads.py`, deduplicates the field while
preserving Pydantic serialization shape. Three approval payloads
(`ApprovalRequestCreatedPayload`, `ApprovalRequestResolvedPayload`,
`ApprovalRequestCancelledPayload`) intentionally retain direct
`OutboxPayloadModel` inheritance — they have no `actor_user_id` (cancelled has
`cancelled_by_user_id` instead). Audit ID = #42; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 61 (`plan-loop-3-07-integration-v2.md:404`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/outbox/payloads.py` (especially `:13`, `:30-61`, `:105-121`).
- [ ] Confirm outbox call-site lock at
  `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49`
  scans CALL SITES, not payload classes — the base introduction is invisible.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/test_outbox_actor_payload_base_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""BE-N2: ActorPayloadModel base introduces shared actor_user_id field."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

from app.services.outbox.payloads import (
    ActorPayloadModel,
    OutboxPayloadModel,
    ApprovalRequestCreatedPayload,
    ApprovalRequestResolvedPayload,
    ApprovalRequestCancelledPayload,
    IssueAssignedPayload,
    IssueExceptionRequestedPayload,
    IssueExceptionApprovedPayload,
    QuestionnaireSentPayload,
    QuestionnaireSubmittedPayload,
    QuestionnaireClarificationRequestedPayload,
)


def test_actor_payload_model_base_shape() -> None:
    assert ActorPayloadModel.__bases__ == (OutboxPayloadModel,)
    field = ActorPayloadModel.model_fields["actor_user_id"]
    assert field.annotation is int


@pytest.mark.parametrize(
    "cls",
    [
        IssueAssignedPayload,
        IssueExceptionRequestedPayload,
        IssueExceptionApprovedPayload,
        QuestionnaireSentPayload,
        QuestionnaireSubmittedPayload,
        QuestionnaireClarificationRequestedPayload,
    ],
)
def test_actor_payload_inherits(cls) -> None:
    assert ActorPayloadModel in cls.__mro__


@pytest.mark.parametrize(
    "cls",
    [
        ApprovalRequestCreatedPayload,
        ApprovalRequestResolvedPayload,
        ApprovalRequestCancelledPayload,
    ],
)
def test_approval_payload_does_not_inherit_actor_base(cls) -> None:
    assert ActorPayloadModel not in cls.__mro__
```

**Expected result**: RED at HEAD — `ActorPayloadModel` does not exist; current
6 actor classes inherit `OutboxPayloadModel` directly.

#### TDD Step 2 — Implement Change

**File: `backend/app/services/outbox/payloads.py`**:

1. Insert immediately after line `:13`:

```python
class ActorPayloadModel(OutboxPayloadModel):
    """Shared base for outbox payloads that carry the acting user's id."""
    actor_user_id: int
```

2. At lines `:30-61`, rewrite 6 class bases:
   - `IssueAssignedPayload(OutboxPayloadModel)` → `IssueAssignedPayload(ActorPayloadModel)`; drop `actor_user_id: int` field at `:33`.
   - `IssueExceptionRequestedPayload(OutboxPayloadModel)` → `IssueExceptionRequestedPayload(ActorPayloadModel)`; drop `:38`.
   - `IssueExceptionApprovedPayload(OutboxPayloadModel)` → `IssueExceptionApprovedPayload(ActorPayloadModel)`; drop `:43`.
   - `QuestionnaireSentPayload(OutboxPayloadModel)` → `QuestionnaireSentPayload(ActorPayloadModel)`; drop `:50`.
   - `QuestionnaireSubmittedPayload(OutboxPayloadModel)` → `QuestionnaireSubmittedPayload(ActorPayloadModel)`; drop `:55`.
   - `QuestionnaireClarificationRequestedPayload(OutboxPayloadModel)` → `QuestionnaireClarificationRequestedPayload(ActorPayloadModel)`; drop `:61`.

3. At `__all__` block `:105-121`, add `"ActorPayloadModel"`.

4. Three approval payloads (`ApprovalRequestCreatedPayload:16`,
   `ApprovalRequestResolvedPayload:20`, `ApprovalRequestCancelledPayload:25`)
   UNCHANGED — they remain `OutboxPayloadModel` direct subclasses.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None. Outbox call-site lock at
  `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` is unaffected
  (it scans `OutboxService.enqueue(...)` keyword args, not payload classes).

#### README / doc updates (same commit)

- None — internal Pydantic refactor; not a contract surface change.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py -q` — must remain green.
3. `pytest tests/backend/pytest -q -k "outbox"` — broad outbox suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/outbox` — clean.
6. `mypy backend/app/services/outbox` — clean.

#### Commit boundary

Single commit titled
`refactor(outbox): introduce ActorPayloadModel shared base for actor-bearing payloads`.
RED test + base introduction + 6 inheritance edits + `__all__` update in same commit.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert the commit. Reverting collapses 6 inheritance lines and
  restores duplicated `actor_user_id: int` declarations. Zero data implication;
  serialized payloads unchanged (Pydantic field shape is identical).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~1h (small refactor + 1 architecture test + verification).
- Risk: very low — Pydantic field declarations are class-level; the change is
  inheritance-only.
- Mitigations: structural test pins the base shape and the 6/3 inheritance
  matrix; outbox call-site lock unchanged.

---

### Item #2 (Section 5) — #58 — Delete `OrphanedItemService` static-method class + facade

**Wave**: 6a  | **Slot**: v2 Seq 62  | **Effort**: M (~half-day)  | **Priority**: P3  | **Domain**: endpoints

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`OrphanedItemService` is a static-method class living at
`backend/app/services/_orphaned_items/service.py:20`, surfaced through a
20-line facade at `backend/app/services/orphaned_item_service.py:3`. Phase 4
verified **7 dotted call sites** in
`backend/app/api/v1/endpoints/orphaned_items.py` at lines 45, 70, 119, 120,
147, 164, 187 (NOT 8 — line 25 was the import, not a call). Underlying
module-level functions live in
`_orphaned_items/{flagging,reads,resolution,stats}.py`. Audit ID = #58;
developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 62 (`plan-loop-3-07-integration-v2.md:405`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/orphaned_items.py:25,45,70,119,120,147,164,187`
  - `backend/app/services/_orphaned_items/service.py:20`
  - `backend/app/services/orphaned_item_service.py:3`
  - `backend/app/services/_orphaned_items/{flagging,reads,resolution,stats}.py`
  - `backend/app/services/_orphaned_items/__init__.py`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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

**Expected result**: RED. All four assertions FAIL today.

#### TDD Step 2 — Implement Change

1. Update `backend/app/services/_orphaned_items/__init__.py` to re-export the 5
   functions consumed by the endpoint module:

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

2. Edit `backend/app/api/v1/endpoints/orphaned_items.py:25`. Replace
   `from app.services.orphaned_item_service import OrphanedItemService` with:

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
   - `:45` `OrphanedItemService.scan_uncategorised_items(db)` → `scan_uncategorised_items(db)`
   - `:70` `OrphanedItemService.get_pending_orphans_with_details(...)` → `get_pending_orphans_with_details(...)`
   - `:119` `OrphanedItemService.get_orphan_stats(...)` → `get_orphan_stats(...)`
   - `:120` `OrphanedItemService.get_pending_orphans_with_details(...)` → `get_pending_orphans_with_details(...)`
   - `:147` `OrphanedItemService.get_orphan_stats(...)` → `get_orphan_stats(...)`
   - `:164` `OrphanedItemService.get_orphan_detail(...)` → `get_orphan_detail(...)`
   - `:187` `OrphanedItemService.resolve_orphan(...)` → `resolve_orphan(...)`

4. Delete `backend/app/services/_orphaned_items/service.py` entirely.

5. Delete `backend/app/services/orphaned_item_service.py` entirely.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py -q
```

Verify no remaining importer outside the deleted files via:

```
grep -rn "OrphanedItemService\|orphaned_item_service" backend/ tests/
```

Expect zero hits (modulo the one inside the new test file's docstring/asserts,
which the test itself filters).

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML edits — the facade is not pinned in any allowlist.

#### README / doc updates (same commit)

- None required — Domain 8 confirms no README references the deleted file.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py -q` — pass.
2. `pytest tests/backend/pytest/test_admin_orphans.py -q` — regression pass.
3. `pytest tests/backend/pytest/api/v1/ -q` — broad endpoints pass.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_orphaned_items backend/app/api/v1/endpoints/orphaned_items.py` — clean.
6. `mypy backend/app/services/_orphaned_items backend/app/api/v1/endpoints/orphaned_items.py` — clean.

#### Commit boundary

Single commit titled
`refactor(orphans): delete OrphanedItemService facade and static-method class`.
Endpoint rewrite + service.py deletion + facade.py deletion + __init__ update +
new lock all ship together.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert the single commit; restores 20-line facade + 7 call-site
  rewrites + the static-method class.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~half-day (7 call-site edits + 2 file deletions + package
  __init__ update + 1 architecture test + verification).
- Risk: low — pure routing through module-level functions; no behavior change.
- Mitigations: structural test pins facade absence + class absence + endpoint
  source absence + functional callability.

---

### Item #3 (Section 5) — #63 — Outbox dispatch SchedulerJobRun instrumentation

**Wave**: 6a (per Section 2 master placement)  | **Slot**: v2 Seq 63 | **Effort**: M (5-7h)  | **Priority**: P3  | **Domain**: endpoints

> Section-2 reconciliation note: Section 2 places #63 in row 73 (Wave 6b
> placeholder); the v2 sequence puts it at Seq 63 in Wave 6a. This recipe
> follows the v2 sequence slot. No semantic difference — the work is identical
> either way.

**Dependencies**: none (additive)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/services/outbox/dispatcher.py` runs the dispatch loop without
recording a `SchedulerJobRun` row. Operators have no observable evidence that
the dispatcher started, completed, or failed. The `SchedulerJobRun` model
already exists at `backend/app/models/scheduler_job_run.py:15-37` (no schema
change needed). The work is additive: instrument entry + success + failure
transitions, then verify admin endpoints (`/jobs/status`, `/outbox/status`)
return their existing shapes unchanged. Audit ID = #63; developer verdict =
ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 63 (`plan-loop-3-07-integration-v2.md:406`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/services/outbox/dispatcher.py`
  - `backend/app/models/scheduler_job_run.py:15-37`
  - `backend/app/api/v1/endpoints/admin/console.py:49,58` (admin /jobs/status, /outbox/status routes)
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (architecture)**:
`tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py`

```python
"""BE-N7: outbox dispatcher instruments SchedulerJobRun on entry and exit."""
from __future__ import annotations

import ast
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
DISPATCHER = REPO_ROOT / "backend/app/services/outbox/dispatcher.py"


def test_dispatcher_imports_scheduler_job_run() -> None:
    src = DISPATCHER.read_text()
    assert "SchedulerJobRun" in src, "dispatcher must import SchedulerJobRun"


def test_dispatcher_writes_scheduler_job_run() -> None:
    """At least one constructor call SchedulerJobRun(...) in dispatcher."""
    tree = ast.parse(DISPATCHER.read_text())
    found = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            name = f.id if isinstance(f, ast.Name) else getattr(f, "attr", None)
            if name == "SchedulerJobRun":
                found = True
                break
    assert found, "dispatcher must construct SchedulerJobRun rows"
```

**Test file 2 (behavioral)**:
`tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py`

```python
"""BE-N7: dispatch_pending_outbox_events records a SchedulerJobRun row."""
from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.scheduler_job_run import SchedulerJobRun
from app.services.outbox.dispatcher import dispatch_pending_outbox_events

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_dispatch_records_running_then_succeeded(
    client_factory, queued_outbox_event, current_user,
) -> None:
    """One queued event → one SchedulerJobRun in 'succeeded' with events_processed=1."""
    async with client_factory(current_user=current_user) as ac:
        async with ac.app.state.db_factory() as db:
            await dispatch_pending_outbox_events(db)
            rows = await db.execute(select(SchedulerJobRun).order_by(SchedulerJobRun.id.desc()))
            run = rows.scalars().first()
    assert run is not None
    assert run.job_name == "outbox_dispatch"
    assert run.status == "succeeded"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert (run.result_json or {}).get("events_processed") == 1
```

**Expected result**: RED on both files; `SchedulerJobRun` not constructed in
dispatcher; no row written.

#### TDD Step 2 — Implement Change

In `backend/app/services/outbox/dispatcher.py`, at the start of
`dispatch_pending_outbox_events`:

```python
from uuid import uuid4
from app.core.datetime_utils import utc_now
from app.models.scheduler_job_run import SchedulerJobRun
from app.core.config import settings

run = SchedulerJobRun(
    job_name="outbox_dispatch",
    run_id=str(uuid4()),
    status="running",
    trigger_type="dispatch",
    instance_id=settings.instance_id,
    started_at=utc_now(),
)
db.add(run)
await db.flush()
```

On success path (after the dispatch loop completes):

```python
run.status = "succeeded"
run.finished_at = utc_now()
run.duration_ms = int((run.finished_at - run.started_at).total_seconds() * 1000)
run.result_json = {"events_processed": events_processed}
```

On failure (within the existing except for `FatalOutboxError` /
`RetryableOutboxError`):

```python
run.status = "failed"
run.finished_at = utc_now()
run.error_message = str(exc)[:1024]
```

The persistence happens within the existing service-owned transaction (per
ADR-002). Per the recipe `recipe-08-crosscut-adrs.md:283-285`, "the
`SchedulerJobRun` write must occur within an existing service-owned scope, NOT
via a new `db.commit()` at the dispatcher seam."

Optionally extract a helper `record_scheduler_run` inside `dispatcher.py` so
the entry/success/error transitions reuse one block.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py -q
pytest tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None new.

#### README / doc updates (same commit)

- `backend/app/services/outbox/README.md` (if exists) — note that dispatcher
  records `SchedulerJobRun` for each dispatch run.
- `docs/agent/ENDPOINT_INVARIANTS.md` — no edit needed; admin endpoint shapes
  unchanged.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py -q` — pass.
2. `pytest tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py -q` — pass.
3. `pytest tests/backend/pytest -q -k "outbox or scheduler or admin_console"` — broad regression pass.
4. `pytest tests/backend/pytest/api/v1/admin/test_admin_console.py -q` (or equivalent) — admin shapes unchanged.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/outbox` — clean.
7. `mypy backend/app/services/outbox` — clean.

#### Commit boundary

Single commit titled
`feat(outbox): instrument dispatch with SchedulerJobRun`. Architecture lock +
behavioral test + dispatcher edit + (optional) helper extraction together.

#### Rollback

- Class: **PURE-CODE** (additive, no schema change).
- Procedure: revert single commit; SchedulerJobRun model stays idle.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 5-7h (instrumentation + 2 tests + admin endpoint regression
  verification).
- Risk: medium — touches dispatch loop; per-flush race on `finished_at` if the
  outer transaction rolls back. Mitigation: persist within service-owned tx;
  failure path sets `status="failed"` before re-raise.

---

### Item #4 (Section 5) — #46 — Promote resource query-key factories (with budget-ratchet)

**Wave**: 6a  | **Slot**: v2 Seq 64  | **Effort**: **L+ (24-28h, NOT L)**  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no — but **gates #65 (Seq 65), #67 (Seq 66), #68 (Seq 75)**

#### Why this work

Inline `queryKey: ['...']` literals scattered across the frontend prevent
typed factories from owning each query key family; Phase 4/Phase 6 fresh grep
returned **33** inline `queryKey: [` literals (NOT 45) across ~17 source
files. The L+ effort reflects the staged 5-commit migration with a
ratcheting budget test that drops to 0 by the final commit. Audit ID = #46;
developer verdict = ACCEPT.

> **Phase 6 critical correction**: 33 inline literals (NOT 45). Distribution
> by domain: ~12 in riskHub (capabilities, global config, departments, roles,
> permissions, riskTypes, approvalScenarios, public risk types, thresholds,
> total assets value, etc.), ~13 in admin sections, ~8 in remaining domains
> (governance, dashboard, docs, users).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 64 (`plan-loop-3-07-integration-v2.md:407`).
- [ ] Confirm prerequisites complete: none.
- [ ] Run a fresh count to confirm the budget:
  `grep -rn "queryKey: \[" frontend/src --include="*.ts" --include="*.tsx" | wc -l`
  → expect 33 (lock the budget at this number).
- [ ] No concurrent feature-work conflicts on any of the 17 affected files.

#### Target factory layout (`frontend/src/lib/queryKeys/`)

| Module | Exported keys | Source files migrated |
|---|---|---|
| `riskHub.ts` | `capabilities`, `globalConfig`, `departments`, `roles`, `permissions`, `riskTypes`, `approvalScenarios`, `publicRiskTypes`, `thresholdsPublic`, `totalAssetsValue` | `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`, `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`, `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts` |
| `admin.ts` | `adminSessions`, `adminCapabilities`, `adminAuditLogs`, `adminAuditLogUsers`, `adminHealth`, `adminSchedulerStatus`, `adminOutboxStatus`, `adminStats`, `adminLogs`, `logConfig` | `pages/admin-console/sections/**/*.tsx` |
| `users.ts` | `usersAccessDepartmentManagers` | `DepartmentsPanel.tsx:42` |
| `governance.ts` | `governanceOverview` | `pages/GovernancePage.tsx:44` |
| `dashboard.ts` | `shellSummary`, `dashboardOverview` | `layout/Sidebar.tsx:37`, `pages/dashboard/useDashboardOverviewState.ts:21` |
| `docs.ts` | `settingsDocs(lang)`, `adminDocs(lang)` | `settings/DocumentationSettings.tsx:29`, `pages/DocumentationPage.tsx:27` |

Six modules cover the 33 inline literals. The "~10 modules" target from
Loop 1 is a ceiling.

#### TDD Step 1 — Write Failing Tests (RED)

**Per-commit budget ratchet test** (single test file, `MAX_INLINE_QUERY_KEYS`
constant decreases per commit):

**Test file**: `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Budget ratchet for #46: each domain-migration commit MUST decrease
 * MAX_INLINE_QUERY_KEYS. Final value: 0. Initial value (recipe-draft time): 33.
 *
 * To update after migrating a domain:
 *   1. Run the count below locally.
 *   2. Set MAX_INLINE_QUERY_KEYS to (oldValue - keysMigratedThisCommit).
 *   3. Commit MAX update + the migration in the same PR.
 */
const MAX_INLINE_QUERY_KEYS = 33; // ratchet: 33 → 21 → 8 → 0

const SRC_ROOT = path.resolve(__dirname, '../../../../../../../frontend/src');
const FACTORY_DIR = path.join(SRC_ROOT, 'lib', 'queryKeys');

function* walk(dir: string): IterableIterator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
            yield full;
        }
    }
}

describe('inline queryKey budget (#46 ratchet)', () => {
    it('does not exceed the current budget', () => {
        let count = 0;
        for (const file of walk(SRC_ROOT)) {
            if (file.startsWith(FACTORY_DIR)) continue;
            const txt = fs.readFileSync(file, 'utf8');
            count += (txt.match(/queryKey:\s*\[/g) ?? []).length;
        }
        expect(count).toBeLessThanOrEqual(MAX_INLINE_QUERY_KEYS);
    });

    it('eventually reaches zero', () => {
        if (MAX_INLINE_QUERY_KEYS > 0) {
            // soft-warn until final commit; CI surfaces in logs only
            // eslint-disable-next-line no-console
            console.warn(`#46 queryKey budget still ${MAX_INLINE_QUERY_KEYS}`);
        }
        expect(MAX_INLINE_QUERY_KEYS).toBeGreaterThanOrEqual(0);
    });
});
```

**Companion test** (`factories.test.ts`) ensures every factory module exports
`as const` arrays for type-stability of `useQuery({ queryKey: ... })`.

**Final-commit positive coverage test**: after `MAX_INLINE_QUERY_KEYS = 0`,
add `expect(count).toBe(0)` and assert each factory has ≥1 caller across
`frontend/src/`.

#### TDD Step 2 — Implement Change (5 commits)

**Commit A — bootstrap factories + budget test (budget = 33)**:
- Create `frontend/src/lib/queryKeys/{index.ts,riskHub.ts,admin.ts,users.ts,governance.ts,dashboard.ts,docs.ts}` (each as a `* as const` factory with typed `readonly` arrays).
- Create `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.budget.test.ts` (above).
- No migrations yet; budget stays at 33.

**Commit B — migrate `riskHub` domain (12 sites → budget 33→21)**:
- Edit: `useRiskHubCapabilities.ts`, `SystemSettingsPanel.tsx`,
  `DepartmentsPanel.tsx`, `useRolesPanelData.ts`, `RiskTypesPanel.tsx`,
  `ApprovalScenariosPanel.tsx`, `useRiskHubConfig.ts`.
- Replace each inline `queryKey: ['riskHubCapabilities']` →
  `queryKey: riskHubKeys.capabilities()`.
- Update `MAX_INLINE_QUERY_KEYS = 21`.

**Commit C — migrate `admin` domain (~13 sites → budget 21→8)**:
- Edit: `pages/admin-console/sections/ops/HealthPanel.tsx`, `LogsPanel.tsx`,
  `SessionsPanel.tsx`, `pages/admin-console/sections/audit/AuditLogsPanel.tsx`,
  `LogSettingsPanel.tsx`.
- Update `MAX_INLINE_QUERY_KEYS = 8`.

**Commit D — migrate remaining 4 domains (8 sites → budget 8→0)**:
- governance, dashboard, docs, users.
- Update `MAX_INLINE_QUERY_KEYS = 0`.

**Commit E — lock**: change soft-warn to `expect(count).toBe(0)`; assert
positive coverage (every factory function has ≥1 caller).

Pattern for each migration:

```diff
- const { data } = useQuery({ queryKey: ['riskHubCapabilities'], queryFn: ... });
+ const { data } = useQuery({ queryKey: riskHubKeys.capabilities(), queryFn: ... });
```

For invalidation:

```diff
- queryClient.invalidateQueries({ queryKey: ['globalConfig'] });
+ queryClient.invalidateQueries({ queryKey: riskHubKeys.globalConfig() });
```

For parameterized keys (e.g. `['users', 'access', 'department-managers', department?.id]`):

```ts
usersKeys.accessDepartmentManagers(department?.id)
// returns ['users', 'access', 'department-managers', department?.id] as const
```

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- queryKeys
cd frontend && npm run -w tests/frontend/unit lint typecheck
cd frontend && npm run -w tests/frontend/unit test
```

After Commit E: budget = 0; `factories.test.ts` asserts every factory used.

#### Lock/TOML/Contract updates (same commit)

- None of the existing backend invariant locks are touched.
- **New lock candidate**: a frontend-architecture invariant lock can ratchet
  the budget test in CI. Out of recipe scope; capture in integration log.

#### README / doc updates

- `frontend/src/lib/queryKeys/README.md` (new) — describe factory pattern and
  the per-commit budget ratchet.
- Integration log entry per commit recording the budget value.

#### Verification commands (per commit)

1. `cd frontend && npm run -w tests/frontend/unit lint` — clean.
2. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
3. `cd frontend && npm run -w tests/frontend/unit test -- queryKeys` — budget assertion holds.
4. `cd frontend && npm run -w tests/frontend/unit test` — full sweep (Commit E).

#### Commit boundary

**5 commits** in strict order A → B → C → D → E. Each commit is independently
revertable because the budget test value moves with the migration.

Per-commit titles:
- A: `feat(frontend/queryKeys): bootstrap factories + budget ratchet test`
- B: `refactor(frontend/queryKeys): migrate riskHub domain (12 sites)`
- C: `refactor(frontend/queryKeys): migrate admin domain (13 sites)`
- D: `refactor(frontend/queryKeys): migrate remaining 4 domains (8 sites)`
- E: `feat(frontend/queryKeys): lock budget at 0; add positive coverage`

#### Rollback

- Class: **STAGED** (per-commit reverts).
- Procedure: revert in order E → D → C → B → A; each commit is mechanically
  isolated.
- Estimated revert time: 5 min per commit.

#### Effort & Risk

- Estimated time: **24-28h L+** (Phase 4 promotion from L; +6 of 33 sites
  parameterized; per-commit ratchet adds review overhead; 5 commits + final
  lock pass).
- Risk: medium — `useQuery({ queryKey: factory() })` must produce array shape
  identical to current literals (otherwise React Query cache misses cascade).
- Mitigations: budget ratchet enforces strict decrease; `factories.test.ts`
  pins the array shape per factory; per-commit review catches accidental
  shape changes.

#### Handoff notes

- **Gates #65** (CRUD schema base; consumes factories).
- **Gates #67** (`useResourcePanelQuery`; takes a typed factory `queryKey`).
- **Gates #68** (`WidgetShell`; benefits from already-landed factories).
- After Commit E, integration log records: "#46 budget = 0; factories live at
  `@/lib/queryKeys/*`."

---

### Item #5 (Section 5) — #65 — Extract `crudCapabilitySchema` shared Zod base (LITERAL FLAT — NOT `.merge`)

**Wave**: 6a  | **Slot**: v2 Seq 65  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: #46 (Seq 64; query-key factories must land first)  
**Atomic with**: none  
**Validator?**: no — but Pydantic-Zod parity contract; runs `validate_authz_capability_contract.py` smoke

> **Phase 4/Phase 6 CRITICAL CONSTRAINT**: the backend Zod parser at
> `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
> uses brace-matching only. It does NOT walk `.merge()` or `.extend()`
> continuations. The recipe MUST keep each entity schema as a single
> `passthroughObject({ /* literal field list */ })` so the parser sees
> the full set. The "shared base" is a **type-level and test-level**
> contract, NOT a runtime composition.

#### Why this work

The four entity capability Zod schemas (`risks.ts`, `controls.ts`, `kris.ts`,
`vendors.ts`) all literal-include `can_read` and `can_update` plus a domain
tail. A `crudCapabilitySchema` shared base captures the common subset at the
type level and adds a structural test that pins the literal-flat shape. The
issues schema is structurally distinct (uses `can_view_*_contexts` instead of
archive/restore/create-issue) and is **explicitly NOT** built from the shared
base — Loop B confirmed.

Audit ID = #65; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 65 (`plan-loop-3-07-integration-v2.md:408`).
- [ ] Confirm prerequisites complete: #46 Commit E green; query-key factories
  available at `@/lib/queryKeys/*`.
- [ ] Verify parser at
  `scripts/security/authz_contract_validator/capability_catalog.py:112-126` is
  brace-matched only (read the function body before drafting any test).
- [ ] Verify each entity capability schema is currently a single
  `passthroughObject({ ... })` literal:
  - `frontend/src/services/api/schemas/entities/risks.ts` — locate `riskCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/controls.ts` — locate `controlCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/kris.ts` — locate `kriCapabilitiesSchema`.
  - `frontend/src/services/api/schemas/entities/vendors.ts:21-36` — locate `vendorCapabilitiesSchema`.
- [ ] Read `frontend/src/services/api/schemas/entities/issues.ts` and confirm
  `issueCapabilitiesSchema` does NOT include `can_read` / `can_update` (or
  uses `can_view_*_contexts` instead).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1**: `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.contract.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CRUD_BASE_FIELDS, crudCapabilitySchema } from
    '@/services/api/schemas/crudCapabilitySchema';

const ENTITY_DIR = path.resolve(
    __dirname, '../../../../../../../frontend/src/services/api/schemas/entities',
);

describe('crudCapabilitySchema literal-flat contract (#65)', () => {
    it('exposes CRUD_BASE_FIELDS = ["can_read", "can_update"]', () => {
        expect([...CRUD_BASE_FIELDS]).toEqual(['can_read', 'can_update']);
    });

    it('schema shape has exactly can_read and can_update', () => {
        expect(Object.keys((crudCapabilitySchema as any).shape ?? {})).toEqual(['can_read', 'can_update']);
    });

    const entityFiles = ['risks.ts', 'controls.ts', 'kris.ts', 'vendors.ts'];
    it.each(entityFiles)('%s capability schema is literal-flat (no .merge / .extend)', (rel) => {
        const src = fs.readFileSync(path.join(ENTITY_DIR, rel), 'utf8');
        // Locate the capability schema by name in the file body.
        // Each entity's capability schema includes can_read/can_update verbatim.
        expect(src).toMatch(/can_read:\s*z\.boolean\(\)/);
        expect(src).toMatch(/can_update:\s*z\.boolean\(\)/);
        // Must NOT use .merge() or .extend() against crudCapabilitySchema.
        expect(src).not.toMatch(/crudCapabilitySchema\.(merge|extend)\b/);
    });
});
```

**Test file 2**: `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.parser.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../../');
const PARSER = path.join(REPO_ROOT, 'scripts/security/authz_contract_validator/capability_catalog.py');

// Use execFileSync (argv array) to avoid shell injection.
function parseSchema(file: string, schema: string): string[] {
    const out = execFileSync('python3', [
        PARSER, '--frontend-file',
        path.join(REPO_ROOT, 'frontend/src/services/api/schemas/entities', file),
        '--schema', schema,
    ], { encoding: 'utf8' });
    return JSON.parse(out).fields;
}

describe('capability_catalog parser still extracts each entity field set', () => {
    it.each([
        ['risks.ts', 'riskCapabilitiesSchema'],
        ['controls.ts', 'controlCapabilitiesSchema'],
        ['kris.ts', 'kriCapabilitiesSchema'],
        ['vendors.ts', 'vendorCapabilitiesSchema'],
    ])('parser returns can_read + can_update for %s', (file, schema) => {
        const fields = parseSchema(file, schema);
        expect(fields).toContain('can_read');
        expect(fields).toContain('can_update');
    });
});
```

**Test file 3**: `tests/frontend/unit/src/services/api/schemas/__tests__/issuesCapabilities.distinct.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ISSUES = path.resolve(
    __dirname,
    '../../../../../../../frontend/src/services/api/schemas/entities/issues.ts',
);

describe('issueCapabilitiesSchema is structurally distinct (#65)', () => {
    it('does not import crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/from '@\/services\/api\/schemas\/crudCapabilitySchema'/);
    });

    it('does not call .merge() against crudCapabilitySchema', () => {
        const src = fs.readFileSync(ISSUES, 'utf8');
        expect(src).not.toMatch(/crudCapabilitySchema\.merge/);
    });
});
```

**Expected result**: RED on file 1 (`crudCapabilitySchema` does not exist) and
file 2 (parser cannot find module). File 3 passes today (issues already
distinct) but will continue to pin the contract.

#### TDD Step 2 — Implement Change

**New file** `frontend/src/services/api/schemas/crudCapabilitySchema.ts`:

```ts
import { passthroughObject, z } from './common';

export const CRUD_BASE_FIELDS = ['can_read', 'can_update'] as const;
export type CrudBaseField = typeof CRUD_BASE_FIELDS[number];

/**
 * Shared CRUD base — common subset across risks/controls/kris/vendors.
 *
 * NOTE: Per-entity schemas MUST NOT use `.merge()` / `.extend()` against
 * this schema, because the capability catalog Zod parser at
 * `scripts/security/authz_contract_validator/capability_catalog.py:112-126`
 * uses brace-matched literal extraction and does not walk continuations.
 * Treat this as a type-level + test-level contract only.
 */
export const crudCapabilitySchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
});
```

**No edits** to `risks.ts` / `controls.ts` / `kris.ts` / `vendors.ts` schema
bodies (per the literal-flat constraint). The four entity schemas keep their
flat shape; the test suite enforces the contract.

`issues.ts` UNCHANGED (structurally distinct; pin verified by Test 3).

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- crudCapabilitySchema
cd frontend && npm run -w tests/frontend/unit test -- issuesCapabilities
python scripts/security/validate_authz_capability_contract.py  # exit 0
```

#### Lock/TOML/Contract updates (same commit)

- `docs/security/capability-catalog.json` — re-snapshot per-entity field
  counts after #37/#39 land (see Section 3 / Wave 6b for #39); this commit
  uses the current per-entity field counts and locks them in the test.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` —
  verify all per-entity capability keys present (no edits expected).

#### README / doc updates (same commit)

- `frontend/src/services/api/schemas/README.md` — explain the parser-compat
  constraint and why `.merge()` is forbidden in capability schemas. Quote the
  parser line range `:112-126`.

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit test -- crudCapabilitySchema.contract` — pass.
2. `cd frontend && npm run -w tests/frontend/unit test -- crudCapabilitySchema.parser` — pass.
3. `cd frontend && npm run -w tests/frontend/unit test -- issuesCapabilities.distinct` — pass.
4. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.
6. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`feat(frontend/schemas): add crudCapabilitySchema base + literal-flat parity tests`.

#### Rollback

- Class: **PURE-CODE** (test-only; new module is referenced only by tests).
- Procedure: revert removes new module + 3 tests. Per-entity schemas were
  never edited; rollback risk-free.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~6h (new module + 3 tests + parser invocation + verification).
- Risk: low — type-level contract; per-entity schemas unchanged.
- Mitigations: parser-compat test invokes the actual parser; structural test
  forbids `.merge` / `.extend`; positive presence test ensures CRUD base
  fields stay literal.

---

### Item #6 (Section 5) — #67 — Extract generic `useResourcePanelQuery`

**Wave**: 6a  | **Slot**: v2 Seq 66  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: #46 (Seq 64; consumes typed `queryKey` factory)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/riskhub/useRiskHubConfigResource.ts:79-179` mixes
domain-agnostic query orchestration with riskhub-specific panel state. The
generic `useResourcePanelQuery<TItem, TCreate, TUpdate>` extracts the CRUD
orchestration (load / create / update / delete / restore) into a typed hook
parameterised by an `adapter` carrying a typed `queryKey` from `#46`'s
factory. The original hook becomes a thin wrapper that combines the new
generic hook + `useRiskHubConfigPanelState`. Audit ID = #67; developer
verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 66 (`plan-loop-3-07-integration-v2.md:409`).
- [ ] Confirm prerequisites complete: #46 Commit E green.
- [ ] Read latest state of:
  - `frontend/src/components/riskhub/useRiskHubConfigResource.ts:1-179`
  - `frontend/src/components/riskhub/useRiskHubConfigPanelState.ts` (panel state, kept).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (behavioral contract)**:
`tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useResourcePanelQuery } from '@/hooks/useResourcePanelQuery';

interface FakeItem { id: number; name: string }

const def = {
    queryKey: ['fake', 'list'] as const,
    list: vi.fn(async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]),
    create: vi.fn(async (p: { name: string }) => ({ id: 3, name: p.name })),
    update: vi.fn(async (id: number, p: { name: string }) => ({ id, name: p.name })),
    remove: vi.fn(async () => undefined),
    restore: vi.fn(async (id: number) => ({ id, name: 'restored' })),
};

beforeEach(() => Object.values(def).forEach((m) => typeof m === 'function' && (m as any).mockClear?.()));

describe('useResourcePanelQuery contract', () => {
    it('initial → loading → items', async () => {
        const { result } = renderHook(() => useResourcePanelQuery<FakeItem, { name: string }, { name: string }>(def));
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toHaveLength(2);
    });

    it('handleSave create then update', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleSave({ id: undefined, payload: { name: 'C' } }); });
        expect(def.create).toHaveBeenCalledOnce();
        await act(async () => { await result.current.handleSave({ id: 1, payload: { name: 'A2' } }); });
        expect(def.update).toHaveBeenCalledOnce();
    });

    it('handleDelete invokes remove', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleDelete(1); });
        expect(def.remove).toHaveBeenCalledWith(1);
    });

    it('handleRestore invokes restore', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => { await result.current.handleRestore(1); });
        expect(def.restore).toHaveBeenCalledWith(1);
    });
});
```

**Test file 2 (structural)**:
`tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.structural.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TARGET = path.resolve(
    __dirname, '../../../../../../frontend/src/components/riskhub/useRiskHubConfigResource.ts',
);

describe('useRiskHubConfigResource refactored to thin wrapper (#67)', () => {
    it('file is <= 60 lines', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src.split('\n').length).toBeLessThanOrEqual(60);
    });

    it('imports useResourcePanelQuery and useRiskHubConfigPanelState', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src).toMatch(/from '@\/hooks\/useResourcePanelQuery'/);
        expect(src).toMatch(/from '\.\/useRiskHubConfigPanelState'/);
    });
});
```

**Expected result**: RED. Module does not exist; original file is 179 lines.

#### TDD Step 2 — Implement Change

**New file** `frontend/src/hooks/useResourcePanelQuery.ts`:

```ts
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ResourcePanelQueryDefinition<TItem extends { id: number }, TCreate, TUpdate> {
    queryKey: readonly unknown[];
    list: (signal?: AbortSignal) => Promise<TItem[]>;
    create: (payload: TCreate) => Promise<TItem>;
    update: (id: number, payload: TUpdate) => Promise<TItem>;
    remove: (id: number) => Promise<void>;
    restore: (id: number) => Promise<TItem>;
}

export function useResourcePanelQuery<TItem extends { id: number }, TCreate, TUpdate>(
    definition: ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>,
) {
    const qc = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: definition.queryKey,
        queryFn: ({ signal }) => definition.list(signal),
    });
    const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: definition.queryKey }), [qc, definition.queryKey]);

    const handleSave = useCallback(async (input: { id?: number; payload: TCreate | TUpdate }) => {
        if (input.id === undefined) await definition.create(input.payload as TCreate);
        else await definition.update(input.id, input.payload as TUpdate);
        await invalidate();
    }, [definition, invalidate]);

    const handleDelete = useCallback(async (id: number) => { await definition.remove(id); await invalidate(); }, [definition, invalidate]);
    const handleRestore = useCallback(async (id: number) => { await definition.restore(id); await invalidate(); }, [definition, invalidate]);

    return { items: data ?? [], isLoading, error, handleSave, handleDelete, handleRestore };
}
```

**Edit** `frontend/src/components/riskhub/useRiskHubConfigResource.ts`:
collapse to a thin wrapper (≤60 lines) that constructs the
`ResourcePanelQueryDefinition` from the riskhub-specific service module and
combines `useResourcePanelQuery(...)` with `useRiskHubConfigPanelState(...)`.
Pull `queryKey` from `riskHubKeys.<resource>(...)` (per #46).

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- useResourcePanelQuery
cd frontend && npm run -w tests/frontend/unit test -- riskhub
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/src/hooks/README.md` — add `useResourcePanelQuery` entry; cite the
  `ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>` adapter shape.

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit test -- useResourcePanelQuery.contract` — pass.
2. `cd frontend && npm run -w tests/frontend/unit test -- useResourcePanelQuery.structural` — pass.
3. `cd frontend && npm run -w tests/frontend/unit test -- riskhub` — riskhub regression green.
4. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.

#### Commit boundary

Single commit titled
`refactor(frontend/hooks): extract generic useResourcePanelQuery from useRiskHubConfigResource`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 179-line hook; behavior identical (the new
  hook is purely structural).
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~6h (new generic + wrapper rewrite + 2 tests + verification).
- Risk: medium — react-query cache invalidation must invalidate the same key
  the inline literal previously used; the test pins this end-to-end.
- Mitigations: behavioral contract test exercises load/create/update/delete/
  restore; structural test pins file size & imports.

---

### Item #7 (Section 5) — #62 — Relocate `kri_vendor_assignment.py` + per-row audit events

**Wave**: 6a  | **Slot**: v2 Seq 67  | **Effort**: M (~half-day to one day)  | **Priority**: P3  | **Domain**: kris

**Dependencies**: none (structurally independent of #69 per Phase 4)  
**Atomic with**: none  
**Validator?**: no — but lock-line travels with file move

#### Why this work

`backend/app/services/kri_vendor_assignment.py:81-119` mutates
`VendorRiskLink` and `VendorKRILink` directly with **0 audit events** today.
Canonical `_vendor_links/workflow.py:285,322` emits `vendor_link_created` /
`vendor_link_deleted` per row. This recipe relocates the module under
`_vendor_links/` and rewrites `assign_vendors_to_kri` to call the canonical
per-row mutators, restoring audit completeness. Audit ID = #62; developer
verdict = ACCEPT.

> **Phase 4/Phase 6 Audit-cardinality decision: PER-ROW EVENTS.** Bulk KRI/
> vendor reconciliation must emit one `vendor_link_created` /
> `vendor_link_deleted` event PER ROW, matching canonical pattern. Rationale:
> audit completeness, idempotent replay, customer-visible diff is purely
> additive (0 → N events), lock alignment with
> `test_w4_bc_c_vendor_governance_boundaries_red.py:16`.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (per `plan-loop-3-07-integration-v2.md:412` legacy slot 69; renumber within Wave 6a).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/services/kri_vendor_assignment.py:81-119`
  - `backend/app/services/_vendor_links/workflow.py:265-333`
  - `backend/app/services/_vendor_links/workflow.py:285,322` (canonical emit sites)
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` (lock line)
  - 4 importers:
    - `backend/app/api/v1/endpoints/kris/crud/create.py:16-18`
    - `backend/app/services/_approval_execution/kri_generic_edit.py:16`
    - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23`
    - `backend/app/services/_entity_mutation_lifecycle/policy.py:22`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (audit-cardinality behavioral)**:
`tests/backend/pytest/test_kri_vendor_assignment_audit_red.py`

```python
"""KRI vendor assignment emits per-row audit events (#62)."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_kri_vendor_assignment_emits_per_row_audit_events(
    client_factory, db_session, kri_with_vendors, current_user,
) -> None:
    kri = kri_with_vendors.kri
    v1, v2, v3, v4 = kri_with_vendors.vendor_ids
    async with client_factory(current_user=current_user) as ac:
        await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v3]})
        await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v4]})

    from tests.helpers.audit import load_kri_audit_events
    events = await load_kri_audit_events(db_session, kri.id)
    created_kri = [e for e in events if e.action == "vendor_link_created" and e.link_kind == "kri"]
    deleted_kri = [e for e in events if e.action == "vendor_link_deleted" and e.link_kind == "kri"]
    assert len(created_kri) == 4  # 3 initial + 1 add (v4)
    assert len(deleted_kri) == 1   # 1 removal (v3)
```

**Test file 2 (structural relocation)**: extend
`tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py`
to add an explicit absence assertion:

```python
def test_kri_vendor_assignment_old_path_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/kri_vendor_assignment.py").exists()
```

**Test file 3 (no direct table mutation)**: same architecture file or new
`tests/backend/pytest/architecture/test_kri_assignment_no_direct_mutation_red.py`:

```python
def test_kri_assignment_uses_canonical_link_mutators() -> None:
    path = REPO_ROOT / "backend/app/services/_vendor_links/kri_assignment.py"
    text = path.read_text(encoding="utf-8")
    for forbidden in ("db.add(VendorRiskLink(", "db.add(VendorKRILink(", "await db.delete(link)"):
        assert forbidden not in text, f"direct table mutation {forbidden} in {path}"
```

**Expected result**: RED on all three (file at old path; 0 audit events; 3
direct mutations at old path lines `:102,112,117`).

#### TDD Step 2 — Implement Change

1. **Move** `backend/app/services/kri_vendor_assignment.py` →
   `backend/app/services/_vendor_links/kri_assignment.py` (use `git mv`).
2. **Rewrite** `assign_vendors_to_kri` body. Replace parent-risk reconciliation
   block (old `:91-102`) with per-row
   `await link_vendor_target(db, vendor_id=..., current_user=..., kind="risk", entity_id=kri.risk_id, log_activity_func=log_activity)`
   calls (only for vendors not already linked to the parent risk).
3. **Replace** KRI link reconciliation block (old `:104-117`) with per-row
   `await unlink_vendor_target(...)` for removals + per-row
   `await link_vendor_target(..., kind="kri", entity_id=kri.id, ...)` for
   additions.
4. **Preserve** return type `list[int]`; keep `normalize_vendor_ids`,
   `validate_assignable_vendors`, `ensure_vendors_exist`,
   `get_kri_vendor_ids` signatures unchanged (non-mutating callers depend on them).
5. **Update 4 importers** to the new path:
   - `backend/app/api/v1/endpoints/kris/crud/create.py:16-18` —
     `from app.services.kri_vendor_assignment import (...)` →
     `from app.services._vendor_links.kri_assignment import (...)`.
   - `backend/app/services/_approval_execution/kri_generic_edit.py:16` — same.
   - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` — same.
   - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — same.
6. **Update lock line** at
   `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
   from `"backend/app/services/kri_vendor_assignment.py"` to
   `"backend/app/services/_vendor_links/kri_assignment.py"`.

> **ADR-002 caveat**: `link_vendor_target` / `unlink_vendor_target` each call
> `await db.commit()` on success (`_vendor_links/workflow.py:293,329`). The
> rewritten `assign_vendors_to_kri` MUST NOT add a redundant outer
> `db.commit()` — per-row mutators own their boundaries. Verify all 4 importers
> tolerate per-row commits (do not wrap the call in an outer transaction); if
> any does, refactor that caller in the same commit.

#### TDD Step 3 — Confirm GREEN

```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_vendor_assignment_audit_red.py
pytest tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py
pytest tests/backend/pytest/test_kris_rbac.py
pytest tests/backend/pytest/test_approval_workflow.py
```

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  — change the `VENDOR_SERVICE_FILES` entry path.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md` — search for
  `kri_vendor_assignment.py`; update path to new location if present
  (Loop A noted near `:172`).
- `docs/security/authorization-capability-contract.json` — same.
- `backend/app/services/_vendor_links/README.md` — add `kri_assignment.py`
  inventory row.
- `backend/app/services/README.md` — remove old `kri_vendor_assignment.py`
  row if listed.

#### Verification commands

```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_vendor_assignment_audit_red.py \
       tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py \
       tests/backend/pytest/test_kris_rbac.py \
       tests/backend/pytest/test_approval_workflow.py
rg "VendorRiskLink|VendorKRILink" backend/app/services/_vendor_links/kri_assignment.py
rg "kri_vendor_assignment" backend/ tests/ docs/
```

Last `rg` returns no hits at the old path.

#### Commit boundary

**Single commit**. Relocation + rewrite + 4 importer rewrites + lock-line
update + doc updates + new audit-cardinality test together. Splitting risks
half-routed audit emissions in production.

#### Rollback

- Class: **PURE-CODE** (no schema change).
- Procedure: revert the single commit; old file restored at old path; old
  lock-line restored. The new behavioral test fires red on rollback as a
  safety net (intentional — documents the per-row decision).
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~half-day to one day M.
- Risk: medium — bulk reconciliation now emits N events instead of 0; some
  notification trigger filters may need adjustment if they aggregate per-bulk-
  call. Mitigation: per-row matches canonical pattern already in production
  for non-bulk paths.

---

### Item #8 (Section 5) — #77a — Pre-migration Vendor.status FE Zod soft-tolerate test

**Wave**: 6a  | **Slot**: v2 Seq 69  | **Effort**: S (~30 min - 1h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: paired temporally with #77b (Wave 8) and #69+#70 (Wave 8 atomic)  
**Validator?**: no

#### Why this work

#69+#70 (Wave 8 atomic) drops `Vendor.status` from the API. Between BE deploy
and FE bundle ship the response payload temporarily lacks the `status` field;
`vendorSchema` at `frontend/src/services/api/schemas/entities/vendors.ts:62`
declares `status: z.enum(['active'])` (required), so the parser would fail.
This pre-migration test relaxes `status` to `.optional()` so deploy-skew is
tolerated. The post-migration cleanup (#77b in Wave 8) removes `status`
entirely. Audit ID = #77a; developer verdict = ACCEPT.

> **Phase 6 critical**: use the literal `'active'` (NOT
> `VENDOR_STATUS_VALUES[0]`). The literal is what the parser walks; any
> indirection breaks the catalog parser.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 69 (per Section 2 final sequence).
- [ ] Confirm prerequisites complete: none. (Must precede #69+#70 Wave 8 atomic.)
- [ ] Read current state of:
  - `frontend/src/services/api/schemas/entities/vendors.ts` (especially
    `vendorSchema` `status: z.enum(['active'])` line).
  - `frontend/src/types/vendor.ts:1,64,94` (status type declarations).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { vendorSchema } from '@/services/api/schemas/entities/vendors';

const baseVendor = {
    id: 1,
    name: 'Acme',
    process: 'P1',
    outsourcing_owner_user_id: 1,
    linked_risks: [],
    vendor_type: 'ict' as const,
    risk_score_1_5: 3,
    supports_important_core_insurance_function: false,
    dora_relevant: false,
    is_significant_vendor: false,
    has_alternative_providers: true,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

describe('vendorSchema soft-tolerates missing status (pre-migration #69+#70)', () => {
    it('accepts payload WITH status: active (literal)', () => {
        const result = vendorSchema.safeParse({ ...baseVendor, status: 'active' });
        expect(result.success).toBe(true);
    });

    it('accepts payload WITHOUT status field', () => {
        const result = vendorSchema.safeParse(baseVendor);
        expect(result.success).toBe(true); // tolerates deploy-skew
    });
});
```

**Companion sanity test**:
`tests/frontend/unit/src/services/api/schemas/__tests__/vendors.statusOptional.lookup.test.ts`
(asserts `linkedVendorSummarySchema:9` already declares
`status: z.string().nullable().optional()` — confirmed soft-tolerant).

**Expected result**: RED on `accepts payload WITHOUT status field` (today
`vendorSchema.status` is required).

#### TDD Step 2 — Implement Change

**Edit** `frontend/src/services/api/schemas/entities/vendors.ts` at the line
declaring `status: z.enum(['active'])` (currently `:62` — verify; may shift
to `:63` after Wave 6a edits land):

```diff
- status: z.enum(['active']),
+ // Pre-migration soft-tolerate (item #77a) — restored to z.enum(['active']) after #69+#70 in #77b.
+ status: z.enum(['active']).optional(),
```

**Edit** `frontend/src/types/vendor.ts:64` (the `Vendor.status` field):

```diff
- status: VendorStatus;
+ status?: VendorStatus;  // optional during pre-migration #77a; field removed entirely in #77b
```

> Use the literal `'active'` in the Zod schema. Do NOT introduce
> `VENDOR_STATUS_VALUES[0]` indirection.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- vendors.statusOptional
cd frontend && npm run -w tests/frontend/unit test -- schemas       # broad regression
cd frontend && npm run -w tests/frontend/unit typecheck
```

#### Lock/TOML/Contract updates (same commit)

- None at this stage. `_endpoint_commit_allowlist.toml` Vendor surfaces remain
  green; #69+#70 will rewrite them.

#### README / doc updates (same commit)

- `docs/migrations/vendor-status-removal.md` (new or extend) — note that #77a
  is the FE pre-test landing in this commit; #77b is the post-migration
  cleanup in Wave 8. Cross-reference Alembic revision `k6l7m8n9o0p1`.

#### Verification commands

1. `cd frontend && npm run -w tests/frontend/unit test -- vendors.statusOptional` — pass.
2. `cd frontend && npm run -w tests/frontend/unit test -- schemas` — broad regression pass.
3. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
4. `cd frontend && npm run -w tests/frontend/unit lint` — clean.

#### Commit boundary

Single commit titled
`test(frontend/vendors): soft-tolerate missing Vendor.status pre-migration #69+#70`.

#### Rollback

- Class: **CROSS-COMMIT** (sequenced with #69+#70).
- Procedure: revert restores `status: z.enum(['active'])` (required). If
  rollback happens AFTER the BE migration has landed, the FE will reject
  vendor payloads. Coordinate so rollback order is FE-rollback → BE-rollback.
- Estimated revert time: 5 min (FE only).

#### Effort & Risk

- Estimated time: ~30 min - 1h S (Phase 4 promoted to Wave 6a).
- Risk: low — purely tolerant relaxation; no consumer breaks (existing
  `status: 'active'` payloads still parse).
- Mitigations: 2 explicit tests pin both with-status and without-status paths;
  type relaxation is reverted to absent in #77b.

---

### Item #9 (Section 5) — #45a — Ownership prerequisite characterization tests

**Wave**: 6a  | **Slot**: v2 Seq 67 (per Section 2 sequence; v2 line 414 legacy 71)  | **Effort**: M (~half-day)  | **Priority**: P4  | **Domain**: crosscut

**Dependencies**: none — gate node for #45b (Wave 7)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

#45b (ownership resolver factory; Wave 7 Seq 74) replaces 8 free functions in
`backend/app/core/_permissions/ownership.py:1-142` with a factory call. Before
that refactor lands, three characterization tests must pin the EXISTING
ownership behavior so the factory rewrite is provably equivalent. Phase 4
verified the KRI archived-filter asymmetry: `ownership.py:33` and `:68`
filter `is_archived.is_(False)` (risk-scope paths); `:1-13` and `:40-51`
do NOT (KRI-direct paths). Audit ID = #45a; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (Phase 6 placement; legacy 71).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/core/_permissions/ownership.py:1-142`,
  especially:
  - `:1-13` `is_kri_reporting_owner` (KRI-direct, no archive filter)
  - `:33` `is_risk_kri_reporting_owner` (risk-scope, archive-filtered)
  - `:40-51` `get_kri_ids_where_reporting_owner` (KRI-direct, no archive filter)
  - `:68` `get_risk_ids_where_kri_reporting_owner` (risk-scope, archive-filtered)
  - `:90-108` `is_risk_control_owner` (control join semantics)
- [ ] Confirm fixture factories exist or will be added:
  `archived_kri_with_reporting_owner`, `control_owned_by_user_linked_to_risk`,
  `control_linked_to_risk_owned_by_other`, `control_owned_by_user_unlinked`,
  `fixture_universe`.

#### TDD Step 1 — Write 3 SEPARATE Test Files (characterization; pass on current code)

**Decision**: write 3 SEPARATE test files. Each characterizes a distinct
invariant; separate files keep failure attribution tight and let #45b's
factory-equivalence test reuse fixtures.

**File 1**: `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`

```python
"""KRI archived asymmetry — KRI-direct does NOT filter; risk-scope DOES."""
from __future__ import annotations

import pytest

from app.core.permissions import (
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_kri_reporting_owner,
    is_kri_reporting_owner,
    is_risk_kri_reporting_owner,
)

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_is_kri_reporting_owner_returns_true_for_archived_kri(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`is_kri_reporting_owner` (ownership.py:1-13) does NOT filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    kri_id = archived_kri_with_reporting_owner.id
    assert await is_kri_reporting_owner(db_session, user_id, kri_id) is True


@pytest.mark.asyncio
async def test_get_kri_ids_where_reporting_owner_includes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`get_kri_ids_where_reporting_owner` (ownership.py:40-51) does NOT filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    ids = await get_kri_ids_where_reporting_owner(db_session, user_id)
    assert archived_kri_with_reporting_owner.id in ids


@pytest.mark.asyncio
async def test_is_risk_kri_reporting_owner_excludes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`is_risk_kri_reporting_owner` (ownership.py:33) DOES filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    risk_id = archived_kri_with_reporting_owner.risk_id
    assert await is_risk_kri_reporting_owner(db_session, user_id, risk_id) is False


@pytest.mark.asyncio
async def test_get_risk_ids_where_kri_reporting_owner_excludes_archived(
    db_session, archived_kri_with_reporting_owner,
) -> None:
    """`get_risk_ids_where_kri_reporting_owner` (ownership.py:68) DOES filter is_archived."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    risk_ids = await get_risk_ids_where_kri_reporting_owner(db_session, user_id)
    assert archived_kri_with_reporting_owner.risk_id not in risk_ids
```

**File 2**: `tests/backend/pytest/test_ownership_resolver_control_join.py`

```python
"""Control join semantics — requires both ControlRiskLink AND owner match."""
from __future__ import annotations

import pytest

from app.core.permissions import is_risk_control_owner

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_is_risk_control_owner_requires_link_and_owner_match(
    db_session, control_owned_by_user_linked_to_risk, user,
) -> None:
    """ownership.py:90-108 requires BOTH ControlRiskLink row AND control_owner_id == user_id."""
    risk_id = control_owned_by_user_linked_to_risk.risk_id
    assert await is_risk_control_owner(db_session, user.id, risk_id) is True


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_link_present_but_owner_differs(
    db_session, control_linked_to_risk_owned_by_other, user,
) -> None:
    risk_id = control_linked_to_risk_owned_by_other.risk_id
    assert await is_risk_control_owner(db_session, user.id, risk_id) is False


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_owner_match_but_link_absent(
    db_session, control_owned_by_user_unlinked, other_risk, user,
) -> None:
    """Owner matches, no link → False (the inner-join at ownership.py:104)."""
    assert await is_risk_control_owner(db_session, user.id, other_risk.id) is False
```

**File 3**: `tests/backend/pytest/test_visible_ids_via_ownership.py`

```python
"""visible_*_ids unions department-scope and ownership-scope across 9 roles."""
from __future__ import annotations

import pytest

from app.core.permissions import (
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
    visible_vendor_ids,
)
from tests.factories.users import build_user_for_role

pytestmark = pytest.mark.contract


ROLES = (
    "admin",
    "cro",
    "risk_manager",
    "department_risk_owner",
    "kri_reporting_owner",
    "control_owner",
    "auditor",
    "reviewer",
    "viewer",
)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_visible_ids_under_role_unions_department_and_ownership(
    db_session, role, fixture_universe,
) -> None:
    user = await build_user_for_role(db_session, role=role)
    candidates = fixture_universe.kri_ids + fixture_universe.foreign_dept_kri_ids
    ids = await visible_kri_ids(db_session, user, candidates)
    assert ids == fixture_universe.expected_visible_kri_ids_for(role)
    risk_ids = await visible_risk_ids(db_session, user, fixture_universe.risk_ids)
    assert risk_ids == fixture_universe.expected_visible_risk_ids_for(role)
    control_ids = await visible_control_ids(db_session, user, fixture_universe.control_ids)
    assert control_ids == fixture_universe.expected_visible_control_ids_for(role)
    vendor_ids = await visible_vendor_ids(db_session, user, fixture_universe.vendor_ids)
    assert vendor_ids == fixture_universe.expected_visible_vendor_ids_for(role)
```

**Expected result**: GREEN on current code (these are characterization tests
pinning existing behavior). Red would mean fixtures are missing or current
ownership behavior diverges from documented invariants.

#### TDD Step 2 — No production code change

#45a is **test-only**. Production code at `ownership.py` is untouched.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py \
       tests/backend/pytest/test_ownership_resolver_control_join.py \
       tests/backend/pytest/test_visible_ids_via_ownership.py
make -f scripts/Makefile test-architecture-locks
```

After all three pass, they form the gate for #45b.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands

1. `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py -v` — pass.
2. `pytest tests/backend/pytest/test_ownership_resolver_control_join.py -v` — pass.
3. `pytest tests/backend/pytest/test_visible_ids_via_ownership.py -v` — pass (9 parametrized cases).
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`test(permissions): characterize ownership resolver behavior (#45a gate for #45b)`.

#### Rollback

- Class: **TEST-ONLY**.
- Procedure: revert removes characterization coverage; no production behavior
  affected.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~half-day M (the visible-ids fixture matrix is the long pole).
- Risk: low — test-only addition.
- Mitigations: 3 separate files keep failure attribution tight; matrix
  parametrization covers 9 roles × 4 entity types.

#### Handoff notes

- **Gates #45b** (Wave 7 Seq 74). #45b's factory-equivalence test must
  reference these three files verbatim.
- After #45a lands, integration log records: "ownership characterization
  baseline locked; #45b factory-equivalence reuses these fixtures."

---

## Wave 6b — P3 Capability + Admin (Slots 70-73, 40h, Week 12)

Wave 6b completes capability and admin work; #66 unblocks #68, #71 (Wave 7).
**Validator runs**: 1 (#39 admin builder).

---

### Item #10 (Section 5) — #39 — Replace static admin capability stub with role-aware builder

**Wave**: 6b  | **Slot**: v2 Seq 67 (legacy)  | **Effort**: M (~6-8h)  | **Priority**: P3  | **Domain**: crosscut (FE+BE)

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: yes — Pydantic-Zod parity contract; runs `validate_authz_capability_contract.py`

#### Why this work

`backend/app/api/v1/endpoints/admin/capabilities.py:14-22` returns a 4-`True`
literal stub:

```python
@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
) -> AdminConsoleCapabilities:
    _ = current_user                                  # ← unused-arg eat
    return AdminConsoleCapabilities(
        can_revoke_sessions=True,
        can_run_directory_check_all=True,
        can_update_log_config=True,
        can_export_loaded_audit_logs=True,
    )
```

This recipe replaces the stub with a role-aware builder
`build_admin_capabilities(user)` that introspects role and returns the four
booleans accordingly. Pydantic-Zod parity is locked end-to-end via the
catalog parser. Audit ID = #39; developer verdict = ACCEPT.

> **Phase 6 critical**: the file currently contains the literal stub with
> `_ = current_user` placeholder line; the builder must consume `current_user`
> meaningfully and remove the placeholder.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 67 (legacy; per
  `plan-loop-3-07-integration-v2.md:410`) — Section 2 places at Wave 6b row 70.
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/admin/capabilities.py:1-22` (current 4-True stub).
  - `backend/app/api/v1/endpoints/admin/_deps.py` (`require_platform_admin`).
  - `backend/app/schemas/admin.py:99-105` (Pydantic `AdminConsoleCapabilities`, 4 fields).
  - `frontend/src/services/api/schemas/admin.ts:38-43` (Zod schema, 4 fields).
  - `app/models/role.py` `RoleType` enum.
- [ ] Confirm `docs/security/capability-catalog.json` AdminConsoleCapabilities
  surface entry lists exactly the 4 fields. Add if missing.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (per-role behavioral)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_builder.py`

```python
"""Admin capabilities builder — per-role booleans."""
from __future__ import annotations

import pytest

from app.services._authorization_capabilities.admin import build_admin_capabilities

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role_fixture,expected_admin",
    [
        ("test_user_admin", True),
        ("test_user_dept_head", False),
        ("test_user_end_user", False),
        ("test_user_cro", False),
        ("test_user_risk_manager", False),
        ("test_user_compliance", False),
    ],
)
async def test_build_admin_capabilities_role_matrix(request, role_fixture, expected_admin) -> None:
    user = request.getfixturevalue(role_fixture)
    caps = build_admin_capabilities(user)
    assert caps.can_revoke_sessions is expected_admin
    assert caps.can_run_directory_check_all is expected_admin
    assert caps.can_update_log_config is expected_admin
    assert caps.can_export_loaded_audit_logs is expected_admin


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_admin_returns_true(
    client_factory, test_user_admin,
) -> None:
    async with client_factory(current_user=test_user_admin) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["can_revoke_sessions"] is True


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_non_admin_blocked(
    client_factory, test_user_end_user,
) -> None:
    async with client_factory(current_user=test_user_end_user) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")
    # require_platform_admin returns 401/403 before builder is reached.
    assert resp.status_code in (401, 403)
```

**Test file 2 (structural)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_structural.py`

```python
"""capabilities.py uses build_admin_capabilities — no literal True stub."""
from __future__ import annotations

import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]
TARGET = REPO_ROOT / "backend/app/api/v1/endpoints/admin/capabilities.py"


def test_capabilities_endpoint_uses_builder() -> None:
    src = TARGET.read_text()
    assert "build_admin_capabilities" in src
    assert "_ = current_user" not in src
    body = src.split("def get_admin_console_capabilities", 1)[1]
    assert "True" not in body, "literal True must not appear in endpoint body"
```

**Test file 3 (Pydantic-Zod parity)**:
`tests/backend/pytest/api/v1/admin/test_capabilities_parity.py`

```python
"""AdminConsoleCapabilities — Pydantic field set ≡ Zod field set."""
from __future__ import annotations

import json
import pathlib
import re

import pytest
from app.schemas.admin import AdminConsoleCapabilities

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]
ZOD_FILE = REPO_ROOT / "frontend/src/services/api/schemas/admin.ts"


def _zod_field_names(src: str, schema_name: str) -> set[str]:
    # Brace-matched literal extraction equivalent to capability_catalog.py:112-126.
    m = re.search(rf"export\s+const\s+{schema_name}\s*=\s*passthroughObject\(\{{(.+?)\}}\)", src, re.DOTALL)
    assert m, f"could not locate {schema_name}"
    body = m.group(1)
    return set(re.findall(r"\b([a-z_][a-z_0-9]*)\s*:\s*z\.boolean\(\)", body))


def test_admin_capabilities_pydantic_zod_parity() -> None:
    pyd = set(AdminConsoleCapabilities.model_fields.keys())
    zod = _zod_field_names(ZOD_FILE.read_text(), "adminConsoleCapabilitiesSchema")
    assert pyd == zod, f"drift: pyd={pyd}, zod={zod}"
```

**Expected result**: RED on all three (file 1: builder doesn't exist; file 2:
`_ = current_user` and `True` in body; file 3: parser cannot extract zod fields
once builder ships if shape drifts).

#### TDD Step 2 — Implement Change

**New file** `backend/app/services/_authorization_capabilities/admin.py`:

```python
from __future__ import annotations

from app.models import User
from app.models.role import RoleType
from app.schemas.admin import AdminConsoleCapabilities


def _is_platform_admin(user: User) -> bool:
    role = getattr(user, "role", None)
    return getattr(role, "name", None) == RoleType.ADMIN.value


def build_admin_capabilities(user: User) -> AdminConsoleCapabilities:
    is_admin = _is_platform_admin(user)
    return AdminConsoleCapabilities(
        can_revoke_sessions=is_admin,
        can_run_directory_check_all=is_admin,
        can_update_log_config=is_admin,
        can_export_loaded_audit_logs=is_admin,
    )
```

**Edit** `backend/app/api/v1/endpoints/admin/capabilities.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin._deps import require_platform_admin
from app.models import User
from app.schemas.admin import AdminConsoleCapabilities
from app.services._authorization_capabilities.admin import build_admin_capabilities

router = APIRouter()


@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
) -> AdminConsoleCapabilities:
    return build_admin_capabilities(current_user)
```

> The placeholder `_ = current_user` line is gone; `current_user` is now
> meaningfully consumed via the builder.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/admin/test_capabilities_builder.py
pytest tests/backend/pytest/api/v1/admin/test_capabilities_structural.py
pytest tests/backend/pytest/api/v1/admin/test_capabilities_parity.py
python scripts/security/validate_authz_capability_contract.py  # exit 0
```

#### Lock/TOML/Contract updates (same commit)

- `docs/security/capability-catalog.json` — confirm `AdminConsoleCapabilities`
  surface entry lists exactly the 4 fields; add if missing.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` —
  confirm all 4 keys present; add missing.

#### README / doc updates (same commit)

- `backend/app/services/_authorization_capabilities/README.md` — append
  `admin.py` section.
- `docs/security/authorization-capability-contract.md` — note admin console
  has a real builder.

#### Verification commands

1. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_builder.py -v` — pass.
2. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_structural.py -v` — pass.
3. `pytest tests/backend/pytest/api/v1/admin/test_capabilities_parity.py -v` — pass.
4. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `cd frontend && npm run -w tests/frontend/unit test -- schemas/admin` — parity green from FE side.
7. `mypy backend/app/services/_authorization_capabilities backend/app/api/v1/endpoints/admin` — clean.
8. `ruff check backend/app/services/_authorization_capabilities backend/app/api/v1/endpoints/admin` — clean.

#### Commit boundary

Single commit titled
`feat(backend/admin): replace static admin capability stub with role-aware builder`.

#### Rollback

- Class: **PURE-CODE** (Pydantic shape unchanged).
- Procedure: revert restores 4-`True` stub. Frontend Zod schema is unchanged
  either way; rollback is symmetric.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~6-8h M (builder + 3 tests + parity + verification).
- Risk: medium — admin endpoints assume non-admin paths return 401/403 from
  `require_platform_admin`; must confirm builder is reached only by admins.
- Mitigations: per-role parametrized test; structural test forbids literal
  `True`; parity test pins Pydantic ≡ Zod field sets.

---

### Item #11 (Section 5) — #40 — Re-cluster admin sub-routers (4-cluster split)

**Wave**: 6b  | **Slot**: v2 Seq 68 (legacy)  | **Effort**: M (~8-10h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: #39 (Wave 6b Seq 67 legacy)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/admin/console.py` carries 7 routes (Phase 4
verified count, NOT 8) at lines `:36,49,58,67,79,124,149`. The 7 routes split
naturally into 4 clusters:

- **system_status**: `/health`, `/jobs/status`, `/outbox/status`, `/stats` (`:36,49,58,67`).
- **operational_logs**: `/logs` (`:79`).
- **sessions**: `/sessions`, `/sessions/{user_id}/revoke` (`:124,149`).
- **siblings (no-op)**: `capabilities.py`, `directory_sync.py`, `docs.py`,
  `log_config.py`, `orphans.py`, `snapshots.py`, `structured_logs.py` already
  separate.

URL paths are **unchanged**; frontend has zero impact. Audit ID = #40;
developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 68 (legacy; per
  `plan-loop-3-07-integration-v2.md:411`).
- [ ] Confirm prerequisites complete: #39 merged.
- [ ] Read latest state of `backend/app/api/v1/endpoints/admin/console.py:36,49,58,67,79,124,149`.
- [ ] Read `backend/app/api/v1/endpoints/admin/__init__.py` (router include map).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""Admin sub-router 4-cluster split (#40)."""
from __future__ import annotations

import importlib
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
ADMIN = REPO_ROOT / "backend/app/api/v1/endpoints/admin"


def _route_paths(module_name: str) -> set[str]:
    mod = importlib.import_module(f"app.api.v1.endpoints.admin.{module_name}")
    return {r.path for r in mod.router.routes}


def test_console_emptied_after_split() -> None:
    src = (ADMIN / "console.py").read_text()
    assert "@router.get(\"/health\"" not in src
    assert "@router.get(\"/jobs/status\"" not in src
    assert "@router.get(\"/outbox/status\"" not in src
    assert "@router.get(\"/stats\"" not in src
    assert "@router.get(\"/logs\"" not in src
    assert "@router.get(\"/sessions\"" not in src


def test_system_status_cluster() -> None:
    paths = _route_paths("system_status")
    assert {"/health", "/jobs/status", "/outbox/status", "/stats"} <= paths


def test_operational_logs_cluster() -> None:
    paths = _route_paths("operational_logs")
    assert "/logs" in paths


def test_sessions_cluster() -> None:
    paths = _route_paths("sessions")
    # /sessions and /sessions/{user_id}/revoke
    assert "/sessions" in paths
    assert any(p.endswith("/revoke") for p in paths)


def test_admin_init_exports_clusters() -> None:
    src = (ADMIN / "__init__.py").read_text()
    for name in ("system_status", "operational_logs", "sessions"):
        assert name in src
```

**Expected result**: RED. New cluster files don't exist; console.py still has
the 7 routes.

#### TDD Step 2 — Implement Change

1. **Move handlers verbatim** (preserve URL paths and tag mappings):
   - From `console.py:36,49,58,67`: `health()`, `jobs_status()`,
     `outbox_status()`, `stats()` → new file `system_status.py`.
   - From `console.py:79`: `logs()` → new file `operational_logs.py`.
   - From `console.py:124,149`: `active_sessions()`, `revoke_user_sessions()`
     → new file `sessions.py`.

2. Each new file declares its own `router = APIRouter()` and re-exports;
   handlers retain their original signatures + dependencies + tags.

3. **Update** `backend/app/api/v1/endpoints/admin/__init__.py` — mount the 3
   new routers under their existing path prefixes (no URL change). Remove the
   `console.router.get(...)` mounts.

4. **Delete** the 7 handler bodies in `console.py`. The file may remain as a
   deprecated alias; if retained, list it in `_reserved_modules.toml` per
   ADR-009.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -q
```

#### Lock/TOML/Contract updates (same commit)

- None new (test enumerates clusters inline).
- If `console.py` retained as alias, add to `_reserved_modules.toml` per ADR-009.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/admin/README.md` (or
  `docs/agent/ENDPOINT_INVARIANTS.md`) — note the 4-cluster split.

#### Verification commands

1. `pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -q` — pass.
2. `pytest tests/backend/pytest/api/v1/admin -q` — admin endpoint regression pass; URL paths unchanged.
3. `pytest tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/test_openapi_contract_parity.py -q` — OpenAPI parity unchanged.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `mypy backend/app/api/v1/endpoints/admin` — clean.
6. `ruff check backend/app/api/v1/endpoints/admin` — clean.

#### Commit boundary

Single commit titled
`refactor(admin): split console.py into 4 sub-router clusters`.

#### Rollback

- Class: **PURE-CODE** (URL paths unchanged → frontend untouched → snapshot
  bases under ADR-006 not affected because response shapes do not change).
- Procedure: revert the commit; the old `console.py` returns. The new lock
  test fails on rollback (intended — forces forward-only re-clustering).
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 8-10h M.
- Risk: low — pure handler relocation; URL paths preserved.
- Mitigations: lock test enumerates each cluster inline; OpenAPI parity test
  catches any URL drift.

---

### Item #12 (Section 5) — #66 — Split `AuthContext.tsx` into independent providers (render-counter pin)

**Wave**: 6b  | **Slot**: v2 Seq 73 (legacy)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #37 (Wave 2; backend `_can_view_governance` mirror swap),
#39 (Wave 6b; admin builder).  
**Soft prereq**: #35 (Wave 4) per Correction E — avoids 18-mock-file double-rewrite.  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/contexts/AuthContext.tsx:1-77` (verified 77 lines today) bundles
session, preferences, and auth-actions state behind one Context.Provider. Any
mutation to one slice triggers re-renders in consumers of the other two. The
recipe splits into **3 providers** wrapping a thin `AuthContext` compat shim
that exposes the union via `useAuth()`. Audit ID = #66; developer verdict = ACCEPT.

> **Phase 4 mandate**: render-counter test pattern (`useRef(0)` +
> `useEffect(() => { count.current += 1 })` + `expect(after).toBe(before)`)
> verifies that mutating the preferences slice does NOT re-render session
> consumers.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 73 (legacy; Section 2 row 72;
  see `plan-loop-3-07-integration-v2.md:416`).
- [ ] Confirm prerequisites complete: #37 + #39 merged. (#35 soft prereq.)
- [ ] Read latest state of:
  - `frontend/src/contexts/AuthContext.tsx:1-77` (verify line count via
    `wc -l`; today = 77).
  - `frontend/src/contexts/auth/usePreferenceHydration.ts`
  - `frontend/src/contexts/auth/useAuthBootstrap.ts`
  - `frontend/src/contexts/auth/useAuthActions.ts`
  - `frontend/src/services/session` (provides `useSessionSnapshot`).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (render-counter pin — Phase 4 mandated)**:
`tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.renderCounter.test.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { render, act, screen } from '@testing-library/react';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { PreferencesProvider, usePreferenceActions } from '@/contexts/PreferencesContext';

function SessionConsumer() {
    const count = useRef(0);
    const session = useSession();
    useEffect(() => { count.current += 1; });
    return <span data-testid="session-renders">{count.current}|{session.user?.id ?? 'none'}</span>;
}

function PrefMutator() {
    const { markPreferencesReady } = usePreferenceActions();
    return <button onClick={() => markPreferencesReady(true)}>flip</button>;
}

it('mutating preferences does NOT re-render session consumer', () => {
    render(
        <SessionProvider>
            <PreferencesProvider>
                <SessionConsumer />
                <PrefMutator />
            </PreferencesProvider>
        </SessionProvider>
    );
    const before = screen.getByTestId('session-renders').textContent;
    act(() => screen.getByText('flip').click());
    const after = screen.getByTestId('session-renders').textContent;
    expect(after).toBe(before); // render count unchanged
});
```

**Test file 2 (auth actions independent)**:
`tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx`

```tsx
import { render, act } from '@testing-library/react';
import { AuthActionsProvider, useAuthActionsContext } from '@/contexts/AuthActionsContext';

function ActionsConsumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuthActionsContext>) => void }) {
    const ctx = useAuthActionsContext();
    onReady(ctx);
    return null;
}

it('exposes login/logout independently of session subtree', () => {
    let captured: ReturnType<typeof useAuthActionsContext> | null = null;
    render(
        <AuthActionsProvider>
            <ActionsConsumer onReady={(c) => { captured = c; }} />
        </AuthActionsProvider>
    );
    expect(captured).not.toBeNull();
    expect(typeof captured!.login).toBe('function');
    expect(typeof captured!.logout).toBe('function');
});
```

**Test file 3 (compat shim)**:
`tests/frontend/unit/src/contexts/__tests__/AuthContext.compatShim.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function Probe({ onReady }: { onReady: (a: ReturnType<typeof useAuth>) => void }) {
    onReady(useAuth());
    return null;
}

it('useAuth still exposes union surface (Sidebar consumers stay green)', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
        <AuthProvider>
            <Probe onReady={(a) => { captured = a; }} />
        </AuthProvider>
    );
    const a = captured!;
    expect(a).toHaveProperty('user');
    expect(a).toHaveProperty('isLoading');
    expect(a).toHaveProperty('bootstrapStatus');
    expect(a).toHaveProperty('hasPermission');
    expect(a).toHaveProperty('isAuthenticated');
    expect(a).toHaveProperty('login');
    expect(a).toHaveProperty('logout');
});
```

**Pre-existing tests** at
`tests/frontend/unit/src/contexts/__tests__/{AuthBootstrapConfig,AuthBootstrapRouteGuard,AuthLogoutFlow,AuthSessionAuthority}.test.tsx`
must continue to pass through the compat shim.

**Expected result**: RED on all 3 (modules don't exist; current 77-line
context creates a fresh value object on every render).

#### TDD Step 2 — Implement Change

**New file** `frontend/src/contexts/SessionContext.tsx` — owns session-derived
state from `useSessionSnapshot()`, `hasPermission`, `isAuthenticated`. Wrap
value in `useMemo` over
`[session.user, session.token, session.bootstrapStatus, session.bootstrapError, session.logoutPending, session.logoutErrorKey, hasPermission]`.

**New file** `frontend/src/contexts/PreferencesContext.tsx` — wraps
`usePreferenceHydration(...)` (currently `AuthContext.tsx:31-33`). Export
both `usePreferenceState()` (read) and `usePreferenceActions()` (write).
Memoise value over
`[isPreferencesHydrated, hydratePreferences, markPreferencesReady]`.

**New file** `frontend/src/contexts/AuthActionsContext.tsx` — wraps
`useAuthActions(...)`. Memoise value over `[login, logout]`.

**Rewrite** `frontend/src/contexts/AuthContext.tsx` to a compat shim:

```tsx
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './SessionContext';
import { PreferencesProvider, usePreferenceState } from './PreferencesContext';
import { AuthActionsProvider, useAuthActionsContext } from './AuthActionsContext';

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <PreferencesProvider>
                <AuthActionsProvider>{children}</AuthActionsProvider>
            </PreferencesProvider>
        </SessionProvider>
    );
}

export function useAuth() {
    return { ...useSession(), ...usePreferenceState(), ...useAuthActionsContext() };
}
```

Existing `useAuth` consumers (Sidebar after #35, all 18 mocks rewritten in
#35) keep working through the shim.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- SessionProvider.split.renderCounter
cd frontend && npm run -w tests/frontend/unit test -- AuthActions.split
cd frontend && npm run -w tests/frontend/unit test -- AuthContext.compatShim
cd frontend && npm run -w tests/frontend/unit test -- AuthBootstrap   # regression
cd frontend && npm run -w tests/frontend/unit test -- AuthLogout      # regression
cd frontend && npm run -w tests/frontend/unit test -- AuthSession     # regression
```

#### Lock/TOML/Contract updates (same commit)

- None (capability contract unchanged).

#### README / doc updates (same commit)

- `frontend/src/contexts/auth/README.md` — describe the three providers and
  the compat shim.

#### Verification commands

1. `cd frontend && npm run -w tests/frontend/unit test -- contexts` — broad pass.
2. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
3. `cd frontend && npm run -w tests/frontend/unit lint` — clean.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`refactor(frontend/contexts): split AuthContext into Session/Preferences/AuthActions providers`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 77-line monolithic `AuthContext.tsx`. Compat
  shim ensures `useAuth()` keeps the same surface either way; rollback is
  mechanical.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — render-counter assertions are sensitive to the React
  scheduler; ensure the test uses `act()` strictly and `render` with a stable
  parent; otherwise the counter may double-increment under StrictMode.
- Mitigations: render-counter pattern uses `useRef` (mutation does not trigger
  re-render); `act()` wraps the mutation; compat shim test pins the union
  surface.

#### Handoff notes

- **Gates #71** (Wave 7 Seq 76): AuthContext split is a hard prereq for the
  session module merge.
- **Soft after #35**: per Correction E, sequencing #35 before #66 avoids
  rewriting 18 mock files twice.

---

### Item #13 (Section 5) — #45b — Ownership resolver factory

**Wave**: 6b  | **Slot**: v2 Seq 72 (legacy)  | **Effort**: M (~3-4h)  | **Priority**: P4  | **Domain**: crosscut

> Section-2 reconciliation note: Section 2 places #45b at row 74 (Wave 7);
> the v2 sequence places it at Seq 72 (legacy). Both within the same
> dependency tier (after #45a). This recipe targets Wave 6b/Wave 7 boundary;
> the work is identical either way.

**Dependencies**: **#45a green** (3 characterization tests in main).  
**Atomic with**: none  
**Validator?**: no

#### Why this work

#45a pins the EXISTING ownership behavior; #45b replaces 8 free functions in
`backend/app/core/_permissions/ownership.py:1-142` with a factory call
`make_ownership_resolvers(*, model, owner_column, archived_column?, bridge?)`
that produces an `OwnershipResolvers` bundle. Public surface preserves the 8
free-function names. Phase 4 invariant: factory accepts per-method archived
filter (KRI risk-scope methods filter `is_archived=False`; KRI-direct methods
do NOT). Audit ID = #45b; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 72 legacy / row 74 Section 2.
- [ ] Confirm prerequisites complete: **#45a tests green in main**:
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `tests/backend/pytest/test_visible_ids_via_ownership.py`
- [ ] Read latest state of `backend/app/core/_permissions/ownership.py:1-142`,
  especially asymmetry at `:33,68`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`

```python
"""RED: factory-produced resolvers are byte-equivalent to legacy free functions."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_kri_factory_resolvers_equivalent(client_factory, kri_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            kri_resolvers = make_ownership_resolvers(
                model=KeyRiskIndicator,
                owner_column="reporting_owner_id",
                archived_column="is_archived",
                bridge=None,
            )
            for case in kri_fixture_matrix:
                a = await kri_resolvers.is_owner(db, case.user_id, case.kri_id)
                b = await legacy.is_kri_reporting_owner(db, case.user_id, case.kri_id)
                assert a == b, f"is_owner mismatch on {case}"

                a = await kri_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_kri_reporting_owner(db, case.user_id, case.risk_id)
                assert a == b, f"is_target_owner mismatch on {case}"

                a = sorted(await kri_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_kri_ids_where_reporting_owner(db, case.user_id))
                assert a == b

                a = sorted(await kri_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_kri_reporting_owner(db, case.user_id))
                assert a == b


@pytest.mark.asyncio
async def test_control_factory_resolvers_equivalent(client_factory, control_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import Control, ControlRiskLink
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            control_resolvers = make_ownership_resolvers(
                model=Control,
                owner_column="control_owner_id",
                archived_column=None,
                bridge=(ControlRiskLink, "control_id", "risk_id"),
            )
            for case in control_fixture_matrix:
                a = await control_resolvers.is_owner(db, case.user_id, case.control_id)
                b = await legacy.is_control_owner(db, case.user_id, case.control_id)
                assert a == b
                a = await control_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_control_owner(db, case.user_id, case.risk_id)
                assert a == b
                a = sorted(await control_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_control_ids_where_owner(db, case.user_id))
                assert a == b
                a = sorted(await control_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_control_owner(db, case.user_id))
                assert a == b


def test_archived_filter_applied_per_method() -> None:
    """KRI risk-scope methods filter is_archived=False; KRI-direct methods do NOT."""
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator
    resolvers = make_ownership_resolvers(
        model=KeyRiskIndicator, owner_column="reporting_owner_id",
        archived_column="is_archived", bridge=None,
    )
    assert resolvers.archived_filter_methods == frozenset({"is_target_owner", "target_ids_where_owner"})
```

**Expected result**: RED — `_ownership_factory` module does not exist.

#### TDD Step 2 — Implement Change

**New file** `backend/app/core/_permissions/_ownership_factory.py`:

```python
"""Factory producing ownership resolver bundles from a (model, columns, bridge) spec.

Phase 4 invariant: the factory accepts per-method archived filter selection.
KRI-direct methods (is_owner, ids_where_owner) do NOT filter archived rows;
risk-scope methods (is_target_owner, target_ids_where_owner) DO filter
``is_archived.is_(False)``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class OwnershipResolvers:
    is_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    is_target_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    target_ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    archived_filter_methods: frozenset[str]


def make_ownership_resolvers(
    *,
    model: Any,
    owner_column: str,
    archived_column: Optional[str] = None,
    bridge: Optional[tuple[Any, str, str]] = None,
) -> OwnershipResolvers:
    owner_col = getattr(model, owner_column)
    archived_col = getattr(model, archived_column) if archived_column else None

    async def is_owner(db: AsyncSession, user_id: int, entity_id: int) -> bool:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(owner_col).where(model.id == entity_id))
        return result.scalar_one_or_none() == user_id

    async def ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(model.id).where(owner_col == user_id))
        return [r[0] for r in result.all()]

    if bridge is None:
        target_attr = getattr(model, "risk_id")

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = select(model.id).where(target_attr == target_id, owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt.limit(1))
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = select(target_attr).where(owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            stmt = stmt.distinct()
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]
    else:
        bridge_model, bridge_local_fk, bridge_target_fk = bridge
        bridge_local_col = getattr(bridge_model, bridge_local_fk)
        bridge_target_col = getattr(bridge_model, bridge_target_fk)

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = (
                select(model.id)
                .join(bridge_model, model.id == bridge_local_col)
                .where(bridge_target_col == target_id, owner_col == user_id)
                .limit(1)
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt)
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = (
                select(bridge_target_col)
                .join(model, model.id == bridge_local_col)
                .where(owner_col == user_id)
                .distinct()
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]

    archived_methods: frozenset[str] = (
        frozenset({"is_target_owner", "target_ids_where_owner"})
        if archived_col is not None else frozenset()
    )

    return OwnershipResolvers(
        is_owner=is_owner,
        is_target_owner=is_target_owner,
        ids_where_owner=ids_where_owner,
        target_ids_where_owner=target_ids_where_owner,
        archived_filter_methods=archived_methods,
    )
```

**Rewrite** `backend/app/core/_permissions/ownership.py`:

```python
"""Ownership resolvers (KRI + Control), produced by the shared factory.

Public surface preserves the 8 free-function names so external callers in
``entity_access.py`` keep importing the same identifiers.
"""
from __future__ import annotations

from app.core._permissions._ownership_factory import make_ownership_resolvers
from app.models import Control, ControlRiskLink, KeyRiskIndicator

_kri = make_ownership_resolvers(
    model=KeyRiskIndicator,
    owner_column="reporting_owner_id",
    archived_column="is_archived",
    bridge=None,
)
_control = make_ownership_resolvers(
    model=Control,
    owner_column="control_owner_id",
    archived_column=None,
    bridge=(ControlRiskLink, "control_id", "risk_id"),
)

is_kri_reporting_owner = _kri.is_owner
is_risk_kri_reporting_owner = _kri.is_target_owner
get_kri_ids_where_reporting_owner = _kri.ids_where_owner
get_risk_ids_where_kri_reporting_owner = _kri.target_ids_where_owner

is_control_owner = _control.is_owner
is_risk_control_owner = _control.is_target_owner
get_control_ids_where_owner = _control.ids_where_owner
get_risk_ids_where_control_owner = _control.target_ids_where_owner
```

`backend/app/core/_permissions/entity_access.py:21,23,48` — likely no edit
needed (import names preserved). Verify via grep before merge.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py
pytest tests/backend/pytest/test_ownership_resolver_control_join.py
pytest tests/backend/pytest/test_visible_ids_via_ownership.py
pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py
```

#### Lock/TOML/Contract updates (same commit)

- Cross-check `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`
  stays green (no `MeCapabilities.resource_permissions` shape change).

#### README / doc updates (same commit)

- `backend/app/core/_permissions/README.md` (if exists; create if not) — note
  factory + asymmetry-by-design comment: "KRI risk-scope filters
  `is_archived=False`; KRI-direct does not. This is intentional."

#### Verification commands

1. `pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py` — pass.
2. `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py` — green via factory.
3. `pytest tests/backend/pytest/test_ownership_resolver_control_join.py` — green via factory.
4. `pytest tests/backend/pytest/test_visible_ids_via_ownership.py` — green via factory (9 roles × 4 entity types).
5. `pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py -q` — green.
6. `make -f scripts/Makefile test-architecture-locks` — locks green.
7. `mypy backend/app/core/_permissions` — clean.

#### Commit boundary

Single commit titled
`refactor(permissions): introduce ownership resolver factory; preserve public surface`.

#### Rollback

- Class: **PURE-CODE** (no schema change).
- Procedure: revert restores 8 free functions; characterization tests
  continue to pass.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~3-4h M (factory + rewrite + 4 fixture-matrix tests +
  verification).
- Risk: medium — incorrect bridge wiring would break Control resolution; the
  characterization fixture matrix from #45a is the safety net.
- Mitigations: factory-equivalence test asserts byte-equivalence vs legacy;
  per-method archived filter set is locked.

---

## Wave 7 — P4 Deferred (Slots 74-77, 56h, Week 13)

Wave 7 tackles defers per user instruction. Some items have multi-prereq
convergence (#71 has 4 distinct prereqs). **Validator runs**: 0.

---

### Item #14 (Section 5) — #68 — `WidgetShell` + scoped DashboardFilter selector

**Wave**: 7  | **Slot**: v2 Seq 75 (Section 2 row 75 / legacy 73)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #46 (Wave 6a — query-key factories), #66 (Wave 6b — AuthContext split for store wiring patterns).  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/contexts/DashboardFilterContext.tsx:32-86` exposes one Context
shape that re-renders every consumer on any mutation. Phase 4 confirmed:
**21 dashboard widgets total; 6 use `useDashboardFilters`**
(`CategoryBreakdownCharts`, `DepartmentTable`, `RiskDrilldownModal`,
`FilterBar`, `KRIStatusWidget`, `KRIBreachWidget`). The recipe introduces a
typed `WidgetShell` component encapsulating loading/error/empty/data branches
+ extends the filter context with a scoped `useDashboardFilterSelector<T>`
hook (built on `useSyncExternalStore`) so each consumer subscribes only to
its slice. Audit ID = #68; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 75 (Section 2 row 75; per
  `plan-loop-3-07-integration-v2.md:417`).
- [ ] Confirm prerequisites complete: #46 Commit E green; #66 merged.
- [ ] Read latest state of:
  - `frontend/src/contexts/DashboardFilterContext.tsx:32-86`.
  - The 6 filter-consuming widgets (paths above).
- [ ] Confirm 6 mutators surface: `setDepartmentId`, `setRiskLevel`,
  `setControlStatus`, `setControlForm`, `setViewMode`, `resetFilters`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file 1 (WidgetShell branches)**:
`tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { WidgetShell } from '@/components/dashboard/WidgetShell';

it('renders loading skeleton', () => {
    render(<WidgetShell title="Foo" isLoading><div>data</div></WidgetShell>);
    expect(screen.getByTestId('widget-loading')).toBeInTheDocument();
});

it('renders error state', () => {
    render(<WidgetShell title="Foo" error={new Error('boom')}><div>data</div></WidgetShell>);
    expect(screen.getByTestId('widget-error')).toBeInTheDocument();
});

it('renders empty state', () => {
    render(<WidgetShell title="Foo" isEmpty emptyLabel="No data"><div>data</div></WidgetShell>);
    expect(screen.getByText('No data')).toBeInTheDocument();
});

it('renders data when none of the branches match', () => {
    render(<WidgetShell title="Foo"><div data-testid="data">data</div></WidgetShell>);
    expect(screen.getByTestId('data')).toBeInTheDocument();
});
```

**Test file 2 (scoped selector render-counter pin — Phase 4 mandated)**:
`tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.renderCounter.test.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { render, act, screen } from '@testing-library/react';
import {
    DashboardFilterProvider,
    useDashboardFilterSelector,
    useDashboardFilterMutators,
} from '@/contexts/DashboardFilterContext';

function DepartmentConsumer() {
    const count = useRef(0);
    const dept = useDashboardFilterSelector((s) => s.filters.departmentId);
    useEffect(() => { count.current += 1; });
    return <span data-testid="dept-renders">{count.current}|{dept ?? 'none'}</span>;
}

function RiskMutator() {
    const { setRiskLevel } = useDashboardFilterMutators();
    return <button onClick={() => setRiskLevel('high')}>mut</button>;
}

it('mutating riskLevel does NOT re-render department consumer', () => {
    render(
        <DashboardFilterProvider>
            <DepartmentConsumer />
            <RiskMutator />
        </DashboardFilterProvider>
    );
    const before = screen.getByTestId('dept-renders').textContent;
    act(() => screen.getByText('mut').click());
    const after = screen.getByTestId('dept-renders').textContent;
    expect(after).toBe(before); // render count unchanged
});
```

**Test file 3 (widget shell adoption)**:
`tests/frontend/unit/src/components/dashboard/__tests__/DashboardWidgets.shellAdoption.test.tsx`

```ts
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../../../frontend/src/components/dashboard');

const FILTER_CONSUMERS = [
    'CategoryBreakdownCharts.tsx',
    'DepartmentTable.tsx',
    'RiskDrilldownModal.tsx',
    'FilterBar.tsx',
    'KRIStatusWidget.tsx',
    'KRIBreachWidget.tsx',
];

it.each(FILTER_CONSUMERS)('%s imports WidgetShell', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/from '@\/components\/dashboard\/WidgetShell'/);
});
```

**Expected result**: RED on all three (component doesn't exist; selector
hook doesn't exist; current 6 widgets don't import WidgetShell).

#### TDD Step 2 — Implement Change

**New file** `frontend/src/components/dashboard/WidgetShell.tsx`:

```tsx
import type { ReactNode } from 'react';

interface WidgetShellProps {
    title: string;
    isLoading?: boolean;
    error?: Error | null;
    isEmpty?: boolean;
    emptyLabel?: string;
    children: ReactNode;
}

export function WidgetShell({ title, isLoading, error, isEmpty, emptyLabel, children }: WidgetShellProps) {
    if (isLoading) return <div data-testid="widget-loading">{title}: loading…</div>;
    if (error) return <div data-testid="widget-error">{title}: {error.message}</div>;
    if (isEmpty) return <div data-testid="widget-empty">{emptyLabel ?? `${title}: no data`}</div>;
    return <section aria-label={title}>{children}</section>;
}
```

**Extend** `frontend/src/contexts/DashboardFilterContext.tsx`:

- Re-implement state via `useSyncExternalStore` over an internal store with
  `subscribe`/`getSnapshot`.
- Export `useDashboardFilterSelector<T>(selector: (s: DashboardFilters) => T)`
  and `useDashboardFilterMutators()` (returns the 6 mutators).
- Keep `useDashboardFilters()` as a backward-compat facade returning the
  legacy union shape (so the 15 non-filter-consuming widgets stay valid).

**Refactor** the 6 filter consumers (`CategoryBreakdownCharts.tsx`,
`DepartmentTable.tsx`, `RiskDrilldownModal.tsx`, `FilterBar.tsx`,
`KRIStatusWidget.tsx`, `KRIBreachWidget.tsx`) to use
`useDashboardFilterSelector(s => s.filters.<slice>)` + `WidgetShell`.

The other 15 widgets adopt `WidgetShell` only (no selector); incremental —
separate commit OK.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- WidgetShell.contract
cd frontend && npm run -w tests/frontend/unit test -- DashboardFilterContext.scopedSelector
cd frontend && npm run -w tests/frontend/unit test -- DashboardWidgets.shellAdoption
cd frontend && npm run -w tests/frontend/unit test -- dashboard
cd frontend && npm run -w tests/frontend/unit typecheck
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/src/components/dashboard/README.md` — describe `WidgetShell` API
  + scoped selector contract.

#### Verification commands

1. Three new test files all pass.
2. `cd frontend && npm run -w tests/frontend/unit test -- contexts` — regression pass (DashboardFilter scope).
3. `cd frontend && npm run -w tests/frontend/unit test -- pages/dashboard` — page-level regression pass.
4. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.

#### Commit boundary

Single commit titled
`refactor(frontend/dashboard): introduce WidgetShell + scoped DashboardFilter selector`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores 6 widgets' direct subscriptions; compat facade
  ensures legacy consumers keep working either way.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — `useSyncExternalStore` semantics on React 18 require a
  stable `subscribe` reference; render-counter test is the catch-all.
- Mitigations: render-counter pattern; widget-shell adoption pinned in 3rd test.

---

### Item #15 (Section 5) — #71 — Merge `frontend/src/services/session/` 8 → 4 (single-flight pin)

**Wave**: 7  | **Slot**: v2 Seq 76 (Section 2 row 77 / legacy 75)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: frontend

**Dependencies**: #47 (Wave 4 — session refresh policy), #66 (Wave 6b — AuthContext split), **#72 (Wave 1 — ADR-011, hard prereq)**.  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/services/session/` carries 8 files today (verified):
`README.md`, `bootstrap.ts`, `index.ts`, `logoutSuppression.ts`, `manager.ts`,
`refreshHint.ts`, `sso.ts`, `store.ts`, `types.ts`. The merge produces 4
runtime files + a barrel (5 entries):
- `types.ts` (kept)
- `store.ts` (kept)
- **NEW** `sessionStorage.ts` ← `refreshHint.ts` + `logoutSuppression.ts`
- **NEW** `coordinator.ts` ← `manager.ts` + `bootstrap.ts` + `sso.ts`
- **REWRITE** `index.ts` (barrel)

> **Phase 4/Phase 6 CRITICAL**: module-scope state at
> `frontend/src/services/session/sso.ts:9-11` MUST survive the merge intact:
>
> ```ts
> let refreshInFlight: Promise<string | null> | null = null;
> let lastRefreshFailureAt = 0;
> const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
> ```
>
> Plus `let bootstrapPromise: ... | null = null;` from `bootstrap.ts:16`.
> A careless concatenation that reinitialises these per-file boundary will
> break single-flight semantics. The single-flight test pins this BEFORE the
> merge and must continue to pass after.

Audit ID = #71; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 76 (per
  `plan-loop-3-07-integration-v2.md:419`; Section 2 row 77).
- [ ] Confirm prerequisites complete: #47 + #66 + **#72 (ADR-011) all merged**.
- [ ] Read latest state of:
  - `frontend/src/services/session/sso.ts:9-11` (verify the 3 module-scope
    state declarations).
  - `frontend/src/services/session/bootstrap.ts:16` (verify
    `bootstrapPromise`).
  - `frontend/src/services/session/manager.ts:138`
    (`applyAuthenticatedSession`).
  - `frontend/src/services/session/sso.ts:13` (`trySilentSessionRefresh`).
  - `frontend/src/services/session/index.ts` (current barrel exports).
- [ ] Confirm three test seams already exist:
  - `__resetSilentSessionRefreshForTests`
  - `__resetAuthSessionCoordinatorForTests`
  - `__resetBootstrapSessionCacheForTests`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED) — write BEFORE the merge

**Test file 1 (sessionStorage merged)**:
`tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
    hasRefreshSessionHint,
    clearRefreshSessionHint,
    isExplicitLogoutSuppressed,
    setExplicitLogoutSuppressed,
    clearExplicitLogoutSuppressed,
} from '@/services/session/sessionStorage';

beforeEach(() => clearExplicitLogoutSuppressed());

it('exposes refreshHint helpers', () => {
    expect(typeof hasRefreshSessionHint).toBe('function');
    expect(typeof clearRefreshSessionHint).toBe('function');
});

it('exposes logoutSuppression helpers', () => {
    setExplicitLogoutSuppressed();
    expect(isExplicitLogoutSuppressed()).toBe(true);
    clearExplicitLogoutSuppressed();
    expect(isExplicitLogoutSuppressed()).toBe(false);
});
```

**Test file 2 (coordinator merged)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
    applyAuthenticatedSession,
    trySilentSessionRefresh,
    bootstrapAuthSession,
} from '@/services/session/coordinator';

describe('coordinator merged module', () => {
    it('exports applyAuthenticatedSession', () => expect(typeof applyAuthenticatedSession).toBe('function'));
    it('exports trySilentSessionRefresh', () => expect(typeof trySilentSessionRefresh).toBe('function'));
    it('exports bootstrapAuthSession', () => expect(typeof bootstrapAuthSession).toBe('function'));
});
```

**Test file 3 (single-flight pin — Phase 4 mandated)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { authApi } from '@/services/authApi';
import {
    trySilentSessionRefresh,
    __resetSilentSessionRefreshForTests,
} from '@/services/session/coordinator';
import { __setRefreshSessionHintForTests } from '@/services/session/sessionStorage';

beforeEach(() => {
    __resetSilentSessionRefreshForTests();
    __setRefreshSessionHintForTests();
    vi.restoreAllMocks();
});

it('two concurrent calls share one in-flight refresh', async () => {
    const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue({
        access_token: 'tok', user: { id: 1 } as any,
    } as any);
    const [a, b] = await Promise.all([
        trySilentSessionRefresh(),
        trySilentSessionRefresh(),
    ]);
    expect(refreshSpy).toHaveBeenCalledTimes(1);   // single-flight contract
    expect(a).toBe('tok');
    expect(b).toBe('tok');
});

it('REFRESH_FAILURE_COOLDOWN_MS gates retries after failure', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValueOnce(new Error('boom'));
    await trySilentSessionRefresh();   // failure recorded
    const second = await trySilentSessionRefresh();   // within cooldown
    expect(second).toBeNull();
});
```

**Test file 4 (structural)**:
`tests/frontend/unit/src/services/session/__tests__/coordinator.structural.test.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';

const SESSION_DIR = path.resolve(__dirname, '../../../../../../frontend/src/services/session');

describe('session module 4-file post-merge layout', () => {
    it('exposes exactly the new file set', () => {
        const expected = new Set(['types.ts', 'store.ts', 'sessionStorage.ts', 'coordinator.ts', 'index.ts']);
        const actual = new Set(fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.ts')));
        expect(actual).toEqual(expected);
    });

    it('legacy files are gone', () => {
        for (const legacy of ['bootstrap.ts', 'manager.ts', 'sso.ts', 'refreshHint.ts', 'logoutSuppression.ts']) {
            expect(fs.existsSync(path.join(SESSION_DIR, legacy))).toBe(false);
        }
    });
});
```

**Pin BEFORE the merge**: run the 4 tests against the current 8-file layout.
Test 3 (single-flight) MUST PASS today (current `sso.ts:9-11` carries the
state); the pin locks it. Tests 1, 2, 4 fail RED today.

#### TDD Step 2 — Implement Change (the merge)

1. **NEW** `frontend/src/services/session/sessionStorage.ts`: verbatim
   concatenation of `refreshHint.ts` + `logoutSuppression.ts`. Both are leaf
   primitives with no shared state. Re-export both surfaces.

2. **NEW** `frontend/src/services/session/coordinator.ts`: verbatim
   concatenation of `manager.ts` + `bootstrap.ts` + `sso.ts`. **Module-scope
   state preservation**: keep the three `sso.ts:9-11` declarations + the
   `bootstrap.ts:16` declaration at the **top of the new file** (NOT
   per-original-file boundary):

   ```ts
   // Module-scope state — preserved verbatim from sso.ts:9-11 + bootstrap.ts:16.
   // DO NOT move into a function or per-file IIFE; single-flight semantics depend
   // on the module-scope identity of these references.
   let refreshInFlight: Promise<string | null> | null = null;
   let lastRefreshFailureAt = 0;
   const REFRESH_FAILURE_COOLDOWN_MS = 1_000;
   let bootstrapPromise: Promise<unknown> | null = null;
   ```

   All three test seams (`__resetSilentSessionRefreshForTests`,
   `__resetAuthSessionCoordinatorForTests`, `__resetBootstrapSessionCacheForTests`)
   MUST stay exported.

3. **DELETE** `bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`,
   `logoutSuppression.ts`.

4. **REWRITE** `frontend/src/services/session/index.ts`:

   ```ts
   export * from './coordinator';
   export * from './sessionStorage';
   export * from './store';
   export * from './types';
   ```

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- sessionStorage.merged
cd frontend && npm run -w tests/frontend/unit test -- coordinator.merged
cd frontend && npm run -w tests/frontend/unit test -- coordinator.singleFlight
cd frontend && npm run -w tests/frontend/unit test -- coordinator.structural
cd frontend && npm run -w tests/frontend/unit test -- session
cd frontend && npm run -w tests/frontend/unit test -- contexts   # auth context regression
cd frontend && npm run -w tests/frontend/unit typecheck
```

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_naming_allowlist.toml` — add new file
  paths if listed by name; remove the 5 deleted paths if listed.

#### README / doc updates (same commit)

- `frontend/src/services/session/README.md` — replace the 8-file map with the
  4-file map. Note the module-scope state preservation contract (single-flight
  + cooldown) and link to the singleFlight pin test path.

#### Verification commands

1. All 4 new test files pass (incl. single-flight pin).
2. `cd frontend && npm run -w tests/frontend/unit test -- session contexts` — full session + AuthContext regression green.
3. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled
`refactor(frontend/services/session): merge 8 files into 4 (preserve single-flight contract)`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores the 8-file layout. Single-flight pin must
  continue to pass under rollback (state preserved either way).
- Risk vector: a careless rollback might lose the pin test if it imported
  from the merged path — keep the pin test path-stable via
  `@/services/session` (barrel) imports rather than direct
  `@/services/session/coordinator` imports.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: HIGH — single-flight semantics break if module-scope state is
  reinitialised per concatenation boundary; cooldown gating depends on a
  stable `lastRefreshFailureAt`.
- Mitigations: single-flight test pinned BEFORE the merge; module-scope state
  preserved verbatim at top of `coordinator.ts`; 3 test-only reset seams kept.

---

### Item #16 (Section 5) — #60 — Introduce `PrivilegeContext` + `Depends(get_privilege_context)`

**Wave**: 7  | **Slot**: v2 Seq 75 (Section 2 row 76 / legacy 74)  | **Effort**: M (~8h)  | **Priority**: P4  | **Domain**: approvals

**Dependencies**: #34 (Wave 5 — `resolve_approval_privilege_tier` helper), #51 (Wave 4 — `kris/_kri_history/value_application.py` shim deletion).  
**Atomic with**: none  
**Validator?**: no — but capability contract surface; `validate_authz_capability_contract.py` smoke

#### Why this work

#34 extracted `resolve_approval_privilege_tier(...)`. #60 builds on that by
introducing a `PrivilegeContext` dataclass + `get_privilege_context()`
FastAPI dependency that endpoints declare via `Depends(...)`. Endpoints stop
re-resolving the tier per-request; tests stop building it ad-hoc. Audit ID =
#60; developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 75 (per Section 2 row 76).
- [ ] Confirm prerequisites complete: #34 (`resolve_approval_privilege_tier`)
  merged; #51 (kris/value_application shim) merged.
- [ ] Read latest state of:
  - `backend/app/services/_approval_execution/scenario_policy.py`
    (`resolve_approval_privilege_tier`).
  - `backend/app/api/v1/endpoints/approvals/*.py` (consumers).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Tests (RED)

**Test file**: `tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py`

```python
"""PrivilegeContext + get_privilege_context dependency."""
from __future__ import annotations

import inspect
import pytest

pytestmark = pytest.mark.contract


def test_privilege_context_dataclass_exists() -> None:
    from app.services._approval_execution.privilege_context import PrivilegeContext
    fields = {f.name for f in PrivilegeContext.__dataclass_fields__.values()}
    assert "user" in fields
    assert "tier" in fields  # current tier resolved per-request


def test_get_privilege_context_dependency_signature() -> None:
    from app.services._approval_execution.privilege_context import get_privilege_context
    sig = inspect.signature(get_privilege_context)
    # Async dependency taking current_user + db.
    assert any(p.name == "current_user" for p in sig.parameters.values())
    assert any(p.name == "db" for p in sig.parameters.values())


@pytest.mark.asyncio
async def test_privilege_context_endpoint_uses_dependency(client_factory, test_user_admin) -> None:
    """Hit one approvals endpoint that should consume Depends(get_privilege_context)."""
    async with client_factory(current_user=test_user_admin) as ac:
        resp = await ac.get("/api/v1/approvals")  # any endpoint with Depends wired
    assert resp.status_code in (200, 204)  # not 500 (dependency wires correctly)
```

**Expected result**: RED — `PrivilegeContext` and `get_privilege_context` don't
exist yet.

#### TDD Step 2 — Implement Change

**New file** `backend/app/services/_approval_execution/privilege_context.py`:

```python
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models import User
from app.services._approval_execution.scenario_policy import resolve_approval_privilege_tier


@dataclass(frozen=True)
class PrivilegeContext:
    user: User
    tier: str  # 'admin' | 'cro' | ... per resolve_approval_privilege_tier


async def get_privilege_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PrivilegeContext:
    tier = await resolve_approval_privilege_tier(db, current_user)
    return PrivilegeContext(user=current_user, tier=tier)
```

**Edit** approvals endpoints that previously re-resolved the tier inline.
Replace:

```python
async def my_endpoint(current_user: User = Depends(get_current_user)) -> ...:
    tier = await resolve_approval_privilege_tier(db, current_user)
    ...
```

with:

```python
async def my_endpoint(ctx: PrivilegeContext = Depends(get_privilege_context)) -> ...:
    tier = ctx.tier
    user = ctx.user
    ...
```

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py
pytest tests/backend/pytest/api/v1/approvals -q
python scripts/security/validate_authz_capability_contract.py
```

#### Lock/TOML/Contract updates (same commit)

- None new.
- Verify `tests/backend/pytest/_get_db_override_whitelist.toml` does NOT
  require new entry (the new dependency uses `get_db`, not a local override).

#### README / doc updates (same commit)

- `backend/app/services/_approval_execution/README.md` — note
  `PrivilegeContext` + `get_privilege_context()` as the canonical entry for
  approvals endpoints.

#### Verification commands

1. `pytest tests/backend/pytest/api/v1/approvals/test_privilege_context_dependency_red.py` — pass.
2. `pytest tests/backend/pytest/api/v1/approvals -q` — broad regression pass.
3. `python scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `mypy backend/app/services/_approval_execution backend/app/api/v1/endpoints/approvals` — clean.

#### Commit boundary

Single commit titled
`feat(approvals): introduce PrivilegeContext + get_privilege_context dependency`.

#### Rollback

- Class: **PURE-CODE**.
- Procedure: revert restores per-endpoint tier resolution. No data implication.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: ~8h M.
- Risk: medium — endpoints that don't migrate to the new dep continue to
  re-resolve; over time this leads to inconsistent tier semantics.
- Mitigations: lock test asserts the dependency exists; per-endpoint
  migration audited via grep.

---

## Wave 8 — Migration + FE TS Cleanup (Slots 78-79+, 28h, Week 14)

Wave 8 is the dedicated migration window. **#69 + #70 land as a single
bundled commit** (single Alembic revision per ADR-010); **#77b lands in the
same week** to close the deploy-skew window. **Validator runs**: 0 (no
contract change; ADR-005/ADR-010 govern).

> The full 9-step sequence for #69+#70 with all 8 RED tests, snapshot/restore
> procedure, and Postgres-lane test plan lives in the **Migration Window —
> #69+#70 Atomic Bundle (Detailed Reference)** section appended at the end.
> Item #17 below is the per-item recipe summary that links into the detailed
> reference.

---

### Item #17 (Section 5) — #69 + #70 — Atomic vendor migration bundle (XL)

**Wave**: 8  | **Slot**: v2 Seq 77 + 78 (Section 2 rows 78 + 79)  | **Effort**: **XL (35-42h)**  | **Priority**: P4  | **Domain**: vendor

**Dependencies**: none structural; **#77a (Wave 6a) MUST be merged first** to
soft-tolerate deploy-skew.  
**Atomic with**: each other (single Alembic revision; bundled per ADR-010).  
**Validator?**: no (contract not touched).

#### Why this work

`Vendor.status` is a single-value enum (`'active'`) that has been a no-op
since the unify cutover; `_archivable.py:60-65` still carries a
`"vendors": ("inactive",)` legacy alias. `vendor_risk_links` and
`vendor_control_links` foreign keys are missing `ON DELETE CASCADE`
(`vendor_kri_links` already has it). The atomic migration:

1. Introduces `AbstractVendorLink` mixin (#69 Phase 1) for shared column shape.
2. Drops `Vendor.status` column + `VendorStatusEnum` (#70).
3. Rebuilds 4 FKs with `ON DELETE CASCADE` (matches kri-links).
4. Drops `_archivable.py:60-65` `"vendors": ("inactive",)` lock entry.

Single Alembic revision `k6l7m8n9o0p1` per ADR-010 forward-only contract.
Audit ID = #69+#70; developer verdict = ACCEPT.

> **Phase 6 critical fixes** (all four applied):
> 1. `tests/backend/pytest/migrations/` directory does NOT exist today —
>    recipe creates `__init__.py` + conftest.py with postgres fixtures.
> 2. `make -f scripts/Makefile postgres-up` does NOT exist — use
>    `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`
>    (the existing target at `scripts/Makefile:121-122`).
> 3. **All 4 NEW Phase 4 RED tests** are required:
>    idempotency, concurrent-write, FK-orphan precheck, partial-failure recovery.
> 4. `down_revision = "j5k6l7m8n9o0"` (current head verified at
>    `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 77/78 (per Section 2 rows 78/79).
- [ ] Confirm prerequisites complete: **#77a merged** (vendor schema accepts
  optional `status`).
- [ ] Confirm Loop 4 (KRI domain) is NOT scheduled to touch
  `vendor_kri_link.py` in the same window.
- [ ] Capture pre-upgrade snapshot per ADR-010: see "Snapshot/Restore
  Procedure" in the Migration Window section below.
- [ ] Confirm Postgres lane is provisioned: `TEST_DATABASE_URL` env var set.

#### TDD Step 1 — Write 8 RED tests

(See **Migration Window — #69+#70 Atomic Bundle (Detailed Reference)** below
for the complete code of all 8 tests.)

The 8 tests live in two directories:

- `tests/backend/pytest/architecture/`:
  - `test_vendor_link_mixin_red.py`
  - `test_vendor_status_drop_red.py`
- `tests/backend/pytest/migrations/` (**directory does not exist; create it**):
  - `__init__.py` (new)
  - `conftest.py` (new — provides `postgres_engine`, `postgres_session`,
    `postgres_engine_pre_migration`, `seeded_vendor` fixtures)
  - `test_vendor_link_cascade_postgres_red.py`
  - `test_vendor_link_migration_forward_only_red.py`
  - `test_vendor_migration_idempotency_red.py` (Phase 4 NEW)
  - `test_vendor_link_concurrent_writes_red.py` (Phase 4 NEW)
  - `test_vendor_link_orphan_precheck_red.py` (Phase 4 NEW)
  - `test_vendor_link_partial_failure_recovery_red.py` (Phase 4 NEW)

**Postgres-lane invocation** (per Phase 6 fix; replaces non-existent
`make postgres-up`):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
make -f scripts/Makefile test-postgres-ci
```

Or directly:

```bash
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/
```

#### TDD Step 2-7 — see Migration Window section

Steps 2 (mixin), 3 (rebase 3 link models), 4 (Alembic revision), 5 (drop
status surface), 6 (lock collapse), 7 (doc updates) are documented in full
detail in the **Migration Window — #69+#70 Atomic Bundle (Detailed
Reference)** section at the end of this document.

#### TDD Step 8 — Final gates

```
make -f scripts/Makefile test-architecture-locks
TEST_DATABASE_URL="postgresql+asyncpg://..." make -f scripts/Makefile test-postgres-ci
pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_e2e_seed_archive_state_red.py
ruff check backend tests
mypy backend/app
python scripts/security/validate_authz_capability_contract.py
```

#### Step 9 — Single bundled commit

**Title**: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`

**Body** (excerpt):

```
Phase: 7. Forward-only per ADR-010. Bundles #69 (Phase 1 mixin) + #70
(Vendor.status drop) into a single Alembic revision k6l7m8n9o0p1.

Bundled because:
1. Both axes touch vendor* schema in one Alembic revision.
2. Both share ADR-010 forward-only entry.
3. Both share rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
4. Single migration window minimises operational risk.

Changes:
- New AbstractVendorLink mixin at backend/app/models/_vendor_link_mixin.py.
- 3 link models rebased onto mixin.
- Alembic k6l7m8n9o0p1: rebuilds 4 FKs with ON DELETE CASCADE; drops
  ix_vendors_status; drops vendors.status column.
- 8 prod sites + 1 seed write + 6 seed dicts cleaned of vendor.status.
- _archivable.py:60-65 vendors entry removed (legacy_values collapse).
- 7 doc updates: models/README.md, _vendor_links/README.md, ADR-005, ADR-010,
  docs/README.md, DOCUMENTATION_TREE.md, BUSINESS_LOGIC.md.

Pre-merge: snapshot captured (pre_k6l7m8n9o0p1.dump); row counts captured at
.planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt.
```

Allow split into 2 commits if diff > 400 lines OR mypy can't type-check
intermediate state cleanly:
- C1 (mixin): mixin + 3 link model rebases + RED tests for §6.1, §6.4 + docs
  `models/README.md`, `_vendor_links/README.md`, ADR-010 mixin entry.
- C2 (status drop + cascade migration): Alembic revision + Vendor model edits
  + 8 service sites + seed scripts + remaining docs + RED tests for §6.2,
  §6.3, §6.5, §6.6, §6.7, §6.8.

Recommended: keep as **single commit** unless either condition fires.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_archive_allowlist.toml` — verify vendor-link tables not listed (Loop B confirmed).
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — verify `_vendor_link_mixin` not flagged.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no change.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — no change.

#### README / doc updates (same commit)

7 files (full text in Migration Window section §7):
1. `backend/app/models/README.md`
2. `backend/app/services/_vendor_links/README.md`
3. `docs/adr/ADR-005-archivable-mixin-schema-contract.md`
4. `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`
5. `docs/README.md`
6. `docs/DOCUMENTATION_TREE.md`
7. `docs/BUSINESS_LOGIC.md`

#### Rollback

- Class: **MIGRATION** (forward-only).
- Procedure: `pg_restore --clean --no-owner --jobs=4 --dbname=$DB pre_k6l7m8n9o0p1.dump`;
  redeploy prior application version; invalidate frontend bundle caches.
  `downgrade()` raises `NotImplementedError` per ADR-010.
- Estimated rollback: 30 min (pg_restore on prod-sized DB) + frontend purge.

#### Effort & Risk

- Estimated time: **35-42h XL** (mixin + 3 model rebases + Alembic revision +
  8 prod sites + 7 seed locations + 4 fixture deletions + 7 docs + 8 RED tests
  + Postgres-lane rehearsal + final gates).
- Risk: HIGH — schema change; forward-only with snapshot rollback.
- Mitigations: 8 RED tests including 4 Phase 4 (idempotency, concurrent-write,
  orphan precheck, partial-failure recovery); pre-upgrade snapshot validated
  restorable; row-count capture; staging clone rehearsal.

#### Cross-domain handoff notes

- **#77a → #69+#70**: #77a (Wave 6a Seq 69) MUST land first so FE soft-
  tolerates missing `status`. If rollback happens AFTER BE migration lands,
  rollback order is FE-rollback → BE-rollback (frontend bundles depending on
  the literal `status` field would otherwise reject responses).
- **#69+#70 → #77b**: #77b (Wave 8 Seq 79+) lands in the same week to remove
  `status?` from FE TS types entirely after BE migration completes.
- **Loop 4 (KRI domain)**: must NOT touch `vendor_kri_link.py` in the same
  window. Per Phase 5 review, KRI domain confirms no overlap.

---

### Item #18 (Section 5) — #77b — Prune `Vendor.status` from FE TS types and Zod schemas

**Wave**: 8  | **Slot**: v2 Seq 79+ (final)  | **Effort**: S (~1h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: **#69+#70 merged + deployed** (BE migration complete; cache
invalidated).  
**Atomic with**: pair-temporal with #77a + #69+#70.  
**Validator?**: no

#### Why this work

#77a soft-tolerated missing `status`. After #69+#70 lands and the
deploy-skew window closes, `Vendor.status` is no longer in API responses.
This recipe removes the field entirely from FE TS types and Zod schemas.
Phase 6 verified the three sites: `frontend/src/types/vendor.ts:1,64,94`.
Audit ID = #77b; developer verdict = ACCEPT.

> **Phase 6 critical**: target lines `frontend/src/types/vendor.ts:1,64,94`
> are exactly:
> - `:1` `export type VendorStatus = 'active';`
> - `:64` `status: VendorStatus;` (after #77a → `status?: VendorStatus;`)
> - `:94` `status?: VendorStatus | 'inactive' | 'archived';`
>
> All three lines must be DELETED in this commit.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 79+ (per Section 2 row 80).
- [ ] Confirm prerequisites complete: #69+#70 merged + deployed; backend
  no longer returns `vendor.status`.
- [ ] Read latest state of:
  - `frontend/src/types/vendor.ts:1,64,94` (3 references).
  - `frontend/src/services/api/schemas/entities/vendors.ts` (locate the
    `status` field on `vendorSchema` — currently `.optional()` after #77a).
  - `frontend/src/components/kri/useKriModalState.ts:90,134`
  - `frontend/src/components/kri-form/useKriLookups.ts:115`
  - `frontend/src/components/vendor-form/vendorForm.types.ts:4,74`
  - `frontend/src/pages/vendors/vendorsPagePresentation.ts:3,22-23`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/types/vendor.types.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Vendor, VendorListParams } from '@/types/vendor';

describe('Vendor type post-status-drop', () => {
    it('Vendor type has no status field', () => {
        const v: Vendor = {
            id: 1,
            name: 'X',
            outsourcing_owner_user_id: 1,
            linked_risks: [],
            vendor_type: 'ict',
            risk_score_1_5: 1,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
            process: 'p',
            is_archived: false,
            created_at: 'now',
            updated_at: 'now',
        };
        // @ts-expect-error status field must not exist on Vendor
        const s = v.status;
        expect(s).toBeUndefined();
    });

    it('VendorListParams has no status query field', () => {
        const p: VendorListParams = {};
        // @ts-expect-error status query removed
        const s = p.status;
        expect(s).toBeUndefined();
    });
});
```

**Expected result**: RED — `vendor.ts:64` still declares
`status?: VendorStatus;` (after #77a) and `:94` declares
`status?: VendorStatus | 'inactive' | 'archived';`.

#### TDD Step 2 — Implement Change

**Edit** `frontend/src/types/vendor.ts`:

```diff
- export type VendorStatus = 'active';
- ...
- status?: VendorStatus;
- ...
- status?: VendorStatus | 'inactive' | 'archived';
```

Delete all three lines (`:1,64,94`). Delete any other `VendorStatus`
re-exports that survive.

**Edit** `frontend/src/services/api/schemas/entities/vendors.ts`:

```diff
- // Pre-migration soft-tolerate (item #77a) — restored to z.enum(['active']) after #69+#70 in #77b.
- status: z.enum(['active']).optional(),
```

Drop the line entirely (no `status` field on the Zod schema).

**Edit** UI display logic (delete the references):

- `frontend/src/components/kri/useKriModalState.ts:90,134` —
  delete `status: vendor.status,` lines.
- `frontend/src/components/kri-form/useKriLookups.ts:115` —
  delete `status: vendor.status,` line.
- `frontend/src/components/vendor-form/vendorForm.types.ts:4,74` —
  delete `VendorStatus` import + `normalizeVendorStatus(...)` function
  (becomes dead; remove all callers).
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:3` —
  delete `VendorStatus` from import.
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:22-23` —
  delete `VendorListStatusFilter` and `VendorDisplayStatus` type aliases
  (dead after removal). Audit consumers and replace with `is_archived`-based
  display.

**Frontend e2e cleanup** (NOT in this commit; flagged for Loop 6):

- `tests/frontend/e2e/vendors.spec.ts` `ensureVendorStatus(...)` helpers —
  Loop 6 owns rename to `ensureVendorArchived(...)`.
- `tests/frontend/unit/src/e2e/apiAuth.archive-state.test.ts:114` —
  Loop 6 owns.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- vendor.types
cd frontend && npm run -w tests/frontend/unit typecheck
cd frontend && npm run -w tests/frontend/unit lint
```

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- `frontend/README.md` (if mentions `vendor.status`) — strike.

#### Verification commands

1. `cd frontend && npm run -w tests/frontend/unit test -- vendor.types` — pass.
2. `cd frontend && npm run -w tests/frontend/unit test -- schemas/vendors` — Zod schema regression pass.
3. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
4. `cd frontend && npm run -w tests/frontend/unit lint` — clean.
5. `grep -rn "VendorStatus\|vendor.status" frontend/src` — should return only e2e helpers (out of scope).

#### Commit boundary

Single commit titled
`chore(frontend): drop Vendor.status references after backend column drop`.

Lands in the same week as #69+#70.

#### Rollback

- Class: **PURE-CODE** (frontend-only).
- Procedure: revert restores `status?: VendorStatus;` and the related types.
  No DB; no schema. If rollback happens, FE will treat absent `status` as
  optional (covered by #77a relaxation if still in tree).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~1h S.
- Risk: low — type-only removal; no consumer breaks because BE no longer
  returns `status`.
- Mitigations: `@ts-expect-error` assertion pins absence; typecheck would
  flag any consumer that still reads `vendor.status`.

---

## Migration Window — #69+#70 Atomic Bundle (Detailed Reference)

This section contains the full 9-step sequence for the #69+#70 migration
window. It is the authoritative reference cited from Section 5 Item #17.

### Reference state confirmations

- `backend/app/models/vendor.py:22-23` — `class VendorStatus(str, PyEnum): active = "active"`.
- `backend/app/models/vendor.py:82` — `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `backend/app/models/_archivable.py:60-64` — legacy_values dict including `"vendors": ("inactive",)`.
- `backend/app/schemas/vendor.py:12-13,53,83` — `VendorStatusEnum` + 2 fields.
- `backend/app/schemas/__init__.py:115,212` — re-exports.
- Current Alembic head: `j5k6l7m8n9o0` (per `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).
- Forward-only precedent: `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`.
- 8 prod call sites consuming `vendor.status`:
  - `backend/app/services/_register_listings/vendors.py:15,53,89,103,108,121,131,200,273,482,501`
  - `backend/app/services/_register_listings/controls.py:554`
  - `backend/app/services/_register_listings/risks.py:430`
  - `backend/app/services/_monitoring_response.py:219`
  - `backend/app/services/_reporting/exports/rows.py:120`
  - `backend/app/services/_kri_history/direct_application.py:36`

### Test infrastructure setup (Phase 6 critical fix #1)

`tests/backend/pytest/migrations/` directory does NOT exist today. The recipe
**creates** it with the following files:

**`tests/backend/pytest/migrations/__init__.py`** (new, empty):

```python
"""Postgres-lane migration tests for #69+#70 vendor migration window."""
```

**`tests/backend/pytest/migrations/conftest.py`** (new):

```python
"""Postgres-lane fixtures for vendor migration tests.

These fixtures are gated on TEST_DATABASE_URL pointing at a Postgres lane.
On sqlite or when TEST_DATABASE_URL is unset, postgres-marked tests are
skipped via the project-wide pytest mark configuration.
"""
from __future__ import annotations

import os
from typing import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

POSTGRES_URL = os.environ.get("TEST_DATABASE_URL")


def _require_postgres() -> str:
    if not POSTGRES_URL or "postgresql" not in POSTGRES_URL:
        pytest.skip("TEST_DATABASE_URL not set to a Postgres URL; skipping postgres-lane test.")
    return POSTGRES_URL


@pytest.fixture
async def postgres_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Engine connected to the post-upgrade test DB (alembic upgrade head already run)."""
    engine = create_async_engine(_require_postgres(), echo=False)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def postgres_session(postgres_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Session bound to the post-upgrade engine."""
    factory = async_sessionmaker(postgres_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def postgres_engine_pre_migration() -> AsyncGenerator[AsyncEngine, None]:
    """Engine pinned at revision j5k6l7m8n9o0 (one rev before our migration).

    Use for tests that need to exercise the migration body itself (idempotency,
    partial-failure recovery, orphan-precheck) starting from a pre-upgrade DB.
    """
    pre_url = os.environ.get("TEST_DATABASE_URL_PRE_MIGRATION")
    if not pre_url:
        pytest.skip("TEST_DATABASE_URL_PRE_MIGRATION not set; skipping pre-migration test.")
    engine = create_async_engine(pre_url, echo=False)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def seeded_vendor(postgres_session: AsyncSession):
    """Insert a vendor + a linked risk so cascade-delete tests have data to delete."""
    from sqlalchemy import text
    result = await postgres_session.execute(
        text("INSERT INTO vendors (name, process, vendor_type, "
             "risk_score_1_5, supports_important_core_insurance_function, "
             "dora_relevant, is_significant_vendor, has_alternative_providers, "
             "is_archived, outsourcing_owner_user_id, created_at, updated_at) "
             "VALUES ('TestCascade', 'p', 'ict', 1, false, false, false, false, "
             "false, 1, now(), now()) RETURNING id")
    )
    vendor_id = result.scalar_one()
    await postgres_session.commit()

    class _Vendor:
        id = vendor_id
    yield _Vendor()
```

> **Phase 6 fix #2**: `make -f scripts/Makefile postgres-up` does NOT exist.
> Use `TEST_DATABASE_URL=postgresql+asyncpg://... make -f scripts/Makefile test-postgres-ci`
> (existing target at `scripts/Makefile:121-122`):
>
> ```makefile
> test-postgres-ci:
>     @test -n "$$TEST_DATABASE_URL" || (echo "TEST_DATABASE_URL is required for make test-postgres-ci" >&2; exit 1)
>     # ... runs the postgres-lane subset.
> ```

### Step 1: Write 8 RED tests

All 8 tests must be present and failing on `main` before any production code
edits.

#### 1.1 `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`

```python
"""RED: AbstractVendorLink mixin invariants. Fails until #69 mixin lands."""
import pytest
from sqlalchemy.sql.schema import Column

pytestmark = pytest.mark.contract


def test_abstract_vendor_link_marked_abstract() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink  # ImportError today
    assert getattr(AbstractVendorLink, "__abstract__", False) is True


def test_concrete_link_models_inherit_mixin() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        assert issubclass(cls, AbstractVendorLink), cls.__name__


def test_vendor_id_fk_uniformly_cascades() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        col: Column = cls.__table__.c.vendor_id
        fk = next(iter(col.foreign_keys))
        assert fk.ondelete == "CASCADE", f"{cls.__name__}.vendor_id missing cascade"


def test_unique_constraint_names_preserved() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    pairs = {
        "vendor_risk_links": "uq_vendor_risk_link",
        "vendor_control_links": "uq_vendor_control_link",
        "vendor_kri_links": "uq_vendor_kri_link",
    }
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        names = {c.name for c in cls.__table__.constraints if c.name and c.name.startswith("uq_")}
        assert pairs[cls.__tablename__] in names
```

**Assertions**: 4 separate tests pin: `__abstract__ = True`; subclassing;
uniform `ondelete=CASCADE` on `vendor_id`; preserved unique constraint names.

#### 1.2 `tests/backend/pytest/architecture/test_vendor_status_drop_red.py`

```python
"""RED: Vendor.status column / VendorStatusEnum / archived_clause shape."""
import inspect

import pytest
from sqlalchemy.dialects import postgresql

pytestmark = pytest.mark.contract


def test_vendor_status_column_dropped() -> None:
    from app.models import Vendor
    assert "status" not in Vendor.__table__.c, "Vendor.status column must be dropped"


def test_vendor_status_enum_class_removed() -> None:
    import app.models.vendor as vendor_module
    import app.schemas.vendor as schema_module
    assert not hasattr(vendor_module, "VendorStatus")
    assert not hasattr(schema_module, "VendorStatusEnum")


def test_archived_clause_collapsed_to_flag_only() -> None:
    from app.models import Vendor
    from app.models._archivable import archived_clause
    clause = archived_clause(Vendor, archived=True)
    sql = str(clause.compile(dialect=postgresql.dialect()))
    assert "vendors.is_archived" in sql
    assert "vendors.status" not in sql


def test_vendor_list_criteria_has_no_status_filter() -> None:
    from app.services._register_listings.vendors import VendorListCriteria
    fields = {f.name for f in VendorListCriteria.__dataclass_fields__.values()}
    assert "status_filter" not in fields
    assert "archived_status_filter" not in fields


def test_coerce_vendor_list_criteria_signature_drops_status_filter() -> None:
    from app.services._register_listings.vendors import coerce_vendor_list_criteria
    sig = inspect.signature(coerce_vendor_list_criteria)
    assert "status_filter" not in sig.parameters
```

**Assertions**: column gone; enum classes gone; `archived_clause` collapses
to `is_archived.is_(archived)`; dataclass fields dropped; coercion signature
dropped.

#### 1.3 `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`

```python
"""RED: postgres-lane FK CASCADE + column drop assertions on the new migration."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_vendor_link_fks_cascade_after_upgrade(postgres_session) -> None:
    rows = await postgres_session.execute(text("""
        SELECT conname, confdeltype FROM pg_constraint
        WHERE conname IN (
            'fk_vendor_risk_links_vendor_id_vendors',
            'fk_vendor_risk_links_risk_id_risks',
            'fk_vendor_control_links_vendor_id_vendors',
            'fk_vendor_control_links_control_id_controls',
            'fk_vendor_kri_links_vendor_id_vendors',
            'fk_vendor_kri_links_kri_id_key_risk_indicators'
        )
    """))
    by_name = {r.conname: r.confdeltype for r in rows}
    assert len(by_name) == 6, f"missing constraints: {by_name}"
    for name, deltype in by_name.items():
        assert deltype == "c", f"{name} confdeltype={deltype!r}, expected 'c' (CASCADE)"


@pytest.mark.asyncio
async def test_vendors_status_column_absent_after_upgrade(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendors' AND column_name = 'status'
    """))
    assert row.first() is None, "vendors.status column must be dropped"


@pytest.mark.asyncio
async def test_ix_vendors_status_index_absent(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'vendors' AND indexname = 'ix_vendors_status'
    """))
    assert row.first() is None, "ix_vendors_status must be dropped with the column"
```

**Assertions**: 6 FK `confdeltype = 'c'` (CASCADE); `vendors.status` absent;
`ix_vendors_status` index absent.

#### 1.4 `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py`

```python
"""RED: ADR-010 forward-only contract on the new migration."""
import importlib
import inspect

import pytest

pytestmark = pytest.mark.contract


def test_downgrade_raises_not_implemented() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    with pytest.raises(NotImplementedError, match="Forward-only"):
        module.downgrade()


def test_revision_chain_points_at_prior_head() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    assert module.revision == "k6l7m8n9o0p1"
    assert module.down_revision == "j5k6l7m8n9o0"  # current head


def test_migration_source_cites_adr_010() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    source = inspect.getsource(module)
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
```

**Assertions**: `downgrade()` raises `NotImplementedError`; revision chain
points to `j5k6l7m8n9o0`; source cites ADR-010.

#### 1.5 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py`

```python
"""RED Phase 4: running upgrade() twice on Postgres must not corrupt state."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_upgrade_then_re_upgrade_is_safe(postgres_engine) -> None:
    """The migration must be idempotent: re-running upgrade() in a fresh
    session against a post-upgraded DB must either no-op or raise a clean,
    deterministic error WITHOUT half-applied state."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    async with postgres_engine.connect() as conn:
        baseline = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        baseline_count = baseline.scalar()

        try:
            await conn.run_sync(lambda sync_conn: upgrade())
        except Exception as exc:
            # Expected: index/column already absent. Must be a deterministic
            # ProgrammingError, not a partial-state corruption.
            assert "does not exist" in str(exc).lower() or "already" in str(exc).lower(), exc

        post = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        assert post.scalar() == baseline_count, "row count drift after re-upgrade"

        col = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='vendors' AND column_name='status'
        """))
        assert col.first() is None
```

**Assertions**: re-running upgrade is safe — either no-op or deterministic
ProgrammingError; row count unchanged; column stays absent.

#### 1.6 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py`

```python
"""RED Phase 4: concurrent INSERT into vendor_risk_links during a CASCADE
DELETE on vendors must NOT leave orphans and must not deadlock the migration."""
import asyncio

import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_cascade_serializes_with_concurrent_inserts(postgres_engine, seeded_vendor) -> None:
    """After upgrade, deleting a vendor under concurrent writes leaves no orphans."""
    vendor_id = seeded_vendor.id

    async def insert_link():
        async with postgres_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO vendor_risk_links (vendor_id, risk_id, created_at) "
                "VALUES (:v, (SELECT id FROM risks LIMIT 1), now())"
            ), {"v": vendor_id})

    async def cascade_delete():
        async with postgres_engine.begin() as conn:
            await conn.execute(text("DELETE FROM vendors WHERE id = :v"), {"v": vendor_id})

    await asyncio.gather(
        *(insert_link() for _ in range(5)),
        cascade_delete(),
        return_exceptions=True,
    )

    async with postgres_engine.connect() as conn:
        orphans = await conn.execute(text(
            "SELECT COUNT(*) FROM vendor_risk_links l "
            "LEFT JOIN vendors v ON v.id = l.vendor_id WHERE v.id IS NULL"
        ))
        assert orphans.scalar() == 0, "orphan vendor_risk_links rows after concurrent writes"
```

**Assertions**: 5 concurrent inserts vs 1 cascade delete leaves zero orphans.

#### 1.7 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py`

```python
"""RED Phase 4: before applying the migration, run an FK-orphan precheck."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_precheck_reports_orphans_before_migration(postgres_engine_pre_migration) -> None:
    """Hand-craft an orphan in a fixture DB at revision j5k6l7m8n9o0 (one
    rev before our new migration), then call the precheck helper exposed
    by the migration module; expect a ValueError with the orphan ids."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import (
        check_no_link_orphans,
    )

    async with postgres_engine_pre_migration.begin() as conn:
        # Insert orphan vendor_risk_link (vendor_id missing in vendors).
        await conn.execute(text(
            "INSERT INTO vendor_risk_links (id, vendor_id, risk_id, created_at) "
            "VALUES (-1, 99999, (SELECT id FROM risks LIMIT 1), now())"
        ))

    with pytest.raises(ValueError, match="orphan"):
        async with postgres_engine_pre_migration.connect() as conn:
            await conn.run_sync(lambda sync: check_no_link_orphans(sync))
```

**Assertions**: precheck raises deterministic `ValueError` listing offending
row ids when pre-existing FK orphans are present, instead of letting Postgres
fail mid-FK-rebuild with an opaque error.

#### 1.8 (Phase 4 NEW) `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py`

```python
"""RED Phase 4: if upgrade() fails partway, the transaction must roll back
to a fully PRE-upgrade state, not a half-migrated state."""
import pytest
from sqlalchemy import text
from unittest.mock import patch

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_failure_midway_rolls_back_to_pre_upgrade(postgres_engine_pre_migration) -> None:
    """Force a synthetic failure on the second op.create_foreign_key call.
    Assert that after rollback no constraint or column changes are visible."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    call_count = {"n": 0}

    def patched_create_fk(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("synthetic mid-upgrade failure")
        from alembic import op as real_op
        return real_op.create_foreign_key(*args, **kwargs)

    with patch("alembic.op.create_foreign_key", side_effect=patched_create_fk):
        async with postgres_engine_pre_migration.begin() as conn:
            with pytest.raises(RuntimeError, match="synthetic"):
                await conn.run_sync(lambda sync: upgrade())

    async with postgres_engine_pre_migration.connect() as conn:
        col = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='vendors' AND column_name='status'"
        ))
        assert col.first() is not None, "Partial failure left vendors.status dropped"

        delcode = await conn.execute(text(
            "SELECT confdeltype FROM pg_constraint "
            "WHERE conname='fk_vendor_risk_links_vendor_id_vendors'"
        ))
        row = delcode.first()
        assert row is not None, "FK was dropped without rebuild — partial state"
        assert row[0] != "c", "CASCADE applied despite mid-upgrade failure"
```

**Assertions**: synthetic mid-upgrade failure rolls back cleanly; column
stays present; original FK survives without CASCADE.

Run all 8 RED files; expect 4 fail on sqlite-only path (mixin / status drop
/ forward-only) and 4 skip if Postgres lane not provisioned. With Postgres
lane enabled, expect all 8 to fail/error.

### Step 2: Introduce `AbstractVendorLink` mixin

Path: `backend/app/models/_vendor_link_mixin.py` (NEW).

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class AbstractVendorLink:
    """Shared column shape for vendor link junction tables.

    Concrete subclasses keep their own ``__tablename__``, target FK column,
    and per-target unique constraint. The mixin enforces uniform shape on
    ``id``, ``vendor_id`` (with DB-level ``ON DELETE CASCADE``), and
    ``created_at`` so all three vendor-link tables stay in sync.

    Vendor-link tables are NOT archivable; this mixin is independent of
    ``ArchivableMixin``. See ADR-005 for the archivable column-shape contract.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def vendor_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("vendors.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
```

After this file lands and only `_vendor_link_mixin.py` is added (no DB
migration), §1.1's abstract-marker test is partly green; subclass tests
remain red until Step 3.

### Step 3: Rebase 3 link models

#### `backend/app/models/vendor_risk_link.py` (overwrite)

```python
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.vendor import Vendor


class VendorRiskLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_risk_links"
    __table_args__ = (UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="vendor_links")
```

#### `backend/app/models/vendor_control_link.py` (overwrite)

Same pattern, swap `risk_id` / `Risk` / `risks` / `uq_vendor_risk_link` for
`control_id` / `Control` / `controls` / `uq_vendor_control_link`.

#### `backend/app/models/vendor_kri_link.py` (overwrite)

Same pattern, swap to `kri_id` / `KeyRiskIndicator` / `key_risk_indicators` /
`uq_vendor_kri_link`. Note: kri-links already had `ondelete="CASCADE"` on
both FKs; the mixin formalises `vendor_id` cascade.

After Step 3, §1.1 fully green on sqlite ORM-metadata lane.

### Step 4: Generate Alembic migration

Path: `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` (NEW).

```python
"""Unify vendor link cascade and drop Vendor.status.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-09

Forward-only per ADR-010. Bundled changes:
  * Add ON DELETE CASCADE to vendor_risk_links FKs (vendor_id, risk_id).
  * Add ON DELETE CASCADE to vendor_control_links FKs (vendor_id, control_id).
  * Drop ix_vendors_status index.
  * Drop vendors.status column (single-value enum 'active' after unify cutover).

vendor_kri_links FKs already carry ON DELETE CASCADE per
``v2w3x4y5z6a_add_vendor_kri_links.py:28-29`` and are intentionally untouched.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def check_no_link_orphans(connection) -> None:
    """Phase-4 precheck: refuse to apply if FK-orphan link rows exist.

    Surfaces a deterministic ValueError listing offending row ids instead
    of letting Postgres fail mid-FK-rebuild with an opaque error.
    """
    for table, fk_col, ref_table in (
        ("vendor_risk_links", "vendor_id", "vendors"),
        ("vendor_risk_links", "risk_id", "risks"),
        ("vendor_control_links", "vendor_id", "vendors"),
        ("vendor_control_links", "control_id", "controls"),
    ):
        rows = connection.execute(text(
            f"SELECT id FROM {table} l "
            f"WHERE NOT EXISTS (SELECT 1 FROM {ref_table} r WHERE r.id = l.{fk_col})"
        )).all()
        if rows:
            ids = [r[0] for r in rows]
            raise ValueError(f"orphan {table}.{fk_col} rows: {ids}")


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
        with op.batch_alter_table("vendors") as batch:
            batch.drop_column("status")
        return

    bind = op.get_bind()
    check_no_link_orphans(bind)

    op.drop_constraint(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", "risks",
        ["risk_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_constraint(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", "controls",
        ["control_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
    op.drop_column("vendors", "status")


def downgrade() -> None:
    """Forward-only per ADR-010; restore from a pre-upgrade snapshot."""
    raise NotImplementedError(
        "Forward-only migration. Restore from snapshot per ADR-010."
    )
```

#### Postgres-lane test plan (Step 4 GREEN sequence)

Bring up Postgres lane (Phase 6 fix #2):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
# Optionally also TEST_DATABASE_URL_PRE_MIGRATION pointing at a DB at revision j5k6l7m8n9o0
alembic upgrade head
TEST_DATABASE_URL="$TEST_DATABASE_URL" pytest -m postgres tests/backend/pytest/migrations/
```

Specific test invocations:

```bash
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py
TEST_DATABASE_URL="..." pytest tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py
TEST_DATABASE_URL="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py
TEST_DATABASE_URL_PRE_MIGRATION="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py
TEST_DATABASE_URL_PRE_MIGRATION="..." pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py
```

Pre-upgrade row-count capture (snapshot/restore — see Snapshot/Restore
Procedure below):

```sql
SELECT COUNT(*) FROM vendors;                  -- N0
SELECT COUNT(*) FROM vendor_risk_links;        -- L0
SELECT COUNT(*) FROM vendor_control_links;     -- L1
SELECT COUNT(*) FROM vendor_kri_links;         -- L2
```

Post-upgrade verification:
- All 6 FKs `confdeltype = 'c'`.
- `vendors.status` absent.
- `ix_vendors_status` absent.
- N0 / L0 / L1 / L2 unchanged.

### Step 5: Drop status surface (8 prod sites + 1 seed write + 6 seed dicts)

#### `backend/app/models/vendor.py` edits

- `:22-23` — DELETE `class VendorStatus(str, PyEnum):\n    active = "active"`.
- `:82` — DELETE `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `:5` — KEEP `from enum import Enum as PyEnum` (still used by `VendorType`
  L26 and `VendorReplaceability` L34).
- `:89-103` — KEEP three relationship declarations with
  `cascade="all, delete-orphan"`. The DB-level cascade (Step 4) is
  defense-in-depth + supports raw SQL `DELETE`. They are complementary, not
  redundant.

#### `backend/app/models/__init__.py` edits

- Drop `VendorStatus` from import line (line ~34).
- Drop `"VendorStatus"` from `__all__` (line ~80).

#### `backend/app/schemas/vendor.py` edits

- `:12-13` — DELETE `class VendorStatusEnum(str, Enum):\n    active = "active"`.
- `:53` — DELETE `status: VendorStatusEnum = VendorStatusEnum.active` from `VendorBase`.
- `:83` — DELETE `status: VendorStatusEnum | None = None` from `VendorUpdate`.
- `:4` — KEEP `from enum import Enum` (still used by `VendorTypeEnum`,
  `VendorReplaceabilityEnum`).

#### `backend/app/schemas/__init__.py` edits

- `:115` — drop `VendorStatusEnum,` from imports.
- `:212` — drop `"VendorStatusEnum"` from `__all__`.

#### 8 prod sites

- `backend/app/services/_register_listings/vendors.py`:
  - `:15` — drop `VendorStatusEnum` from the import line.
  - `:53-54` — drop `status_filter: VendorStatusEnum | None` and `archived_status_filter: bool` from the `VendorListCriteria` dataclass.
  - `:89` — drop `status_filter` parameter from `coerce_vendor_list_criteria`.
  - `:103` — drop `status_filter_value` line.
  - `:108` — drop `"status": status_filter_value` from `filter_values` defaults.
  - `:121-124` — drop `status_value` and `archived_status_filter` calculation.
  - `:129-132` — drop `status_filter=...` and `archived_status_filter=...` from the `VendorListCriteria(...)` constructor.
  - `:158-162` — drop `if criteria.archived_status_filter:` and `elif criteria.status_filter is not None:` branches in `apply_vendor_list_filters`. Keep `elif not criteria.include_archived:` (becomes `if not criteria.include_archived:`).
  - `:200` — drop `"status": Vendor.status,` from sort columns map.
  - `:273` — drop `Vendor.status.label("status"),` from `vendor_flag_membership_query` projection.
  - `:482` — drop `status_filter` parameter from `list_vendor_governance`.
  - `:501` — drop `status_filter=status_filter,` argument on the `coerce_vendor_list_criteria` call.

- `backend/app/services/_register_listings/controls.py:554` — DELETE `status=link.vendor.status,`.
- `backend/app/services/_register_listings/risks.py:430` — DELETE `status=vendor.status,`.
- `backend/app/services/_monitoring_response.py:219` — DELETE `status=vendor.status,`.
- `backend/app/services/_reporting/exports/rows.py:120` — DELETE `"status": vendor.status,`.
- `backend/app/services/_kri_history/direct_application.py:36` — DELETE `status=link.vendor.status,`.

#### Seed scripts

- `backend/scripts/seed_e2e_vendors.py`:
  - `:13` — drop `VendorStatus` from import.
  - `:35,56,77,98,119,140` — DELETE 6 `"status": VendorStatus.active.value,` keys.

- `backend/scripts/seed_e2e_archives.py:283` — replace
  `vendor.status = entry["status"]` with
  `vendor.is_archived = bool(entry.get("is_archived", False))`.

#### Test fixture deletions

- `tests/backend/pytest/test_vendors.py:436` — DELETE `assert vendor.status == "active"`.
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37` —
  DELETE `VendorStatusEnum` import + `status=VendorStatusEnum.active.value` fixture line.
- `tests/backend/pytest/test_dashboard.py:960,970,980` — DELETE
  `VendorStatus.active.value` fixture lines.

### Step 6: Lock collapse

`backend/app/models/_archivable.py:60-65` — change:

```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
    "vendors": ("inactive",),
}.get(getattr(model, "__tablename__", ""))
```

to:

```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
}.get(getattr(model, "__tablename__", ""))
```

The early-return at L67 fires when `legacy_values is None`, so
`archived_clause(Vendor)` collapses to `Vendor.is_archived.is_(archived)`.

Run architecture locks:

```bash
make -f scripts/Makefile test-architecture-locks
```

### Step 7: Doc updates (7 files)

1. **`backend/app/models/README.md`** — add `AbstractVendorLink` to mixin
   inventory section; cross-link `_archivable.py`. ~3-line bullet describing
   shared shape, `__abstract__ = True`, vendor-link tables NOT archivable.

2. **`backend/app/services/_vendor_links/README.md`** — replace any line
   claiming cascade is "ORM-level only" with "DB-level via `ON DELETE CASCADE`
   on `vendor_id` and the target FK".

3. **`docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`** — add
   paragraph noting `Vendor.status` was dropped in revision `k6l7m8n9o0p1`;
   the legacy `("inactive",)` alias is retired; vendors archive solely via
   `is_archived`. Risks and controls retain their `("archived",)` alias.

4. **`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`** —
   append bullet under "Migration Impact":

   > `vendors.status` column dropped (single-value enum `'active'` after
   > unify cutover); `vendor_risk_links` and `vendor_control_links` FKs
   > rebuilt with `ON DELETE CASCADE` to match `vendor_kri_links` semantics.
   > Bundled in revision `k6l7m8n9o0p1`.

   Append row-count target: pre-upgrade snapshot must capture
   `SELECT COUNT(*) FROM vendors` and `SELECT COUNT(*) FROM vendor_risk_links`
   (and the two siblings) for post-upgrade reconciliation.

5. **`docs/README.md:111-112`** — strike any sentence mentioning `Vendor.status`.

6. **`docs/DOCUMENTATION_TREE.md:84`** — strike `vendor.status` reference.

7. **`docs/BUSINESS_LOGIC.md:619`** — replace `Vendor.status` reference with
   note that vendor lifecycle is managed exclusively through `is_archived`
   per ADR-005.

### Step 8: Final gates

```bash
make -f scripts/Makefile test-architecture-locks
TEST_DATABASE_URL="postgresql+asyncpg://..." make -f scripts/Makefile test-postgres-ci
pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py \
       tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py \
       tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py \
       tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py \
       tests/backend/pytest/test_e2e_seed_archive_state_red.py
ruff check backend tests
mypy backend/app
python scripts/security/validate_authz_capability_contract.py
```

### Step 9: Single bundled commit

**Title**: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`

**Body**: see "Step 9 — Single bundled commit" in Item #17 above.

Bundled because:
1. Both axes touch `vendor*` schema in one Alembic revision.
2. Both share ADR-010 forward-only entry.
3. Both share rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
4. Single migration window minimises operational risk.

Allow split into 2 commits if diff > 400 lines OR `mypy` cannot type-check
the intermediate state cleanly. See Item #17 for the C1/C2 split.

### Snapshot/Restore Procedure

Pre-merge (in staging):

```bash
# 1. Capture snapshot.
pg_dump --format=custom --jobs=4 \
  --file=pre_k6l7m8n9o0p1_$(date +%Y%m%d-%H%M).dump $STAGING_DB

# 2. Capture row counts (checked into
#    .planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt).
psql $STAGING_DB -c "SELECT 'vendors' AS t, COUNT(*) FROM vendors
                     UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
                     UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
                     UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;"

# 3. Run migration on staging clone.
alembic upgrade head

# 4. Verify post-state.
TEST_DATABASE_URL="$STAGING_DB" pytest -m postgres tests/backend/pytest/migrations/

# 5. Verify row counts unchanged (re-run query above; assert same).
```

**Validate restore-ability of the snapshot** before committing:

```bash
pg_restore --list pre_k6l7m8n9o0p1_<timestamp>.dump | head
# ensure non-empty toc; record line count
```

Production cutover (operational rollback):

```bash
# If post-deploy issue surfaces:
# 1. Stop application traffic.
# 2. Restore snapshot.
pg_restore --clean --no-owner --jobs=4 \
  --dbname=$PROD_DB pre_k6l7m8n9o0p1_<timestamp>.dump

# 3. Redeploy prior backend version.
# 4. Invalidate frontend bundle caches (CDN purge).
```

`downgrade()` is **never** called; it raises `NotImplementedError`.
Forward-only per ADR-010.

### Postgres-Lane Test Plan (consolidated for #69+#70)

| Test | Path | Phase | Markers |
|------|------|-------|---------|
| 1 | `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` | base | `[contract, postgres]` |
| 2 | `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` | base | `[contract]` (no DB) |
| 3 | `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 4 | `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 5 | `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 6 | `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py` | Phase 4 NEW | `[contract, postgres]` |
| 7 | `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` | base | `[contract]` |
| 8 | `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` | base | `[contract]` |

**Postgres-lane invocation** (Phase 6 fix #2 — `make postgres-up` does NOT
exist):

```bash
export TEST_DATABASE_URL="postgresql+asyncpg://localhost:5432/riskhub_test"
make -f scripts/Makefile test-postgres-ci
# Or directly:
TEST_DATABASE_URL="..." pytest -m "contract and postgres" tests/backend/pytest/migrations/
```

**Sqlite-lane (architecture-only)**:

```bash
pytest -m "contract and not postgres" tests/backend/pytest/architecture/test_vendor_link_mixin_red.py \
       tests/backend/pytest/architecture/test_vendor_status_drop_red.py \
       tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
```

---

End of Section 5 — Per-Item Recipes Part 3 (Waves 6-8) + Migration Window Detail — final, Phase 6 corrections applied.


