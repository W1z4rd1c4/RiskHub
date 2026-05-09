# Phase 5 Loop 1 — Per-item TDD recipes — Issues + #43 (audit adapter helper)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit ref: `1ee872a4`.

Domain scope (10 items):

| # | ID | Title | v2 Seq | Wave | Effort | Priority |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| 14 | S4.4 | Issues outbox-only notification cleanup | 12 | 2 | M | P1 |
| 2 | B-N1 | Drop 4 underscore aliases in `_issue_workflow/source_validation.py` | 14 | 3 | S | P2 |
| 41 | B-N3 | Drop bidirectional underscore aliases in `_issue_workflow/serialization.py` | 20 | 3 | S | P2 |
| 53 | S4.1 | Drop `IssueWorkflowService` facade | 23 | 3 | S | P2 |
| 29 | S4.6 | Source-type vocabulary canonicalization | 31 | 4 | S | P2 |
| 27 | S4.2 | Issue-loading duplicate deletion | 51 | 5 | M | P2 |
| 8 | B-N2 | Source-validation split + canonical link helpers consolidation | 52 | 5 | M | P2 |
| 28 | S4.3 | Issue source-mutation triplicate collapse | 53 | 5 | M | P2 |
| 30 | S4.10 | `issues/_shared/__init__.py` underscore re-export pruning | 54 | 5 | M | P2 |
| 43 | BE-N4 | Audit adapter-emitter helper (additive) | 59 | 6 | M | P3 |

Domain dependency chain (per `plan-loop-1-01-issues.md:441-449`):

```
#2 ─┐
    ├──► #8 ──► #28 ──► #30
#41 ┘                    ▲
#14 ─────────────────────┤
#27 ─────────────────────┘
#53 (independent)
#29 (independent)
#43 (independent, cross-domain)
```

Phase 4 corrections applied (per `review-loop-2-01-test-gaps-adversarial.md`):
- All NEW architecture-tier test files declare `pytestmark = pytest.mark.contract` at module scope.
- `#30` count: 36 entries / 13 public / 23 underscored = 14 prunable + 9 to re-point.
- `#43` adapter rows: 37 (verified `_audit_matrix.toml` row count).
- `_notify_*` test imports are submodule-direct (`from ...notifications import ...`), NOT through the barrel — `#14` deletes the underlying functions and rewrites the test, `#30` does not depend on it for prune.

Common patterns (apply throughout):
- Architecture tests live under `tests/backend/pytest/architecture/` and end in `_red.py`.
- Backend integration tests use `client_factory` from `tests/backend/pytest/conftest.py` (per CLAUDE.md).
- Each test author MUST `pytestmark = pytest.mark.contract` for new architecture tests.
- All recipes assume a single sequential developer, TDD red→green, single-commit per item except where noted (#8 is a 2-commit boundary).

---

## Item #2 — B-N1 — Delete 4 underscore aliases in `_issue_workflow/source_validation.py`

### Status & Sequencing
- Master sequence slot: **v2 Seq 14** (per `plan-loop-3-07-integration-v2.md:357`).
- Wave: **3 (P2 dead-code A)**.
- Effort: **S** (4h).
- Priority: **P2**.
- Dependencies (must be complete first): none.
- Atomic with: none. Soft pair-with: #41 (same anti-pattern, different file).

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 14.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py`.
- [ ] No concurrent feature-work conflicts (`git status` clean before edit).
- [ ] Confirm the four alias literals at `:117-120` are still present.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_VALIDATION = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"


def test_no_underscored_self_aliases_in_source_validation() -> None:
    text = SOURCE_VALIDATION.read_text()
    for forbidden in (
        "_ensure_owner_assignable = ensure_owner_assignable",
        "_issue_link_department_ids = issue_link_department_ids",
        "_resolve_vendor_department_and_access = resolve_vendor_department_and_access",
        "_validate_user_exists = validate_user_exists",
    ):
        assert forbidden not in text, f"{forbidden!r} must be removed"
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q`. Confirm 1 failure (each forbidden literal currently appears at lines 117-120).

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/services/_issue_workflow/source_validation.py:117-120` — delete the four alias assignment lines:
  ```
  _ensure_owner_assignable = ensure_owner_assignable
  _issue_link_department_ids = issue_link_department_ids
  _resolve_vendor_department_and_access = resolve_vendor_department_and_access
  _validate_user_exists = validate_user_exists
  ```
  After edit, `__all__` (lines `:122-130`) is unchanged (it never listed the underscored names).

**Files to create**: none (the new RED test file is the only added artifact).

**Files to delete**: none.

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` — must pass.

### Lock/TOML/Contract Updates (same commit)
- The new architecture-lock test (created in Step 1) IS the lock — keep it.
- No TOML allowlist edits required (verified: no entry in `_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, or `_endpoint_commit_allowlist.toml` mentions `source_validation.py`).
- Capability contract: NO change (no citation of the alias names).

### README/Doc Updates (same commit)
- `backend/app/services/_issue_workflow/README.md` — no edit required (Contents lists modules only).

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 -m pyflakes backend/app/services/_issue_workflow/source_validation.py` — no warnings (catches now-dead exports).
5. `ruff check backend/app/services/_issue_workflow/source_validation.py` — clean.
6. `mypy backend/app/services/_issue_workflow/source_validation.py` — clean.

### Commit Boundary
- Single commit.
- Title: `B-N1: drop dead underscore aliases in _issue_workflow/source_validation`
- Body: "These four alias bindings (`_ensure_owner_assignable`, `_issue_link_department_ids`, `_resolve_vendor_department_and_access`, `_validate_user_exists` at `:117-120`) had no production callers (Loop B verified). The new architecture lock at `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py` pins their absence."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:38`).
- Procedure:
  1. `git revert <SHA>`.
  2. Verify the four underscore aliases re-appear at `_issue_workflow/source_validation.py:117-120`.
  3. The new lock test is reverted in the same revert (no extra step).
  4. Run `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` and `make -f scripts/Makefile test-architecture-locks`.
- Estimated revert time: 10 min.

### Effort & Risk Notes
- Estimated time: 1.5h (test + edit + verification).
- Risk: very low (LOW likelihood × LOW impact). Loop B confirmed zero callers.
- Mitigations applied: structural assertion catches re-introduction; no callers to break.

---

## Item #8 — B-N2 — Source-validation split + canonical link helpers consolidation

### Status & Sequencing
- Master sequence slot: **v2 Seq 52** (per `plan-loop-3-07-integration-v2.md:395`).
- Wave: **5 (P2 chains)**.
- Effort: **M** (8h).
- Priority: **P2**.
- Dependencies (must be complete first): **#2 (Seq 14)**.
- Atomic with: none. Sequential prerequisite for #28.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 52.
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` (must pass — proves #2 landed).
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py`, `backend/app/services/_issue_workflow/assignment.py`, `backend/app/services/_issue_register/source_mutation.py`, `backend/app/api/v1/endpoints/issues/_shared/validation.py`, `backend/app/api/v1/endpoints/issues/_shared/links.py`.
- [ ] No concurrent feature-work conflicts.
- [ ] Confirm `_issue_workflow/assignment.py` exists and does NOT yet expose `validate_user_exists` / `ensure_owner_assignable`.

### TDD Step 1 — Write Failing Test (RED)
**File**: append to `tests/backend/pytest/test_architecture_deepening_contracts.py` (existing file already has `pytestmark = pytest.mark.contract` at module scope per Loop 1 plan `:54`).

**Test content** (append at end of file):
```python
def test_issue_workflow_owner_validation_lives_in_dedicated_module() -> None:
    from app.services._issue_workflow import assignment

    source = _source("backend/app/services/_issue_workflow/source_validation.py")
    assert "async def validate_user_exists" not in source
    assert "async def ensure_owner_assignable" not in source

    assert hasattr(assignment, "validate_user_exists")
    assert hasattr(assignment, "ensure_owner_assignable")
```

Add behavior pin in `tests/backend/pytest/api/v1/test_issue_workflow.py` (use `client_factory` for HTTP sweep). Verify existing 400 (`User {id} not found`), 403 (department mismatch), 409 (archived vendor) cases still pass after the move — the `tests/backend/pytest/api/v1/test_issue_workflow.py` and `test_issues_crud_api.py` already cover these. Add no new test cases unless coverage gap surfaces during code review.

**Expected**: RED. Run `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q`. Confirm failure.

### TDD Step 2 — Implement Change
**Commit (a)**: move owner-validation into `assignment.py`, repoint workflow callers, repoint endpoint validation.

**Files to edit**:
- `backend/app/services/_issue_workflow/assignment.py` — append two public coroutines `validate_user_exists` and `ensure_owner_assignable`. Bodies are byte-identical to current `source_validation.py:16-21,24-42`. Preserve imports.
- `backend/app/services/_issue_workflow/source_validation.py:16-21,24-42` — delete the bodies of `validate_user_exists` and `ensure_owner_assignable`. Update `__all__` at `:122-130` — remove the names.
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change `from app.services._issue_workflow.source_validation import (validate_user_exists, ensure_owner_assignable, ...)` to import these two names from `app.services._issue_workflow.assignment`. Keep the other names in source_validation until #28 lands.
- `backend/app/services/_issue_workflow/execution.py:41-47` — same repoint for `validate_user_exists` and `ensure_owner_assignable`. Other names (`clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata`) stay until #28.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py:11-37` — replace local `_validate_user_exists` and `_ensure_owner_assignable` bodies with thin re-imports:
  ```
  from app.services._issue_workflow.assignment import (
      ensure_owner_assignable as _public_ensure_owner_assignable,
      validate_user_exists as _public_validate_user_exists,
  )

  _validate_user_exists = _public_validate_user_exists
  _ensure_owner_assignable = _public_ensure_owner_assignable
  ```
  Final removal of these underscored bindings happens in #30.

**Files to create**: none. `assignment.py` already exists.

**Files to delete**: none in commit (a).

**Commit (b)**: shrink/delete `source_validation.py` link/vendor bodies.

**Files to edit (commit b)**:
- `backend/app/services/_issue_workflow/source_validation.py:45-114` — delete `issue_link_department_ids` and `resolve_vendor_department_and_access` bodies. Update `__all__` to drop these names. The file becomes a thin re-export shim of `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata` from `_issue_register.source_mutation`. **Recommended end-state: `git rm backend/app/services/_issue_workflow/source_validation.py`** if both `update_plans.py` and `execution.py` no longer import from it (they will not after #28 repoints them).
- `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80` — keep until #28 (commit b deletes only the workflow-side bodies).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1193` — update the import tuple if `source_validation` is removed (commit b only): `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization` (drop `source_validation`).

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` — must pass after commit (a).

### Lock/TOML/Contract Updates (same commit)
- New architecture-lock assertion (Step 1) — keep.
- `docs/security/authorization-capability-contract.md:128` and `.json:629` — append `backend/app/services/_issue_workflow/assignment.py` to the `service_policy` enumeration (between `_shared/source.py` and `_issue_register/`). Atomic edit in commit (a).
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/services/_issue_workflow/README.md:11` — add `assignment.py - owner-assignment validation (user existence, owner-to-department eligibility)` to Contents (commit a).
- If commit (b) deletes `source_validation.py`, update the README to remove the file reference (no current line lists it; verify before commit).

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 (validates new `assignment.py` citation).
5. `ruff check backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.
6. `mypy backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.

### Commit Boundary
- **2 atomic commits** (per Loop 1 plan `:111-114`).
- Commit (a) title: `B-N2(a): move owner-validation helpers to _issue_workflow/assignment`
  Body: "Promotes `validate_user_exists` and `ensure_owner_assignable` from `_issue_workflow/source_validation.py` to `_issue_workflow/assignment.py`. Repoints `update_plans`, `execution`, and endpoint `_shared/validation.py` re-imports. Updates capability contract `service_policy` row to cite the new home. Lock test pins absence."
- Commit (b) title: `B-N2(b): shrink _issue_workflow/source_validation to source_mutation re-export`
  Body: "Deletes link/vendor body in `_issue_workflow/source_validation.py:45-114`; canonical bodies live in `_issue_register/source_mutation.py`. If end-state is empty, `git rm` the file and update the deepening-contract import tuple at `:1193`."

### Rollback
- Class: **CROSS-DOMAIN** (per `plan-loop-3-03-rollback-register.md:97`).
- Procedure:
  1. **Revert commit (b) FIRST, then commit (a)** if both are merged.
  2. `git revert <commit-b-SHA>` then `git revert <commit-a-SHA>`.
  3. Restore `:1193` import line in `test_architecture_deepening_contracts.py` (re-add `source_validation`).
  4. Drop the new `test_issue_workflow_owner_validation_lives_in_dedicated_module` assertion.
  5. If #28 / #30 already landed downstream, **defer revert until those are also reverted** (per chain `#2 → #8 → #28 → #30`).
- Estimated revert time: 30 min (60 min if #28/#30 landed).

### Effort & Risk Notes
- Estimated time: 6h (test + 2 commits' implementation + verification).
- Risk: MEDIUM — chain head; partial commit leaves stale imports. Loop 3 risk register flags this as part of the critical-path stall risk (`plan-loop-3-04-risk-register.md:542-554`).
- Mitigations applied: 2-commit boundary so each step lands GREEN; tests cover all owner-assignment HTTP paths; capability contract updated atomically with code.

---

## Item #14 — S4.4 — Issues outbox-only notification cleanup

### Status & Sequencing
- Master sequence slot: **v2 Seq 12** (per `plan-loop-3-07-integration-v2.md:355`).
- Wave: **2 (P1 quick wins)**.
- Effort: **M** (8h).
- Priority: **P1**.
- Dependencies (must be complete first): none.
- Atomic with: none. Strict prerequisite for #30 (gates underscore prune).

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 12.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/notifications.py`, `tests/backend/pytest/api/v1/test_issue_workflow.py`, `backend/app/services/outbox/handlers/issues.py`.
- [ ] No concurrent feature-work conflicts.
- [ ] Confirm three direct-send helpers still exist at `_shared/notifications.py:24,43,80`.
- [ ] Confirm test imports go through SUBMODULE: `tests/backend/pytest/api/v1/test_issue_workflow.py:10` reads `from app.api.v1.endpoints.issues._shared.notifications import ...` (NOT through the barrel — Loop B verified).

### TDD Step 1 — Write Failing Test (RED)

**File 1 (new)**: `tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
NOTIFICATIONS = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/notifications.py"
SHARED_INIT = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/__init__.py"


def test_direct_send_helpers_removed_from_notifications_module() -> None:
    from app.api.v1.endpoints.issues._shared import notifications

    assert not hasattr(notifications, "_notify_issue_assigned")
    assert not hasattr(notifications, "_notify_exception_requested")
    assert not hasattr(notifications, "_notify_exception_approved")


def test_barrel_no_longer_re_exports_notify_helpers() -> None:
    text = SHARED_INIT.read_text()
    for forbidden in (
        "_notify_issue_assigned",
        "_notify_exception_requested",
        "_notify_exception_approved",
    ):
        assert forbidden not in text, f"{forbidden!r} must not appear in barrel after #14"
```

**File 2 (rewrite)**: `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679-708` — replace direct-send helper calls with outbox-enqueue assertions. Use `client_factory` to drive the workflow endpoint, then assert an `OutboxEvent` row exists with the expected `event_type`. Sketch:
```python
# replace lines 10 (import) and 679-691 (helper calls)
from app.models import OutboxEvent  # if not already imported

# inside the rewritten test block:
async with client_factory() as client:
    response = await client.post(
        f"/api/v1/issues/{assigned_issue_id}/assign",
        json={"owner_user_id": recipient_id, "due_at": "2026-12-31T00:00:00Z"},
        headers=auth_headers(actor),
    )
    assert response.status_code == 200

events = (await db_session.execute(select(OutboxEvent).where(
    OutboxEvent.event_type == "issue.assigned",
    OutboxEvent.aggregate_id == assigned_issue_id,
))).scalars().all()
assert len(events) == 1
assert events[0].idempotency_key
```
Repeat for `issue.exception_approved` event_type and the `exception_issue_id`.

**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py tests/backend/pytest/api/v1/test_issue_workflow.py -q` — both should fail.

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/api/v1/endpoints/issues/_shared/notifications.py:24-103` — delete `_notify_issue_assigned` (`:24-40`), `_notify_exception_requested` (`:43-77`), `_notify_exception_approved` (`:80-103`). Decide on `_get_active_user_with_permissions` (`:14-21`): KEEP if any retained code still calls it; otherwise delete. Loop B verified no production importer outside this file once the three helpers are gone — if the file becomes empty, `git rm`. Recommended end-state: file deleted (no helpers remain).
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:12-17,62-64` — drop the three `_notify_*` imports and their `__all__` entries. Drop `_get_active_user_with_permissions` from `:13,53` if it was deleted from `notifications.py`.
- `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679-708` — finalize the rewrite (the outbox assertion test).

**Files to create**: the new architecture test file from Step 1.

**Files to delete**: optionally `backend/app/api/v1/endpoints/issues/_shared/notifications.py` if all functions were removed.

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py tests/backend/pytest/api/v1/test_issue_workflow.py -q`. Both pass.

### Lock/TOML/Contract Updates (same commit)
- New architecture-lock test (Step 1) — keep.
- No capability-contract change (helpers not cited in `service_policy`).
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md:14` — strike `notifications.py` from Contents list IF the file is deleted.

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py -q` — must pass.
3. `pytest tests/backend/pytest -q -k "outbox and issue"` — outbox handler integration green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/issues/_shared` — clean.
6. `mypy backend/app/api/v1/endpoints/issues/_shared` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.4: drop direct-send issue notifications; outbox is the single transport`
- Body: "Deletes `_notify_issue_assigned`, `_notify_exception_requested`, `_notify_exception_approved` from `_shared/notifications.py`. Production never called these (Loop B grep verified zero importers outside the test). Test rewrite asserts outbox enqueue. New architecture lock pins helper absence."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:165`).
- Procedure:
  1. `git revert <SHA>` to restore the three notification helpers.
  2. Drop `test_issue_notifications_have_no_direct_send_helpers_red.py`.
  3. Re-run `pytest tests/backend/pytest/test_issue_workflow_*` — confirm `test_issue_workflow_routes_use_lifecycle_module:1189` (`assert "OutboxService.enqueue" not in route_source`) still passes.
- Coordination: chains into #30. If #30 landed, sequence revert as `#30 → #14`.
- Estimated revert time: 20 min.

### Effort & Risk Notes
- Estimated time: 5h (test rewrite is the bulk; helper deletion is mechanical).
- Risk: LOW — production already uses outbox path; helpers are dead.
- Mitigations applied: outbox enqueue test rewritten in same commit; architecture lock prevents re-introduction.

---

## Item #27 — S4.2 — Issue-loading duplicate deletion

### Status & Sequencing
- Master sequence slot: **v2 Seq 51** (per `plan-loop-3-07-integration-v2.md:394`).
- Wave: **5 (P2 chains)**.
- Effort: **M** (8h).
- Priority: **P2**.
- Dependencies (must be complete first): none.
- Atomic with: none. Strict prerequisite for #30.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 51.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/loading.py`, `backend/app/services/_issue_workflow/loading.py`, and the four endpoint consumers (`crud/contextual.py`, `crud/create.py`, `crud/detail.py`, `links.py`).
- [ ] No concurrent feature-work conflicts.
- [ ] Confirm endpoint `_shared/loading.py:22-65` is byte-identical to `services/_issue_workflow/loading.py` (Loop B verified) — if they have diverged, escalate before proceeding.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LOADING = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/loading.py"


def test_endpoint_issues_loading_is_deleted_or_thin() -> None:
    if not ENDPOINT_LOADING.exists():
        return
    text = ENDPOINT_LOADING.read_text()
    # The selectinload SQL fragment is the byte-identical duplicate body.
    assert "selectinload(Issue.links).selectinload(IssueLink.risk)" not in text
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q` — fails because `_shared/loading.py:29` literally contains the fragment.

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:20,95` — replace `_get_issue_with_relations` import with `from app.services._issue_workflow.loading import get_issue_with_relations`; rename call site `_get_issue_with_relations(...)` → `get_issue_with_relations(...)`.
- `backend/app/api/v1/endpoints/issues/crud/create.py:21,107` — same pattern.
- `backend/app/api/v1/endpoints/issues/crud/detail.py:10,21` — replace `_get_readable_issue_or_404` with `from app.services._issue_workflow.loading import get_readable_issue_or_404`; rename call site.
- `backend/app/api/v1/endpoints/issues/links.py:14,80,128` — replace `_get_writable_issue_or_404` with `from app.services._issue_workflow.loading import get_writable_issue_or_404`; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:11,54-56` — drop the three `_get_*` imports and their `__all__` entries (this overlaps with #30; the in-scope edit here is purely the import drop).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` — entire file (`:1-65`).

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206` already asserts `loading.get_issue_with_relations`, `loading.get_writable_issue_or_404` exist on the SERVICE module — confirm still GREEN after delete.
- Add the new structural lock from Step 1.
- No TOML allowlist edits (no entry references `_shared/loading.py`).
- No capability-contract change (file not cited).

### README/Doc Updates (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md:13` — strike `loading.py` from Contents list.

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"` — locks green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.2: delete endpoint issues/_shared/loading.py; service loader is canonical`
- Body: "The endpoint loader was a byte-identical underscored copy of `_issue_workflow/loading.py`. Repoints 4 endpoint files (`crud/{contextual,create,detail}.py`, `links.py`) to the service module. Drops three `_get_*` re-exports from the barrel. New architecture lock pins file absence/thinness."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:317`).
- Procedure:
  1. `git revert <SHA>` to restore the duplicate loader.
  2. Drop `test_endpoint_issues_loading_is_thin_or_deleted_red.py`.
  3. Restore line 13 in `backend/app/api/v1/endpoints/issues/_shared/README.md`.
- Coordination: chain into #30. If #30 landed, revert sequence is `#30 → #28 → #27`.
- Estimated revert time: 25 min.

### Effort & Risk Notes
- Estimated time: 5h (4 endpoint files repointed + 1 file deleted + barrel + README + lock).
- Risk: LOW — service loader is the canonical body; underscore copy was dead duplication.
- Mitigations applied: existing deepening lock at `:1192-1206` already asserts service-side presence; new lock pins endpoint-side absence.

---

## Item #28 — S4.3 — Issue source-mutation triplicate collapse

### Status & Sequencing
- Master sequence slot: **v2 Seq 53** (per `plan-loop-3-07-integration-v2.md:396`).
- Wave: **5 (P2 chains)**.
- Effort: **M** (8h).
- Priority: **P2**.
- Dependencies (must be complete first): **#8 (Seq 52)**.
- Atomic with: none. Strict prerequisite for #30.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 53.
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` (#8 lock test must pass).
- [ ] Read latest state of `backend/app/services/_issue_register/source_mutation.py`, `backend/app/services/_issue_workflow/source_validation.py` (after #8), `backend/app/services/_issue_workflow/update_plans.py`, `backend/app/api/v1/endpoints/issues/_shared/links.py`, `backend/app/api/v1/endpoints/issues/links.py`.
- [ ] Confirm canonical bodies in `_issue_register/source_mutation.py:28-53` (`resolve_vendor_department_and_access`) and `:56-97` (`issue_link_department_ids`) are intact.
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINT_LINKS = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/links.py"
WORKFLOW_SOURCE = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"
REGISTER_MUTATION = REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py"


def test_endpoint_links_no_longer_owns_helper_bodies() -> None:
    if not ENDPOINT_LINKS.exists():
        return
    text = ENDPOINT_LINKS.read_text()
    assert "async def _resolve_vendor_department_and_access" not in text
    assert "async def _issue_link_department_ids" not in text


def test_workflow_source_validation_no_longer_owns_helper_bodies() -> None:
    if not WORKFLOW_SOURCE.exists():
        return
    text = WORKFLOW_SOURCE.read_text()
    assert "async def issue_link_department_ids" not in text
    assert "async def resolve_vendor_department_and_access" not in text


def test_canonical_bodies_remain_in_register_source_mutation() -> None:
    text = REGISTER_MUTATION.read_text()
    assert "async def issue_link_department_ids" in text
    assert "async def resolve_vendor_department_and_access" in text
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q`. Tests 1 and 2 fail until bodies are removed.

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change imports so `issue_link_department_ids` is imported from `app.services._issue_register.source_mutation` (alongside the three names already imported there). Drop the `_issue_workflow.source_validation` import for `issue_link_department_ids`.
- `backend/app/api/v1/endpoints/issues/links.py:13-19` — replace `_resolve_vendor_department_and_access` with `from app.services._issue_register.source_mutation import resolve_vendor_department_and_access` (drop the underscore prefix in the import); rename call site at `:68` from `_resolve_vendor_department_and_access(...)` → `resolve_vendor_department_and_access(...)`.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:10,57,66` — drop `_issue_link_department_ids` and `_resolve_vendor_department_and_access` from the import block and `__all__` (overlaps with #30; in-scope edit here is just the link-helper rows).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/links.py` — entire file (`:1-81`). Update barrel to no longer import from it.
- If `backend/app/services/_issue_workflow/source_validation.py` is empty after removing `issue_link_department_ids` and `resolve_vendor_department_and_access`, `git rm` it (commit b of #8 may already do this; coordinate to avoid double-edit).

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Add structural lock from Step 1.
- Capability contract `docs/security/authorization-capability-contract.md:128` and `.json:629` — drop `backend/app/api/v1/endpoints/issues/_shared/links.py` from the `service_policy` enumeration. Confirm `backend/app/services/_issue_register/` token remains (it does, at the trailing position). Atomic edit in same commit.
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md:12` — strike `links.py` from Contents list (file deleted).
- `backend/app/services/_issue_register/README.md` — append a Contents bullet: `- source_mutation.py - canonical owner of vendor/department resolution and IssueLink department aggregation`.

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues backend/app/services` — clean.
7. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.3: collapse triplicate source-mutation helpers into _issue_register/source_mutation`
- Body: "Repoints workflow `update_plans` and endpoint `links.py` callers to the canonical `_issue_register/source_mutation.py` bodies. Deletes endpoint `_shared/links.py` (the duplicate). Updates capability contract `service_policy` row to drop the deleted file. New architecture lock pins one-canonical-home invariant."

### Rollback
- Class: **CROSS-DOMAIN** (#8 prereq, #30 dependent) — per `plan-loop-3-03-rollback-register.md:329`.
- Procedure:
  1. **Revert #30 first** if it landed.
  2. `git revert <SHA>` to restore the triplicate.
  3. Drop `test_issue_link_helpers_have_one_canonical_home_red.py`.
  4. Restore `_issue_register/README.md` Contents bullet.
  5. Restore capability contract `_shared/links.py` token at `.md:128` and `.json:629`.
  6. Run validator — exit 0 required.
- Estimated revert time: 30 min.

### Effort & Risk Notes
- Estimated time: 6h (chain-coordination, contract atomic edit, file delete, repoint).
- Risk: MEDIUM — chain item; partial revert leaves duplicate helpers + stale lock. Per `plan-loop-3-04-risk-register.md:542-554`, the `#2 → #8 → #28 → #30` chain is the longest critical path.
- Mitigations applied: structural lock catches re-introduction; capability validator pins service_policy enumeration; #30 follows in next slot to clean the now-dead barrel entries.

---

## Item #29 — S4.6 — Source-type vocabulary canonicalization

### Status & Sequencing
- Master sequence slot: **v2 Seq 31** (per `plan-loop-3-07-integration-v2.md:374`).
- Wave: **4 (P2 dead-code B)**.
- Effort: **S** (4h).
- Priority: **P2**.
- Dependencies (must be complete first): none (independent; cleanest after #28 but landing earlier is fine).
- Atomic with: none.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 31.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/_issue_register/constants.py`, `backend/app/services/_issue_register/source_mutation.py`, `backend/app/services/_issue_register/linked_context.py`, `backend/app/services/_issue_workflow/update_plans.py`.
- [ ] Confirm three definitions exist: `_source_type_value` at `_issue_register/source_mutation.py:24`; `source_type_value` at `_issue_workflow/update_plans.py:19`; `source_type_value` at `_issue_register/linked_context.py:103`.
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)

**File 1 (new architecture lock)**: `tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TRIO = (
    REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py",
    REPO_ROOT / "backend/app/services/_issue_workflow/update_plans.py",
    REPO_ROOT / "backend/app/services/_issue_register/linked_context.py",
)


def test_source_type_value_canonical_home_exists() -> None:
    from app.services._issue_register import constants

    assert hasattr(constants, "source_type_value")


def test_source_type_value_defined_only_in_constants() -> None:
    defs = 0
    for path in TRIO:
        text = path.read_text()
        if "def source_type_value" in text or "def _source_type_value" in text:
            defs += 1
    assert defs == 0, "duplicate source_type_value definitions remain in trio"
```

**File 2 (new unit test)**: `tests/backend/pytest/test_issue_source_type_value.py` (NOT under `architecture/`, so no `pytestmark.contract`).
**Test content**:
```python
from __future__ import annotations

import pytest
from enum import Enum

from app.models.issue import IssueSourceType
from app.services._issue_register.constants import source_type_value


class _OtherEnum(str, Enum):
    foo = "foo"


@pytest.mark.parametrize(
    "value,expected",
    [
        (IssueSourceType.manual, "manual"),
        (IssueSourceType.audit, "audit"),
        (IssueSourceType.control_execution, "control_execution"),
        (IssueSourceType.kri_breach, "kri_breach"),
        ("manual", "manual"),
        (_OtherEnum.foo, "foo"),
        (None, ""),
    ],
)
def test_source_type_value_normalizes_inputs(value, expected) -> None:
    assert source_type_value(value) == expected
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py tests/backend/pytest/test_issue_source_type_value.py -q`. Both fail (helper not defined yet, three definitions remain).

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/services/_issue_register/constants.py` — append the canonical helper:
  ```
  from enum import Enum

  from app.models.issue import IssueSourceType


  def source_type_value(source_type: IssueSourceType | Enum | str | None) -> str:
      if source_type is None:
          return ""
      if isinstance(source_type, Enum):
          return source_type.value
      return str(source_type)
  ```
- `backend/app/services/_issue_workflow/update_plans.py:19-20` — delete local `def source_type_value`. Add `from app.services._issue_register.constants import source_type_value` at top imports.
- `backend/app/services/_issue_register/source_mutation.py:24-25` — delete local `def _source_type_value`. Add `from .constants import source_type_value` at top imports. At `:162`, rename the local variable `source_type_value = _source_type_value(source_type)` to `value = source_type_value(source_type)` (avoid shadowing). Update the four following references at `:162,164,175,192` to use `value` instead of `source_type_value`.
- `backend/app/services/_issue_register/linked_context.py:103-104` — delete local `def source_type_value`. Add `from .constants import source_type_value` at top imports. The call at `:110` (`source_type = source_type_value(issue.source_type)`) keeps working unchanged.

**Files to create**:
- `tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py`
- `tests/backend/pytest/test_issue_source_type_value.py`

### TDD Step 3 — Confirm GREEN
Run both new test files: `pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py tests/backend/pytest/test_issue_source_type_value.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Add the architecture lock from Step 1.
- No capability-contract change.
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/services/_issue_register/README.md` — append Contents bullet: `- constants.py - UNKNOWN_*_LABEL strings and source_type_value coercer (canonical)`.

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/test_issue_source_type_value.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py -q` — must pass.
3. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py -q` — domain suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.6: extract canonical source_type_value into _issue_register/constants`
- Body: "Replaces three near-duplicate definitions (`_source_type_value` at `_issue_register/source_mutation.py:24`, `source_type_value` at `_issue_workflow/update_plans.py:19`, `source_type_value` at `_issue_register/linked_context.py:103`) with one helper at `_issue_register/constants.py`. Adds `None` handling (returns `''`). New unit test pins behavior; new architecture lock pins one-canonical-home invariant."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:341`).
- Procedure:
  1. `git revert <SHA>` to restore the three local definitions and remove the constants helper.
  2. Drop `test_source_type_value_has_one_canonical_definition_red.py` and `test_issue_source_type_value.py`.
  3. Restore `_issue_register/README.md` Contents bullet edit.
- Estimated revert time: 15 min.

### Effort & Risk Notes
- Estimated time: 3h (helper + 3 import repoints + variable shadow rename + 2 tests).
- Risk: LOW — bodies are functionally equivalent (Loop B verified `IssueSourceType` is `str, Enum`).
- Mitigations applied: parametrized unit test covers Enum, str, foreign-Enum, and None paths; structural lock catches duplicate re-introduction.

---

## Item #30 — S4.10 — Issue `_shared/__init__.py` underscore re-export pruning

### Status & Sequencing
- Master sequence slot: **v2 Seq 54** (per `plan-loop-3-07-integration-v2.md:397`).
- Wave: **5 (P2 chains)**.
- Effort: **M** (8h).
- Priority: **P2**.
- Dependencies (must be complete first): **#14 (Seq 12), #27 (Seq 51), #28 (Seq 53)**.
- Atomic with: none. Terminal node of `#2 → #8 → #28 → #30` chain.

**Phase 4 corrected counts**: 36 entries / 13 public / 23 underscored = **14 prunable + 9 to re-point**. The 2 `_notify_*` test imports go through the SUBMODULE (`from ...notifications import ...`), NOT through the barrel — so #30 alone does not break the test, but #14 must have already removed the underlying functions.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 54.
- [ ] Confirm prerequisites complete: #14, #27, #28 architecture locks all GREEN.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/__init__.py`, all 5 endpoint consumer files (`crud/{contextual,create,detail}.py`, `links.py`, plus `crud/list.py` if any underscore imports remain).
- [ ] Run `grep -rn "_validate_user_exists\|_ensure_owner_assignable\|_get_issue_with_relations\|_get_readable_issue_or_404\|_get_writable_issue_or_404\|_resolve_vendor_department_and_access\|_issue_link_department_ids\|_issue_source_link\|_link_matches_issue_source\|_serialize_issue_link" backend/app/api/v1/endpoints/issues/` to confirm only 5 remaining files import these.
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

import pytest

pytestmark = pytest.mark.contract


def test_issue_shared_barrel_no_underscored_reexports() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    underscored = sorted(name for name in barrel.__all__ if name.startswith("_"))
    assert underscored == [], f"barrel must not re-export underscored names: {underscored}"


def test_issue_shared_barrel_explicit_guards() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    for forbidden in (
        "_active_exception",
        "_ensure_owner_assignable",
        "_get_active_user_with_permissions",
        "_get_issue_with_relations",
        "_get_readable_issue_or_404",
        "_get_writable_issue_or_404",
        "_issue_link_department_ids",
        "_issue_source_link",
        "_label_or_fallback",
        "_link_display",
        "_link_matches_issue_source",
        "_notify_exception_approved",
        "_notify_exception_requested",
        "_notify_issue_assigned",
        "_resolve_user_name",
        "_resolve_vendor_department_and_access",
        "_serialize_exception",
        "_serialize_exception_with_user_names",
        "_serialize_issue_link",
        "_serialize_issue_read",
        "_serialize_issue_summary",
        "_serialize_remediation",
        "_validate_user_exists",
    ):
        assert forbidden not in barrel.__all__, f"{forbidden!r} re-introduced in barrel"
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q` — fails because `__all__` currently lists 23 underscored names (`:51-73`).

### TDD Step 2 — Implement Change

**Per-name disposition** (Phase 4 corrected ledger of 36 = 13 public + 23 underscored = 14 prunable + 9 to re-point):

**Drop (14 underscored, no live external consumer after #14/#27/#28)** — remove from `__all__` and import block of `_shared/__init__.py`:
1. `_active_exception` (line `:19, 51`)
2. `_get_active_user_with_permissions` (line `:13, 53`) — drop unless `notifications.py` retains it
3. `_issue_link_department_ids` (line `:10, 57`) — body deleted by #28
4. `_label_or_fallback` (line `:21, 59`)
5. `_link_display` (line `:22, 60`)
6. `_notify_exception_approved` (line `:14, 62`) — body deleted by #14
7. `_notify_exception_requested` (line `:15, 63`) — body deleted by #14
8. `_notify_issue_assigned` (line `:16, 64`) — body deleted by #14
9. `_resolve_user_name` (line `:24, 65`)
10. `_serialize_exception` (line `:25, 67`)
11. `_serialize_exception_with_user_names` (line `:26, 68`)
12. `_serialize_issue_read` (line `:28, 70`)
13. `_serialize_issue_summary` (line `:29, 71`)
14. `_serialize_remediation` (line `:30, 72`)

**Re-point (9 with live external consumers)** — repoint consumers, then remove from barrel:
15. `_ensure_owner_assignable` — consumers `crud/create.py:20,51`, `crud/contextual.py:19,41`. Repoint to `from app.services._issue_workflow.assignment import ensure_owner_assignable`; rename call sites. (Already moved to assignment by #8.)
16. `_validate_user_exists` — consumers `crud/create.py:22,50`, `crud/contextual.py:21,40`. Repoint to `from app.services._issue_workflow.assignment import validate_user_exists`; rename call sites.
17. `_get_issue_with_relations` — already deleted by #27; consumers `crud/create.py:21,107`, `crud/contextual.py:20,95` already repointed by #27.
18. `_get_readable_issue_or_404` — already deleted by #27; `crud/detail.py:10,21` already repointed by #27.
19. `_get_writable_issue_or_404` — already deleted by #27; `links.py:14,80,128` already repointed by #27.
20. `_resolve_vendor_department_and_access` — already deleted by #28; `links.py:17,68` already repointed by #28.
21. `_issue_source_link` — consumer `links.py:15,134`. Repoint to `from app.api.v1.endpoints.issues._shared.serialization import _issue_source_link as issue_source_link` OR rename consumer to use the public name from `_issue_register.linked_context`. **Recommended**: `from app.services._issue_register.linked_context import issue_source_link` and rename `_issue_source_link(issue)` → `issue_source_link(issue)`.
22. `_link_matches_issue_source` — consumer `links.py:16,135`. Same pattern: `from app.services._issue_register.linked_context import link_matches_issue_source`; rename call site.
23. `_serialize_issue_link` — consumer `links.py:18,101,118`. Same pattern: `from app.services._issue_register.serialization import _serialize_issue_link as serialize_issue_link` OR (preferred) promote `_serialize_issue_link` to public `serialize_issue_link` in `_issue_register/serialization.py` and import the public name.

**Keep public (13)** — leave intact in `__all__`: `UNKNOWN_CONTROL_LABEL`, `UNKNOWN_DEPARTMENT_LABEL`, `UNKNOWN_EXECUTION_LABEL`, `UNKNOWN_KRI_LABEL`, `UNKNOWN_RISK_LABEL`, `UNKNOWN_USER_LABEL`, `UNKNOWN_VENDOR_LABEL`, `ResolvedIssueSource`, `build_issue_linked_visibility`, `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_contextual_issue_source`, `resolve_issue_source_metadata`.

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py` — full rewrite per the disposition table above. Final `__all__` is 13 items; the import block has only the 4 source/serialization/constants/source-mutation re-exports (drop `from .links` and `from .loading` and `from .notifications` and `from .validation` if those modules are deleted; keep `from .serialization import IssueLinkedVisibility, build_issue_linked_visibility` if `_shared/serialization.py` survives).
- `backend/app/api/v1/endpoints/issues/crud/create.py:20-22,50-51` — repoint to `_issue_workflow.assignment` for `ensure_owner_assignable` and `validate_user_exists`; rename call sites (drop underscore).
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:19-21,40-41` — same pattern.
- `backend/app/api/v1/endpoints/issues/links.py:13-19,68,80,101,118,128,134-135` — repoint each remaining underscore name; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` — delete the file if all consumers now import directly from `_issue_workflow.assignment` (recommended). If kept, re-shape to a thin re-export.
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` — drop the underscored re-exports; if all consumers now reach `_issue_register` directly, the file shrinks to only `IssueLinkedVisibility` + `build_issue_linked_visibility` re-exports (or is deleted).

**Files to delete (recommended)**:
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` (now empty after #8 + #30).
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` (if no surviving consumers).

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Add the structural lock from Step 1.
- Capability contract `docs/security/authorization-capability-contract.md:128` and `.json:629` — confirm `_shared/source.py` and `_shared/serialization.py` still exist; if `_shared/serialization.py` was deleted in this commit, drop the citation atomically.
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md` — refresh Contents to reflect surviving files (likely only `__init__.py`, `constants.py`, `source.py` after the full chain — if `serialization.py` and `validation.py` are deleted).

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues` — clean.
7. `mypy backend/app/api/v1/endpoints/issues` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.10: prune issues/_shared barrel underscored re-exports; rename survivors to public`
- Body: "Drops 14 prunable underscored names (no live consumer after #14/#27/#28) from the barrel. Re-points 9 names with live consumers to their canonical homes (`_issue_workflow.assignment`, `_issue_register.linked_context`, `_issue_register.serialization`). Final `__all__` is the 13 public names. New architecture lock pins absence of underscored re-exports."

### Rollback
- Class: **CROSS-DOMAIN** (multi-prereq) — per `plan-loop-3-03-rollback-register.md:352`.
- Procedure:
  1. `git revert <SHA>` to restore the pruned underscored re-exports.
  2. Drop `test_issue_shared_barrel_has_no_underscored_reexports_red.py`.
  3. Restore `_shared/README.md` Contents block.
  4. Restore any deleted `_shared/{validation,serialization}.py` if their bodies were removed.
  5. Allowlist update if applicable.
- Estimated revert time: 30 min.

### Effort & Risk Notes
- Estimated time: 6h (5 endpoint files × repoint + barrel + lock + README + capability contract).
- Risk: MEDIUM — broad consumer surface; partial revert breaks imports across issue endpoints. Per `plan-loop-3-04-risk-register.md:571-580`, this is the 4th sequential edit on `_shared/README.md` Contents.
- Mitigations applied: structural lock + per-name guard list catches re-introduction; consumer count verified via grep before commit.

---

## Item #41 — B-N3 — Issue workflow serialization alias removal

### Status & Sequencing
- Master sequence slot: **v2 Seq 20** (per `plan-loop-3-07-integration-v2.md:363`).
- Wave: **3 (P2 dead-code A)**.
- Effort: **S** (4h).
- Priority: **P2**.
- Dependencies (must be complete first): none.
- Atomic with: none. Soft pair-with: #2 (same anti-pattern, different file).

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 20.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/_issue_workflow/serialization.py`, `backend/app/services/_issue_register/serialization.py`, `backend/app/services/_issue_workflow/execution.py`.
- [ ] Confirm `_issue_workflow/serialization.py:18 active_exception = _active_exception` and `:41 _serialize_exception_with_user_names = serialize_exception_with_user_names` still present.
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_SERIALIZATION = REPO_ROOT / "backend/app/services/_issue_workflow/serialization.py"


def test_no_self_aliases_in_workflow_serialization() -> None:
    text = WORKFLOW_SERIALIZATION.read_text()
    assert "active_exception = _active_exception" not in text
    assert (
        "_serialize_exception_with_user_names = serialize_exception_with_user_names"
        not in text
    )
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q`. Fails because both literals exist at `:18` and `:41`.

### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_register/serialization.py` — promote the underscored `_active_exception` to a public `active_exception`. Specifically: rename the function `def _active_exception(issue):` (around `:47`) to `def active_exception(issue):`, and add `_active_exception = active_exception` at the end if any external code still relies on the old name (or remove if all consumers are repointed in this commit). Loop B note: only `_issue_workflow/serialization.py` imports this name.
- `backend/app/services/_issue_workflow/serialization.py:9-11` — change `from app.services._issue_register.serialization import (_active_exception,)` to `from app.services._issue_register.serialization import active_exception`. Drop the `:18 active_exception = _active_exception` line.
- `backend/app/services/_issue_workflow/serialization.py:41` — delete the line `_serialize_exception_with_user_names = serialize_exception_with_user_names`. Loop B verified no caller of `_serialize_exception_with_user_names` outside this file (`execution.py:38` already imports the public name).

**Files to create**: the new architecture test from Step 1.

**Files to delete**: none.

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Add the structural lock from Step 1.
- No capability-contract change.
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/services/_issue_workflow/README.md` — no edit required.

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"` — locks green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register` — clean.
6. `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register` — clean.

### Commit Boundary
- Single commit.
- Title: `B-N3: remove bidirectional underscore aliases in _issue_workflow/serialization`
- Body: "Promotes `_active_exception` to public `active_exception` in `_issue_register/serialization.py`. Removes self-alias `active_exception = _active_exception` (line 18) and `_serialize_exception_with_user_names = serialize_exception_with_user_names` (line 41) from `_issue_workflow/serialization.py`. Loop B verified no external callers of the underscored variants."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:489`).
- Procedure:
  1. `git revert <SHA>` to restore both alias lines and the underscored function name.
  2. Drop `test_issue_workflow_serialization_has_no_self_aliases_red.py`.
- Estimated revert time: 10 min.

### Effort & Risk Notes
- Estimated time: 2h (rename + 2 line deletions + test).
- Risk: LOW — Loop B verified no external consumers.
- Mitigations applied: structural lock; existing `serialize_refreshed_issue` happy-path test in `test_issue_workflow.py` covers the rename.

---

## Item #53 — S4.1 — Issue workflow service collapse (drop `IssueWorkflowService`)

### Status & Sequencing
- Master sequence slot: **v2 Seq 23** (per `plan-loop-3-07-integration-v2.md:366`).
- Wave: **3 (P2 dead-code A)**.
- Effort: **S** (4h).
- Priority: **P2**.
- Dependencies (must be complete first): none.
- Atomic with: none.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 23.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/issue_workflow_service.py`, `backend/app/services/_issue_workflow/service.py`, `backend/app/services/_issue_workflow/execution.py`.
- [ ] Confirm only `_issue_workflow/execution.py:49` imports `IssueWorkflowService` (Loop B grep).
- [ ] Confirm calls at `execution.py:119,143,162,183,202,237,266` use the static-method passthroughs.
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
EXECUTION = REPO_ROOT / "backend/app/services/_issue_workflow/execution.py"
SERVICE_FACADE = REPO_ROOT / "backend/app/services/issue_workflow_service.py"
INTERNAL_SERVICE = REPO_ROOT / "backend/app/services/_issue_workflow/service.py"


def test_execution_imports_lifecycle_directly() -> None:
    text = EXECUTION.read_text()
    assert "IssueWorkflowService" not in text
    assert "from app.services._issue_workflow.assignment import" in text
    assert "from app.services._issue_workflow.remediation import" in text
    assert "from app.services._issue_workflow.exceptions import" in text
    assert "from app.services._issue_workflow.closure import" in text


def test_facade_files_deleted() -> None:
    assert not SERVICE_FACADE.exists(), "issue_workflow_service.py facade must be deleted"
    if INTERNAL_SERVICE.exists():
        text = INTERNAL_SERVICE.read_text()
        assert "class IssueWorkflowService" not in text
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q`. Fails because `IssueWorkflowService` is currently used.

### TDD Step 2 — Implement Change
**Files to edit**:
- `backend/app/services/_issue_workflow/execution.py:49` — delete `from app.services.issue_workflow_service import IssueWorkflowService`. Replace each `IssueWorkflowService.<method>(...)` call with the underlying function. The mapping (per `_issue_workflow/service.py:33-41`):
  - `IssueWorkflowService.assign_issue` (called at `:119`) → `from .assignment import assign_issue` and call `assign_issue(...)`.
  - `IssueWorkflowService.start_remediation` (called at `:143`) → `from .remediation import start_remediation`.
  - `IssueWorkflowService.update_progress` (called at `:162`) → `from .remediation import update_progress`.
  - `IssueWorkflowService.close_issue` (called at `:183`) → `from .closure import close_issue`.
  - `IssueWorkflowService.request_exception` (called at `:202`) → `from .exceptions import request_exception`.
  - `IssueWorkflowService.approve_exception` (called at `:237`) → `from .exceptions import approve_exception`.
  - `IssueWorkflowService.revoke_exception` (called at `:266`) → `from .exceptions import revoke_exception`.

**Files to delete**:
- `backend/app/services/issue_workflow_service.py` (5 lines — pure re-export).
- `backend/app/services/_issue_workflow/service.py` if no test or import remains. Verified via grep: only `_issue_workflow/__init__.py:3` mentions `app.services.issue_workflow_service` as a comment. Drop or rephrase that line. Recommended: `git rm backend/app/services/_issue_workflow/service.py`.

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q`. Pass.

### Lock/TOML/Contract Updates (same commit)
- Add structural lock from Step 1.
- Existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1237` (`assert "IssueWorkflowService." not in lifecycle_source`) still passes (asserts `lifecycle.py`, not `execution.py`).
- **Update lock at `:1192-1206`**: line `:1193` imports `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization, source_validation`. After #8 may delete `source_validation`; coordinate with #8's commit (b) — if `source_validation.py` is gone, drop it from the import tuple. (For #53 in isolation, the import tuple is unchanged.)
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- `backend/app/services/_issue_workflow/README.md:11-16` — drop `service.py` from Contents; refresh to reality (add `assignment.py`, `closure.py`, `exceptions.py`, `remediation.py`, `loading.py`, `outbox.py`, `serialization.py`, `source_validation.py` (if still present), `transitions.py`, `lifecycle.py`, `execution.py`, `update_plans.py`, `exception_selection.py`, `contracts.py`).

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest -q -k "issue"` — broad issue suite green.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"` — locks green.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/_issue_workflow backend/app/services` — clean.
7. `mypy backend/app/services/_issue_workflow backend/app/services` — clean.

### Commit Boundary
- Single commit.
- Title: `S4.1: collapse IssueWorkflowService facade; execution.py imports lifecycle directly`
- Body: "Drops the `IssueWorkflowService` static-method facade. `execution.py` now imports `assign_issue`, `start_remediation`, `update_progress`, `close_issue`, `request_exception`, `approve_exception`, `revoke_exception` from their lifecycle modules directly. Deletes `services/issue_workflow_service.py` and `_issue_workflow/service.py` (no remaining importers). Updates README. New architecture lock pins direct-import invariant."

### Rollback
- Class: **CROSS-DOMAIN** (deepening contract) — per `plan-loop-3-03-rollback-register.md:639`.
- Procedure:
  1. **Block until issues chain (#28, #30) is reverted if landed.**
  2. `git revert <SHA>` to restore the facade.
  3. Restore `:1193` import line in `test_architecture_deepening_contracts.py` (no change unless #8 already touched it).
  4. Drop `test_issue_workflow_execution_imports_lifecycle_directly_red.py`.
  5. Restore `_issue_workflow/README.md` `service.py` listing.
- Estimated revert time: 35 min.

### Effort & Risk Notes
- Estimated time: 3h (mechanical replacement; existing tests cover all 7 verbs).
- Risk: LOW — static-method binds are pure passthroughs.
- Mitigations applied: existing test_issue_workflow.py covers all 7 lifecycle verbs (assign, start, progress, close, request, approve, revoke); structural lock catches re-introduction.

---

## Item #43 — BE-N4 — Audit adapter-emitter helper (additive)

### Status & Sequencing
- Master sequence slot: **v2 Seq 59** (per `plan-loop-3-07-integration-v2.md:402`).
- Wave: **6 (P3 medium)**.
- Effort: **M** (8h).
- Priority: **P3**.
- Dependencies (must be complete first): none.
- Atomic with: none. Cross-domain item (audit adapter — used by 6 audit modules: `risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`).

**Phase 4 correction**: 37 adapter rows (verified `_audit_matrix.toml` count). Lock preservation: `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:13` requires a `def` per row at module level. **Helper MUST be additive**: every named function (`control_created`, `issue_assigned`, etc.) MUST remain at module scope. Helper is invoked INSIDE each existing `def`, never as a replacement for it.

### Pre-flight Checks (before starting)
- [ ] Verify slot in v2 sequence: 59.
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/core/audit/_audit_matrix.toml`, `backend/app/core/audit/{risk,control,kri,issue,approval,vendor}.py`.
- [ ] Run `python3 -c "import tomllib; print(len(tomllib.load(open('backend/app/core/audit/_audit_matrix.toml','rb'))['adapter']))"` — confirm 37.
- [ ] Read `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py` and `test_w7_audit_safe_entity_label_red.py` (the two existing locks that the helper must preserve).
- [ ] No concurrent feature-work conflicts.

### TDD Step 1 — Write Failing Test (RED)
**File**: `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`
**Test content**:
```python
from __future__ import annotations

import ast
import inspect
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUDIT_ROOT = REPO_ROOT / "backend" / "app" / "core" / "audit"
MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"
EMIT_PATH = AUDIT_ROOT / "_emit.py"


def _load_matrix() -> list[dict[str, str]]:
    with MATRIX_PATH.open("rb") as handle:
        return tomllib.load(handle)["adapter"]


def _module_function_source(module_name: str, function_name: str) -> str | None:
    module_path = AUDIT_ROOT / f"{module_name}.py"
    if not module_path.exists():
        return None
    tree = ast.parse(module_path.read_text())
    for node in tree.body:
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name == function_name:
            return ast.unparse(node)
    return None


def test_emit_helper_module_exists_with_expected_signature() -> None:
    assert EMIT_PATH.exists(), "_emit.py must be created"
    from app.core.audit import _emit

    sig = inspect.signature(_emit.emit_adapter)
    expected = {
        "db",
        "entity_type",
        "entity_id",
        "entity_name",
        "safe_entity_label",
        "action",
        "actor",
        "department_id",
        "changes",
        "description",
        "log_activity_func",
    }
    assert expected <= set(sig.parameters)


def test_each_adapter_row_invokes_emit_helper() -> None:
    rows = _load_matrix()
    assert len(rows) == 37, f"expected 37 adapter rows, got {len(rows)}"
    missing = []
    for entry in rows:
        source = _module_function_source(entry["module"], entry["function"])
        if source is None:
            missing.append(f"{entry['module']}.{entry['function']} (function not found)")
            continue
        if "emit_adapter(" not in source:
            missing.append(f"{entry['module']}.{entry['function']} (no emit_adapter call)")
    assert missing == [], f"functions not yet using helper: {missing}"
```
**Expected**: RED. Run `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q`. Fails (helper does not exist; no row uses `emit_adapter`).

Add a behavior pin in `tests/backend/pytest/test_w7_audit_*` family for one canonical adapter (recommend `control_created`). Sketch (extends an existing test or add new):
```python
@pytest.mark.asyncio
async def test_control_created_via_emit_helper_logs_all_fields(db_session, ...):
    # Drive control_created and assert resulting ActivityLog row has the 9-field shape.
    ...
```

### TDD Step 2 — Implement Change

**Files to create**:
- `backend/app/core/audit/_emit.py`:
  ```python
  from __future__ import annotations

  from collections.abc import Mapping

  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.activity_logger import log_activity
  from app.core.audit.types import AuditLogActivity
  from app.models import User
  from app.models.activity_log import ActivityAction, ActivityEntityType


  async def emit_adapter(
      db: AsyncSession,
      *,
      entity_type: ActivityEntityType,
      entity_id: int,
      entity_name: str,
      safe_entity_label: str,
      action: ActivityAction,
      actor: User,
      department_id: int | None,
      changes: dict[str, dict[str, object]] | Mapping[str, object] | None = None,
      description: str | None = None,
      log_activity_func: AuditLogActivity = log_activity,
      safe_description: str | None = None,
      safe_description_siem: str | None = None,
  ) -> None:
      kwargs: dict[str, object] = {
          "entity_type": entity_type,
          "entity_id": entity_id,
          "entity_name": entity_name,
          "safe_entity_label": safe_entity_label,
          "action": action,
          "actor": actor,
          "department_id": department_id,
      }
      if changes is not None:
          kwargs["changes"] = changes
      if description is not None:
          kwargs["description"] = description
      if safe_description is not None:
          kwargs["safe_description"] = safe_description
      if safe_description_siem is not None:
          kwargs["safe_description_siem"] = safe_description_siem
      await log_activity_func(db, **kwargs)
  ```

**Files to edit** (each adapter module — `risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`):
- For each of the 37 `(module, function)` rows in `_audit_matrix.toml`, replace the `await log_activity_func(db, entity_type=..., ...)` body with `await emit_adapter(db, entity_type=..., entity_id=..., entity_name=..., safe_entity_label=..., action=..., actor=..., department_id=..., changes=..., description=...)`. Add `from app.core.audit._emit import emit_adapter` at the top of each module.
- **CRITICAL**: each `def`/`async def` MUST stay at module scope with its name and signature unchanged. The helper invocation lives INSIDE the function body. Example before/after for `audit/control.py:23` `control_created`:
  ```python
  # BEFORE (lines 23-39):
  async def control_created(db, *, actor, control, log_activity_func=log_activity) -> None:
      await log_activity_func(
          db,
          entity_type=ActivityEntityType.CONTROL,
          entity_id=control.id,
          entity_name=control_display_name(control),
          safe_entity_label=safe_entity_label("CTRL", control.id),
          action=ActivityAction.CREATE,
          actor=actor,
          department_id=control.department_id,
      )

  # AFTER:
  async def control_created(db, *, actor, control, log_activity_func=log_activity) -> None:
      await emit_adapter(
          db,
          entity_type=ActivityEntityType.CONTROL,
          entity_id=control.id,
          entity_name=control_display_name(control),
          safe_entity_label=safe_entity_label("CTRL", control.id),
          action=ActivityAction.CREATE,
          actor=actor,
          department_id=control.department_id,
          log_activity_func=log_activity_func,
      )
  ```

### TDD Step 3 — Confirm GREEN
Run `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q`. Pass. Then run the existing `test_w7_audit_adapter_completeness_red.py` and `test_w7_audit_safe_entity_label_red.py` — both must remain GREEN (no regression).

### Lock/TOML/Contract Updates (same commit)
- Add the new architecture-lock test from Step 1.
- `_audit_matrix.toml` rows do NOT change.
- Existing locks `test_w7_audit_adapter_completeness_red.py:13` and `test_w7_audit_safe_entity_label_red.py` MUST remain GREEN — verify after each module edit.
- No capability-contract change.
- No TOML allowlist edits.

### README/Doc Updates (same commit)
- Optional: add a line in `backend/app/core/audit/__init__.py` docstring or create a small `backend/app/core/audit/README.md` noting that `_emit.py` owns the adapter-emit boilerplate. Skip if `audit/` has no README today (per `plan-loop-1-07-endpoints.md:389-391`).

### Verification Commands (run all in order)
1. `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py tests/backend/pytest/architecture/test_w7_audit_safe_entity_label_red.py -q` — must remain GREEN.
3. `pytest tests/backend/pytest -q -k "audit or test_w7"` — broad audit suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/core/audit` — clean.
6. `mypy backend/app/core/audit` — clean.

### Commit Boundary
- ONE commit recommended (per Loop 1 plan `:395`); ALTERNATIVE: 2-3 commits split by adapter module if individual diffs exceed ~150 LOC. Prefer ONE if test suite stays green per-module.
- Title: `BE-N4: extract audit adapter emit helper (additive)`
- Body: "Adds `backend/app/core/audit/_emit.py::emit_adapter(...)`. Switches all 37 `(module, function)` adapter rows in `_audit_matrix.toml` to invoke the helper. Each `def`/`async def` remains at module scope (preserves `test_w7_audit_adapter_completeness_red.py:13` and `test_w7_audit_safe_entity_label_red.py` invariants). Helper propagates `safe_entity_label=`, `safe_description=`, `safe_description_siem=` keyword args. New architecture lock pins helper presence and per-row invocation."

### Rollback
- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:508`).
- Procedure:
  1. `git revert <SHA>` to inline the helper invocations back into the 6 audit modules.
  2. Delete `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`.
  3. Verify W7 audit-adapter completeness lock still GREEN (matrix rows untouched).
- Estimated revert time: 30 min.

### Effort & Risk Notes
- Estimated time: 6h (helper module + 37 row rewrites + 1 architecture test + 1 behavior test + verification).
- Risk: MEDIUM — broad surface (37 rows × 6 modules); per-module diff can be large. Helper must NOT shadow `safe_entity_label=` keyword (existing W7 lock checks every `log_activity*` call has it).
- Mitigations applied: helper preserves all keyword args including `safe_entity_label`; existing W7 locks remain in force; if per-row diff exceeds ~150 LOC, split into 2-3 commits by module family.

---

## Cross-domain handoff notes

1. **#14 lands BEFORE #30** (Wave 2 → Wave 5). The submodule-direct test imports (`tests/backend/pytest/api/v1/test_issue_workflow.py:10`) are NOT a barrel-prune blocker — but #14 must delete the underlying functions before #30 prunes the barrel re-exports.
2. **#27 lands BEFORE #30** (Wave 5 same wave, Seq 51 → 54). The barrel `_get_*` re-exports become dead-stale only after #27 deletes the duplicate file.
3. **#8 lands BEFORE #28** (Wave 5 Seq 52 → 53). The `update_plans.py` import repoint is a strict prerequisite for #28's source-mutation collapse.
4. **#28 lands BEFORE #30** (Wave 5 Seq 53 → 54). Capability contract `_shared/links.py` token must be removed atomically with the file deletion in #28.
5. **#30 is the terminal node** of the issues critical path `#2 → #8 → #28 → #30`. All three prerequisites' architecture locks must be GREEN before the prune commit.
6. **#43** is independent of all 9 issues items. It can land any time during Wave 6 (P3 medium). Coordination only needed if a same-developer is balancing audit-adapter work alongside issue-domain work in the same week.
7. **#53 is independent** of the chain. Land any time in Wave 3.
8. **#29 is independent** of the chain. Land any time after Wave 2 (no prereqs).
9. **#41 lands BEFORE #30** indirectly: #41 promotes `_active_exception` to public `active_exception` in `_issue_register/serialization.py`. #30 expects this public name when re-pointing the barrel's `_active_exception` consumers (none today; this just keeps the rename forward-compatible).

---

## Concerns / blockers spotted during recipe drafting

1. **`tests/backend/pytest/services/` directory does NOT exist** (verified). The Loop 1 plan's path `tests/backend/pytest/services/test_issue_source_type_value.py` for #29 either needs the directory created or the test placed at the flat root `tests/backend/pytest/test_issue_source_type_value.py`. Recipe uses the flat-root path to avoid an empty-init-file ceremony.
2. **#43 helper signature includes `safe_description`/`safe_description_siem`** kwargs to preserve full passthrough fidelity. Some adapter rows do NOT pass these (e.g., `control_created`); the helper accepts them as optional. If a Loop B recheck reveals a per-row signature divergence (e.g., a row passes a kwarg the helper does not accept), the helper must be widened in the same commit.
3. **#8 commit (b) and #53** both potentially edit `tests/backend/pytest/test_architecture_deepening_contracts.py:1193` (the `from app.services._issue_workflow import ...` tuple). Recommended sequencing: #53 lands at Seq 23, BEFORE #8's commit (a) at Seq 52 and BEFORE #8's commit (b). This ensures the import tuple is touched once by #8 (b) only when `source_validation.py` is finally deleted. If #53 fires the import-tuple edit later (e.g., the dev decides to drop the tuple entirely), the same-commit edit must also include #8 (b) — coordinate via the per-domain DAG.
4. **#30 disposition table assumes 14 prunable + 9 to re-point** per Phase 4 correction. If a future commit (out-of-scope of this 10-item domain) reintroduces a `_notify_*` helper or re-exports it through the barrel, #30's lock catches it via the explicit guard list.
5. **Capability contract `_shared/serialization.py` token**: #30 may end-state delete `_shared/serialization.py` if all consumers reach `_issue_register` directly. The contract token at `.md:128` and `.json:629` must be dropped atomically — verify in commit body whether the file survives.
6. **#43 behavior test** for `control_created` requires existing fixtures from `test_w7_audit_*` family. If those fixtures do not cover the per-field assertion shape (entity_type, entity_id, entity_name, safe_entity_label, action, actor, department_id), add a small fixture in the same commit; do NOT defer.

End of Phase 5 Loop 1 — Issues + #43 recipes.
