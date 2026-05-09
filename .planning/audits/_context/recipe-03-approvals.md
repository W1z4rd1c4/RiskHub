# Phase 5 — Per-item TDD recipes (Approvals + cross-cut helpers)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Source: Loop 1 plan-loop-1-03-approvals.md, plan-loop-1-08-crosscut.md, plan-loop-1-07-endpoints.md; Loop 2 master sequence; Loop 3 risk + adr-drafts; Phase 4 Loop 1+2 reviews (test-gaps + sequence + effort + cohesion adversarial).
Constraints: TDD (RED before GREEN); single-developer sequential; doc/lock-only Reject INVALID; defers overruled. Backend tests use `client_factory` (`tests/backend/pytest/conftest.py:876`); local `dependency_overrides[get_db]` requires entry in `tests/backend/pytest/_get_db_override_whitelist.toml`. Architecture lock tests under `tests/backend/pytest/architecture/` AND new contract-grade tests under `tests/backend/pytest/` MUST set `pytestmark = pytest.mark.contract`.

Hub-wave sequence (additive, three commits, separated): **#9 → #34 → #60** with **2-week separation between #34 and #60** (Loop 4 #74b cohesion guidance — soak time for 16-file/22-site migration before layering FastAPI request-scoped Depends on top).

Independent free-order pool: **#7, #18, #33, #54, #75, #42, #44**.

---

## Item #7 — C-N1 — DELETE `_get_approval_department_id` endpoint shim

**Disposition.** Delete the dead shim `_get_approval_department_id` at `backend/app/api/v1/endpoints/approvals/_shared.py:17-31`. Service-canonical `get_approval_department_id` already serves all 4 production callers (`approval_execution_service.py:84,128,193`, `_approval_execution/logging.py:16`).

**Dependencies.** None in-domain. Free-order. Co-touches `_shared.py` with #18; do them in separate commits.

**Cross-domain prerequisites.** None.

**TDD shape.** Structural assertion (module-attribute lock).

### Failing test (RED before any production edit)

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py` (file already declares `pytestmark = pytest.mark.contract` at line :9):

```python
def test_endpoint_shim_get_approval_department_id_deleted() -> None:
    """C-N1: dead endpoint helper removed; canonical service helper retained."""
    import importlib
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    loading = importlib.import_module("app.services._approval_execution.loading")
    assert not hasattr(shared, "_get_approval_department_id"), (
        "C-N1: endpoint shim _get_approval_department_id must be deleted"
    )
    assert hasattr(loading, "get_approval_department_id"), (
        "Canonical service helper get_approval_department_id must remain"
    )
```

RED at HEAD (shim still defined at `_shared.py:17`). GREEN once production edit lands.

### Production edits (single commit, after RED)

1. `backend/app/api/v1/endpoints/approvals/_shared.py` — delete lines 17-31 (the entire `async def _get_approval_department_id(...)` body).
2. Drop now-unused imports if `_build_approval_read` is still present (do NOT remove `from sqlalchemy import select` if needed elsewhere; verify with `python -c "from app.api.v1.endpoints.approvals import _shared"` post-edit). If #18 lands first, full file is empty enough to delete `select`, `Control`, `KeyRiskIndicator`, `Risk` imports too.

### Lock / TOML / contract updates

- New deepening assertion above (architecture lock).
- No TOML allowlist update (`_endpoint_commit_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_archive_allowlist.toml` do not pin `_get_approval_department_id`).

### README / doc updates

None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already cites `services/_approval_execution/`.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k get_approval_department_id
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py -x
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `chore(approvals): drop dead _get_approval_department_id endpoint shim`. RED test + production deletion in same commit.

**Rollback.** Pure deletion of dead code; revert restores the shim. Zero data, schema, or capability surface impact.

**Effort.** S.

---

## Item #9 — S6.5 — DELETE-AND-REDIRECT `can_user_view_approval_resource`

**Disposition.** Delete duplicate at `backend/app/services/_notification_approval_helpers.py:72-79`; rewrite single internal caller at line 98 to consume `approval_scenario_policy.can_view_approval_resource` (canonical at `backend/app/services/approval_scenario_policy.py:134`). Bodies are identical; only the canonical version carries a docstring.

**Dependencies.** First commit in the **#9 → #34 → #60** approval_scenario_policy hub wave (Loop 1 :18-23, Loop 2 master sequence slot 26).

**Cross-domain prerequisites.** None. Hub-wave additive surgery.

**TDD shape.** Structural assertion + behavioral parametric regression on recipient eligibility.

### Failing test (RED)

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_notification_approval_helpers_no_duplicate_can_view() -> None:
    """S6.5: duplicate can_user_view_approval_resource removed; canonical consumed."""
    import importlib, inspect
    helpers = importlib.import_module("app.services._notification_approval_helpers")
    assert not hasattr(helpers, "can_user_view_approval_resource"), (
        "S6.5: duplicate must be deleted from _notification_approval_helpers"
    )
    src = inspect.getsource(helpers.eligible_approval_notification_recipients)
    assert "can_view_approval_resource" in src, (
        "Caller must consume approval_scenario_policy.can_view_approval_resource"
    )
```

Behavioral regression: extend `tests/backend/pytest/test_approval_workflow.py` (already imports `can_view_approval_resource` at line :26) with a parametric test asserting `eligible_approval_notification_recipients` skips a candidate without read access on each `ApprovalResourceType` (RISK, CONTROL, KRI), incrementing `skipped["hidden_resource"]`. Use `client_factory` for any HTTP-level assertion.

### Production edits

1. `backend/app/services/_notification_approval_helpers.py` — delete lines 72-79 (the duplicate body).
2. Same file, line 98 — rewrite the call site: `if not await can_view_approval_resource(db, candidate, approval):`.
3. Same file, line 9 import block — add `can_view_approval_resource` to the existing `from app.services.approval_scenario_policy import (...)` import (which already imports `RISK_OWNER_APPROVER_ROLE, scenario_roles_for_approval`).

### Lock / TOML / contract updates

- New structural assertion above.
- No TOML allowlist anchors `can_user_view_approval_resource`.

### README / doc updates

None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `approval_scenario_policy.py`.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `refactor(approvals): consolidate can_view_approval_resource on approval_scenario_policy`. RED test + 2 production edits + import update in same commit.

**Rollback.** Redirection-only; revert restores the duplicate. No serialization, schema, or wire-format change.

**Effort.** S.

---

## Item #18 — S6.2 — REPOINT-AND-DELETE `_build_approval_read`

**Disposition.** Repoint 4 endpoint call sites (`backend/app/api/v1/endpoints/approvals/resolve.py:61,85,102` + `detail.py:56`) to canonical `app.services._approval_queue.projection.build_approval_read`, then delete `backend/app/api/v1/endpoints/approvals/_shared.py:34-61`. Bodies are 19-field-for-field identical (Loop B confirmed); only the endpoint copy carries a docstring.

**Dependencies.** None in-domain. Free-order. Co-touches `_shared.py` with #7 — keep separate commits.

**Cross-domain prerequisites.** None.

**TDD shape.** Structural assertion + 19-key response-shape parity regression.

### Failing test (RED)

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_endpoint_shim_build_approval_read_repointed() -> None:
    """S6.2: endpoint copy deleted; resolve+detail consume queue projection."""
    import importlib, inspect
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    resolve = importlib.import_module("app.api.v1.endpoints.approvals.resolve")
    detail = importlib.import_module("app.api.v1.endpoints.approvals.detail")
    projection = importlib.import_module("app.services._approval_queue.projection")
    assert not hasattr(shared, "_build_approval_read"), (
        "S6.2: endpoint copy of _build_approval_read must be deleted"
    )
    assert hasattr(projection, "build_approval_read"), "canonical must remain"
    src = inspect.getsource(resolve) + inspect.getsource(detail)
    assert "build_approval_read" in src, "endpoints must consume canonical helper"
    assert "_build_approval_read" not in src, "endpoints must not call deleted shim"
```

Response-shape regression: in `tests/backend/pytest/test_approval_resolution.py` (or new `test_approval_response_parity.py` with `pytestmark = pytest.mark.contract`), assert that POST `/approvals/{id}/approve`, `/reject`, `/cancel`, and GET `/approvals/{id}` return the same 19 keys for a single approval row (use `client_factory`). Locks the response shape so a future drift cannot slip through.

### Production edits

1. `backend/app/api/v1/endpoints/approvals/resolve.py:18` — replace `from ._shared import _build_approval_read, logger` with `from ._shared import logger` and add `from app.services._approval_queue.projection import build_approval_read`.
2. Same file, lines 61, 85, 102 — replace `_build_approval_read(...)` with `build_approval_read(...)`.
3. `backend/app/api/v1/endpoints/approvals/detail.py:15` — replace `from ._shared import _build_approval_read` with `from app.services._approval_queue.projection import build_approval_read`.
4. Same file, line 56 — replace `_build_approval_read(...)` with `build_approval_read(...)`.
5. `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` — delete the entire `_build_approval_read` body. Drop now-orphaned imports (`approval_resource_label`, `ApprovalRequestRead`, `approval_capabilities`, `User`, `ApprovalRequest`). Keep `logger` symbol — `resolve.py` still imports it.

### Lock / TOML / contract updates

- New structural assertion above.
- `_endpoint_commit_allowlist.toml`: no change (no new commits introduced).
- Existing positive anchor at `test_architecture_deepening_contracts.py:1029` (`assert hasattr(projection, "build_approval_read")`) reinforced — no change needed.

### README / doc updates

None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `services/_approval_queue/projection.py`.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approvals.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `refactor(approvals): repoint _build_approval_read to approval_queue.projection`. RED test + 4 call-site repoints + deletion in same commit.

**Rollback.** Revert restores endpoint copy; response shape unchanged either way.

**Effort.** S.

---

## Item #33 — S6.4 — UNIFY frontend approval-queued banners

**Disposition.** Unify under `frontend/src/components/forms/ApprovalQueuedBanner.tsx` (prop-driven). Hoist the KRI variant's i18n into `KRIFormContainer` (mirroring `RiskFormContainer.tsx:111-119` and `ControlFormContainer.tsx:180-188`). Delete `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`. Loop B confirmed the KRI variant has one extra wrapper `<div>` and class-order drift that disappear on consolidation.

**Dependencies.** None. Frontend-only.

**Cross-domain prerequisites.** None.

**TDD shape.** Failing component test + structural assertion (file-existence and import-graph).

### Failing tests (RED)

1. Augment or add `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx`: render `<KRIFormContainer>` with `state.approvalQueued` set; assert it renders exactly one `ApprovalQueuedBanner` (matched by `data-testid="approval-queued-banner"`) with the resolved `title`, translated `message` (with `errorKeys.*` prefix routing), and `viewApprovalsLabel`. RED at HEAD because the container imports the dedicated `KriApprovalQueuedBanner`.

2. New file `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts`:

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S6.4: KriApprovalQueuedBanner deletion", () => {
  it("KriApprovalQueuedBanner.tsx file removed", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx");
    expect(existsSync(path)).toBe(false);
  });
});
```

Plus a grep-style assertion (e.g. via `import.meta.glob`) that no `frontend/src/**/*.{ts,tsx}` file imports the symbol `KriApprovalQueuedBanner`.

### Production edits

1. `frontend/src/components/kri-form/KRIFormContainer.tsx:7` — replace `import { KriApprovalQueuedBanner } from './KriApprovalQueuedBanner';` with `import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';`.
2. Same file, lines 158-163 — replace the `<KriApprovalQueuedBanner ... />` block with the prop-driven version. Compute `closeLabel`, `title`, `viewApprovalsLabel`, and `message` (with `errorKeys.`-prefix routing) inside the container, mirroring `RiskFormContainer.tsx:111-119`.
3. Delete `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`.

### Lock / TOML / contract updates

- None backend-side.
- Frontend invariant test home (`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`) is unaffected.

### README / doc updates

- `frontend/src/components/forms/README.md` — if it enumerates banner siblings, note the KRI form uses this canonical component.
- `frontend/src/components/kri-form/README.md` — remove any reference to `KriApprovalQueuedBanner`.

### Verification

```
cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form tests/frontend/unit/src/components/forms
cd frontend && npx tsc --noEmit
```

**Commit boundary.** ONE commit `refactor(frontend/kri): unify approval queued banner via KRIFormContainer i18n hoist`.

**Rollback.** Restores local KRI banner + container import. Behavior is i18n-equivalent.

**Effort.** S.

---

## Item #34 — S6.6 — EXTRACT `resolve_approval_privilege_tier`

**Disposition.** Extract a single canonical helper into `backend/app/services/approval_scenario_policy.py` returning a frozen dataclass (`ApprovalPrivilegeTier`) plus async `resolve_approval_privilege_tier(db, user, approval) -> ApprovalPrivilegeTier`. Migrate all **25 call sites across 16 files** (Phase 4 verification — Loop 1's "22+" was a hedge; AST scan confirms 25). Migrate atomically.

**Dependencies.** **#9 must land first** (additive hub-wave). **2-week separation between #34 and #60** so the migration soaks before layering FastAPI Depends on top.

**Cross-domain prerequisites.** Affects shared files in Risks/Controls/KRIs domains:
- `_authorization_capabilities/{risks,controls,kris}.py` (3 files shared with R/C/K domain plans).
- `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py` (shared with mutation flow).
- `_kri_history/{governance,intake}.py` (shared with KRI domain).

This recipe is the **single owner** of the `can_resolve_approvals(current_user)` migration. Other domain recipes must NOT double-migrate the same predicate.

**TDD shape.** Behavioral parametric regression + AST-scan structural lock (NOT string-search per Phase 4 correction).

### Failing tests (RED)

#### Test A — behavioral parametric tier consistency

New file `tests/backend/pytest/test_approval_privilege_tier.py`:

```python
"""S6.6: resolve_approval_privilege_tier behavioral parity across flows."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

from app.services.approval_scenario_policy import (
    TIER_CAPABLE_SCENARIO_KEYS,
    resolve_approval_privilege_tier,
    ApprovalPrivilegeTier,
)

@pytest.mark.parametrize("scenario_key", sorted(TIER_CAPABLE_SCENARIO_KEYS) + ["__legacy__"])
@pytest.mark.parametrize(
    "user_role,is_primary,is_requester",
    [
        ("admin", False, False),
        ("cro", False, False),
        ("risk_manager", False, False),
        ("risk_owner", True, False),
        ("risk_owner", False, True),
        ("auditor", False, False),
    ],
)
async def test_privilege_tier_matches_legacy_ladder(
    db_session, scenario_key, user_role, is_primary, is_requester, approval_factory
):
    user, approval = approval_factory(role=user_role, scenario=scenario_key,
                                       primary=is_primary, requester=is_requester)
    tier = await resolve_approval_privilege_tier(db_session, user, approval)
    assert isinstance(tier, ApprovalPrivilegeTier)
    # Legacy ladder reproduction: the four call sites that currently hand-roll
    # (assert_can_approve / _assert_can_reject / get_approval_request / queue.queries)
    # must all produce the same triplet now.
    from app.core.permissions import can_resolve_approvals
    from app.services.approval_scenario_policy import (
        scenario_allows_privileged_resolution,
        user_matches_approval_scenario_role,
    )
    assert tier.is_privileged == can_resolve_approvals(user)
    assert tier.scenario_match == (
        user_matches_approval_scenario_role(approval, user)
        if approval.scenario_approver_roles is not None else None
    )
    assert tier.privileged_scenario_match == scenario_allows_privileged_resolution(approval, user)
    assert tier.is_primary_approver == is_primary
    assert tier.is_requester == is_requester
```

RED at HEAD — `resolve_approval_privilege_tier` does not exist.

#### Test B — AST-based structural lock (Phase 4 correction; NOT string-search)

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_can_resolve_approvals_only_in_policy_or_permissions() -> None:
    """S6.6: AST-scan lock — `can_resolve_approvals(...)` Call nodes only inside
    approval_scenario_policy.* and core.permissions.*. Future-proof against new
    files (Phase 4 found per-file string-search fragile)."""
    import ast
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    BACKEND_APP = REPO / "backend" / "app"
    ALLOWED = {
        "backend/app/services/approval_scenario_policy.py",
        "backend/app/core/_permissions/evaluation.py",
        "backend/app/core/permissions.py",
    }
    offenders: list[str] = []
    for py in BACKEND_APP.rglob("*.py"):
        rel = str(py.relative_to(REPO))
        if rel in ALLOWED:
            continue
        try:
            tree = ast.parse(py.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            # ast.Call where func is Name('can_resolve_approvals') OR
            # Attribute(attr='can_resolve_approvals')
            if isinstance(node, ast.Call):
                fn = node.func
                name = (
                    fn.id if isinstance(fn, ast.Name)
                    else fn.attr if isinstance(fn, ast.Attribute)
                    else None
                )
                if name == "can_resolve_approvals":
                    offenders.append(f"{rel}:{node.lineno}")
    assert not offenders, (
        "S6.6: can_resolve_approvals() must only be called from approval_scenario_policy "
        "or core.permissions. Offenders:\n  " + "\n  ".join(offenders)
    )


def test_resolve_approval_privilege_tier_canonical() -> None:
    """S6.6: helper exported from approval_scenario_policy."""
    import importlib
    policy = importlib.import_module("app.services.approval_scenario_policy")
    assert hasattr(policy, "resolve_approval_privilege_tier")
    assert hasattr(policy, "ApprovalPrivilegeTier")
```

RED at HEAD — current code has 25 offending sites; helper does not exist.

### Production edits

#### Helper introduction

`backend/app/services/approval_scenario_policy.py` — append after line :142 (`can_view_approval_resource`):

```python
@dataclass(frozen=True)
class ApprovalPrivilegeTier:
    is_privileged: bool
    is_primary_approver: bool
    is_requester: bool
    scenario_match: bool | None
    privileged_scenario_match: bool | None


async def resolve_approval_privilege_tier(
    db: AsyncSession, user: User, approval: ApprovalRequest
) -> ApprovalPrivilegeTier:
    """Single source of truth for approval-resolution authorization tier."""
    from app.core.permissions import can_resolve_approvals  # internal authority
    return ApprovalPrivilegeTier(
        is_privileged=can_resolve_approvals(user),
        is_primary_approver=(approval.primary_approver_id == user.id),
        is_requester=(approval.requester_id == user.id),
        scenario_match=user_matches_approval_scenario_role(approval, user),
        privileged_scenario_match=scenario_allows_privileged_resolution(approval, user),
    )
```

#### Call-site migration (25 sites across 16 files)

Each site replaces `can_resolve_approvals(current_user)` (or `can_resolve_approvals(user)`) with reading `tier.is_privileged` from a single `tier = await resolve_approval_privilege_tier(db, current_user, approval)` invocation per scope. Drop `from app.core.permissions import can_resolve_approvals` from each migrated file (keep only in `approval_scenario_policy.py` and `core.permissions`).

| File | Line(s) | Notes |
|---|---|---|
| `backend/app/api/v1/endpoints/approvals/detail.py` | :47 | replace 4 hand-rolled booleans with single tier lookup |
| `backend/app/api/v1/endpoints/notifications.py` | :127 | bare `is_privileged` read |
| `backend/app/api/v1/endpoints/users/summary.py` | :26 | bare `is_privileged` read |
| `backend/app/services/_approval_execution/authorization.py` | :30 | replace 5 booleans with the helper |
| `backend/app/services/_approval_queue/counts.py` | :12 | same |
| `backend/app/services/_approval_queue/queries.py` | :28, :33 | adjust the f-string log line at :28 to read `tier.is_privileged` |
| `backend/app/services/_authorization_capabilities/approvals.py` | :15 | same |
| `backend/app/services/_authorization_capabilities/controls.py` | :54 | same (cross-domain — Risks/Controls owner) |
| `backend/app/services/_authorization_capabilities/kris.py` | :74 | same (cross-domain — KRIs owner) |
| `backend/app/services/_authorization_capabilities/risks.py` | :54 | same (cross-domain — Risks owner) |
| `backend/app/services/_entity_mutation_lifecycle/approval_plans.py` | :69, :162, :267 | same (cross-domain — mutation flow) |
| `backend/app/services/_entity_mutation_lifecycle/archive_plans.py` | :110, :186, :255 | same (cross-domain — mutation flow) |
| `backend/app/services/_kri_history/governance.py` | :238 | same (cross-domain — KRI) |
| `backend/app/services/_kri_history/intake.py` | :42 | same (cross-domain — KRI) |
| `backend/app/services/approval_execution_service.py` | :116, :222, :235, :237 | collapse the four predicate calls into one helper invocation per function |
| `backend/app/services/notification_visibility.py` | :78, :207 | same |

Total: **25 sites in 16 files** (verified via AST scan today).

`backend/app/core/permissions.py` and `backend/app/core/_permissions/evaluation.py:65` keep `can_resolve_approvals` exports — the helper still uses it internally; only consumers outside the policy module are migrated.

### Lock / TOML / contract updates

- New AST-based deepening contract (Test B above) added to `test_architecture_deepening_contracts.py`.
- **§Vocabulary edit at `docs/security/authorization-capability-contract.md:43-54`** (Phase 4 correction — NOT line :119). Append a table row:

```markdown
| Privilege tier | Resolved per-approval boolean fivefold (`is_privileged`, `is_primary_approver`, `is_requester`, `scenario_match`, `privileged_scenario_match`) returned by `approval_scenario_policy.resolve_approval_privilege_tier`. |
```

- Re-emit `docs/security/authorization-capability-contract.json` so `python3 scripts/security/validate_authz_capability_contract.py` passes.
- AUTHZ-APPROVALS row at line :119 — extend the `Service policy` cell to cite `resolve_approval_privilege_tier` alongside the existing `approval_scenario_policy.py` reference.
- No `_endpoint_commit_allowlist.toml` ratchet (no new `db.commit` introduced).
- No `_capabilities_all_allowlist.toml` change (no new resource/action pair).
- No `_naming_allowlist.toml` change.

### README / doc updates

- `docs/security/authorization-capability-contract.md:43-54` (§Vocabulary): row above.
- `docs/security/authorization-capability-contract.md:119` AUTHZ-APPROVALS Service-policy column: reference helper.
- `backend/app/services/_approval_execution/README.md`, `backend/app/services/_approval_queue/README.md`, `backend/app/services/_entity_mutation_lifecycle/README.md`, `backend/app/services/_kri_history/README.md` — if they enumerate authorization predicates, cross-reference helper.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_privilege_tier.py
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_w1_privileged_escalation_red.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k "resolve_approval_privilege_tier or can_resolve_approvals_only"
python3 scripts/security/validate_authz_capability_contract.py
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE migration commit `refactor(approvals): centralize privilege-tier resolution via resolve_approval_privilege_tier`. RED tests + helper introduction + 25-site migration + doc updates in same commit. Phase 4's effort revision: **XL (28-32h)** — 25 sites × ~30min decision time + dataclass design + parametric matrix + AST-scan test + 2 review rounds + doc/json round-trip.

**Rollback.** Largest in-domain diff (16 files). Revert restores per-site predicates verbatim. No schema, capability surface, or wire-format change.

**Effort.** **XL (28-32h)** (Phase 4 correction; Loop 1 said M).

---

## Item #54 — S6.3 — INLINE `_approval_queue/lifecycle.py`

**Disposition.** Inline `backend/app/services/_approval_queue/lifecycle.py` (17 lines of pure re-exports) into `backend/app/services/_approval_queue/__init__.py`. Delete `lifecycle.py`. Rewrite 3 deepening contract tests in the same commit:
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1005` — `test_approval_queue_routes_use_queue_lifecycle_module`.
- `:1025` — `test_approval_queue_lifecycle_uses_service_owned_helpers`.
- `:1041` — `test_approval_queue_lifecycle_delegates_intake_query_projection`.

**Dependencies.** None in-domain. Independent of #18 (different surfaces). Independent of #34/#60 (#54 is a soft, non-blocking prerequisite for clean package boundary; sequence #34 → #54 → #60 if interleaving).

**Cross-domain prerequisites.** None.

**TDD shape.** Structural assertion. The 3 existing deepening tests are the test-surface owners; they must be rewritten to anchor `app.services._approval_queue` (the package) rather than the `lifecycle` submodule.

### Failing tests (RED)

In the same commit, **rewrite** the 3 deepening tests at `test_architecture_deepening_contracts.py:1005, :1025, :1041`:

#### `:1005` — rewrite

```python
def test_approval_queue_routes_use_queue_lifecycle_module() -> None:
    """S6.3: routes consume the package directly; no `lifecycle` indirection."""
    import inspect
    from app.api.v1.endpoints.approvals import queue, resolve
    from app.services import _approval_queue as queue_pkg
    assert hasattr(queue_pkg, "ApprovalQueuePage")
    assert hasattr(queue_pkg, "ApprovalQueueProjection")
    assert hasattr(queue_pkg, "ApprovalRequestIntakePlan")
    route_source = inspect.getsource(queue) + inspect.getsource(resolve)
    assert "from app.services._approval_queue" in route_source
    assert "from app.services._approval_queue.lifecycle" not in route_source
```

#### `:1025` — rewrite

```python
def test_approval_queue_lifecycle_uses_service_owned_helpers() -> None:
    """S6.3: package __init__ imports leaf submodules; no lifecycle aggregator."""
    import inspect
    from app.services import _approval_queue as queue_pkg
    package_source = inspect.getsource(queue_pkg)
    assert "from .contracts import" in package_source
    assert "from .counts import" in package_source
    assert "from .execution import" in package_source
    assert "from .queries import" in package_source
    assert "from .lifecycle" not in package_source
```

#### `:1041` — rewrite

```python
def test_approval_queue_lifecycle_delegates_intake_query_projection() -> None:
    """S6.3: __init__ never inlines write-side logic; banned strings stay banned."""
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    src = (REPO / "backend/app/services/_approval_queue/__init__.py").read_text()
    BANNED = ("create_approval_request_with_audit", "select(ApprovalRequest)",
              "def _build_delete_intake_plan", "def _approval_queue_page")
    for token in BANNED:
        assert token not in src, f"S6.3: banned token {token!r} found in package init"
```

These rewrites are RED at HEAD against the deletion (because `lifecycle.py` still exists and `__init__.py` re-imports from it); GREEN once `lifecycle.py` is gone and `__init__.py` carries the leaf imports.

### Production edits

1. `backend/app/services/_approval_queue/__init__.py` — replace the current `from .lifecycle import (...)` block with the 4 leaf imports verbatim from `lifecycle.py:3-6`:
   ```python
   from .contracts import ApprovalQueuePage, ApprovalQueueProjection, ApprovalRequestIntakePlan
   from .counts import count_pending_approval_queue
   from .execution import create_delete_approval_request
   from .queries import list_approval_queue_page, list_my_approval_queue_page
   ```
   Keep the existing `__all__` list (already correct and identical).
2. Delete `backend/app/services/_approval_queue/lifecycle.py`.

### Lock / TOML / contract updates

- 3 deepening tests rewritten as above.
- No TOML allowlist anchors `lifecycle.py`.

### README / doc updates

- `backend/app/services/_approval_queue/README.md` — drop any reference to `lifecycle.py`.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -x
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `refactor(approvals): inline _approval_queue/lifecycle into package __init__`. Test rewrites + import migration + file deletion in same commit.

**Rollback.** Revert restores `lifecycle.py`, original `__init__.py` indirection, and original deepening test bodies.

**Effort.** S.

---

## Item #60 — S6.6 — `PrivilegeContext` via `Depends(get_privilege_context)`

**Disposition.** **Backend-only** (Loop B confirmed no FE prereq). Add a request-scoped privilege object via `Depends(...)` in `backend/app/api/deps.py` returning a frozen dataclass derived from `current_user`, cached on `request.state` for the lifetime of one request. Migrate the 8+ recomputation sites in `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/{queries,counts}.py` (all already migrated to `resolve_approval_privilege_tier` in #34) to consume the request-scoped facade where they have access to a FastAPI `Request`.

**Dependencies.** **#34 must land first** (helper must exist; #60 wraps it). **2-week separation between #34 and #60** to soak the 16-file migration before layering FastAPI Depends.

**Cross-domain prerequisites.** None.

**TDD shape.** Structural assertion + behavioral regression (single-request idempotency).

### Failing tests (RED)

#### Test A — Depends injection + once-per-request caching

New file `tests/backend/pytest/test_privilege_context.py`:

```python
"""S6.6: PrivilegeContext request-scoped Depends layered over privilege tier."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

from app.api.deps import PrivilegeContext, get_privilege_context
from app.services.approval_scenario_policy import resolve_approval_privilege_tier

async def test_get_privilege_context_returns_dataclass(client_factory, monkeypatch):
    """Depends-injected PrivilegeContext fields equal the helper's tier."""
    counter = {"calls": 0}
    real = resolve_approval_privilege_tier
    async def counting(*args, **kw):
        counter["calls"] += 1
        return await real(*args, **kw)
    monkeypatch.setattr(
        "app.services.approval_scenario_policy.resolve_approval_privilege_tier",
        counting,
    )
    async with client_factory() as client:
        r = await client.get("/api/v1/users/me/summary")
    assert r.status_code == 200
    assert counter["calls"] == 1, "PrivilegeContext must be computed once per request"

def test_privilege_context_dataclass_shape():
    assert PrivilegeContext.__dataclass_fields__.keys() >= {"is_resolver"}
```

RED at HEAD — `get_privilege_context` and `PrivilegeContext` do not exist.

#### Test B — AST-scan structural lock (extends #34's lock)

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_get_privilege_context_canonical() -> None:
    """S6.6: PrivilegeContext + get_privilege_context exported from app.api.deps."""
    import importlib
    deps = importlib.import_module("app.api.deps")
    assert hasattr(deps, "PrivilegeContext")
    assert hasattr(deps, "get_privilege_context")


def test_capabilities_consume_privilege_context_when_available() -> None:
    """S6.6: capabilities modules accept optional `privilege` param to skip recompute."""
    import inspect
    from app.services._authorization_capabilities import approvals, risks, controls, kris
    for mod in (approvals, risks, controls, kris):
        src = inspect.getsource(mod)
        assert "PrivilegeContext" in src, (
            f"{mod.__name__} must reference PrivilegeContext for request-scoped reuse"
        )
```

RED at HEAD — `PrivilegeContext` does not exist; capabilities modules do not import it.

### Production edits

1. `backend/app/api/deps.py` — add:

```python
from dataclasses import dataclass
from fastapi import Request

@dataclass(frozen=True)
class PrivilegeContext:
    is_resolver: bool

async def get_privilege_context(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> PrivilegeContext:
    """Request-scoped privilege facade. Caches one tier resolution on request.state."""
    cached = getattr(request.state, "_privilege_context", None)
    if cached is not None:
        return cached
    from app.core.permissions import can_resolve_approvals
    ctx = PrivilegeContext(is_resolver=can_resolve_approvals(current_user))
    request.state._privilege_context = ctx
    return ctx
```

2. Endpoints already using approval permission checks (`detail.py:47`, `notifications.py:127`, `users/summary.py:26`, plus any other `Depends`-graph callers) accept the new `Depends(get_privilege_context)` and read `privilege.is_resolver` instead of recomputing via the helper directly.

3. `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/{queries,counts}.py` accept an optional `privilege: PrivilegeContext | None = None` parameter (default `None`). When provided, read `privilege.is_resolver`; when absent, fall through to `resolve_approval_privilege_tier` (preserves service-layer call sites that have no FastAPI `Request`).

4. `backend/app/services/approval_scenario_policy.py` continues to host `resolve_approval_privilege_tier` — `get_privilege_context` is a FastAPI-thin wrapper layered above the helper.

### Lock / TOML / contract updates

- New deepening assertions (Test B above).
- **§Vocabulary edit at `docs/security/authorization-capability-contract.md:43-54`** (Phase 4 correction — same correction as #34, NOT line :119). Append:

```markdown
| Privilege context | Request-scoped FastAPI dependency `app.api.deps.get_privilege_context` returning a `PrivilegeContext` cached on `request.state` so a single HTTP request resolves the privilege tier exactly once. |
```

- Re-emit `docs/security/authorization-capability-contract.json`; re-run `python3 scripts/security/validate_authz_capability_contract.py`.
- AUTHZ-APPROVALS row at line :119 — extend `Backend guard` cell to cite `Depends(get_privilege_context)`.
- No `_endpoint_commit_allowlist.toml` ratchet (no new commits).
- No `_capabilities_all_allowlist.toml` change.

### README / doc updates

- `docs/security/authorization-capability-contract.md:43-54` (§Vocabulary): row above.
- `docs/security/authorization-capability-contract.md:119` AUTHZ-APPROVALS Backend-guard column: cite `Depends(get_privilege_context)`.
- `backend/app/api/README.md` (if exists) — note the new request-scoped Depends.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_privilege_context.py tests/backend/pytest/test_approval_privilege_tier.py tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k privilege_context
python3 scripts/security/validate_authz_capability_contract.py
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `feat(approvals): request-scoped PrivilegeContext via Depends(get_privilege_context)`. RED tests + Depends factory + 8+ migration sites + doc updates + JSON round-trip in same commit. **Land 2 weeks after #34** so the migration soaks.

**Rollback.** Largest authorization-pathway change after #34. Revert restores per-call `resolve_approval_privilege_tier` invocations; capability surface and HTTP responses unchanged.

**Effort.** M.

---

## Item #75 — Bonus — DELETE-AND-CONSOLIDATE `_auto_reject_kri_approval`

**Disposition.** Move the byte-identical 2-line `_auto_reject_kri_approval` (currently duplicated at `backend/app/services/_approval_execution/kri_history_correction.py:23` and `kri_value_submission.py:23`) into a single home. **Recommended host: `backend/app/services/_approval_execution/results.py`** (where `SideEffectResult.auto_rejected` already lives — both duplicates already `from .results import SideEffectResult` at line :18). Export as module-level `def auto_reject_kri_approval(approval, reason) -> SideEffectResult` (drop the leading underscore since it now crosses module boundaries). Repoint:
- 5 callers in `kri_history_correction.py:50, 56, 67, 78, 119`.
- 1 caller in `kri_value_submission.py:97`.

Alternative co-location `_approval_execution/auto_reject.py` (new module) is acceptable but `results.py` is the better fit because `SideEffectResult.auto_rejected` is the only logic the helper wraps (Phase 4 prompt cited both options; `results.py` chosen for proximity).

**Dependencies.** None. Independent of #7/#9/#18/#33/#34/#54/#60.

**Cross-domain prerequisites.** None.

**TDD shape.** Structural assertion + behavioral parametric regression.

### Failing tests (RED)

#### Test A — structural

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_auto_reject_kri_approval_consolidated() -> None:
    """Bonus: byte-identical duplicates removed; canonical lives in results."""
    import importlib
    history = importlib.import_module("app.services._approval_execution.kri_history_correction")
    submission = importlib.import_module("app.services._approval_execution.kri_value_submission")
    results = importlib.import_module("app.services._approval_execution.results")
    assert not hasattr(history, "_auto_reject_kri_approval"), (
        "Bonus: duplicate must be deleted from kri_history_correction"
    )
    assert not hasattr(submission, "_auto_reject_kri_approval"), (
        "Bonus: duplicate must be deleted from kri_value_submission"
    )
    assert hasattr(results, "auto_reject_kri_approval"), (
        "Bonus: canonical helper must live in _approval_execution.results"
    )
```

RED at HEAD — both duplicates exist; canonical does not.

#### Test B — behavioral parity

Extend `tests/backend/pytest/test_approval_side_effect_dispatch.py` with parametrized cases that exercise both auto-reject paths (history correction stale + value submission stale) and assert `SideEffectResult.outcome == SideEffectOutcome.AUTO_REJECTED` and `.reason` propagates through `apply_auto_rejection`. Use `client_factory` for any HTTP integration.

### Production edits

1. `backend/app/services/_approval_execution/results.py` — append:
   ```python
   def auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
       return SideEffectResult.auto_rejected(reason)
   ```
   (`ApprovalRequest` already imported at top of file; verify.)
2. `backend/app/services/_approval_execution/kri_history_correction.py` — delete lines 23-24 (`def _auto_reject_kri_approval(...)`); replace 5 call sites at lines 50, 56, 67, 78, 119 with `auto_reject_kri_approval(...)`; merge the new symbol into the existing `from .results import SideEffectResult` import at line :18: `from .results import SideEffectResult, auto_reject_kri_approval`.
3. `backend/app/services/_approval_execution/kri_value_submission.py` — same: delete lines 23-24; replace caller at line 97; merge import at line :18.

### Lock / TOML / contract updates

- New structural assertion above.
- No TOML allowlist anchors.

### README / doc updates

- `backend/app/services/_approval_execution/README.md` (if exists) — list `auto_reject_kri_approval` under canonical helpers.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_side_effect_dispatch.py tests/backend/pytest/test_approval_edit_apply.py tests/backend/pytest/test_pending_kri_approval_preflight.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `refactor(approvals): consolidate auto_reject_kri_approval in _approval_execution.results`.

**Rollback.** Revert restores both duplicates; outcome semantics unchanged.

**Effort.** S.

---

## Item #42 — BE-N2 — `ActorPayloadModel(OutboxPayloadModel)` shared base

**Disposition.** Insert `ActorPayloadModel(OutboxPayloadModel)` carrying `actor_user_id: int` into `backend/app/services/outbox/payloads.py`. Migrate the 6 actor-bearing payload classes to inherit from it (drop their duplicate `actor_user_id: int` field declarations). Three approval payloads (`ApprovalRequestCreatedPayload`, `ApprovalRequestResolvedPayload`, `ApprovalRequestCancelledPayload`) retain direct `OutboxPayloadModel` inheritance — they have no `actor_user_id` (cancelled has `cancelled_by_user_id` instead).

**Dependencies.** None. Independent leaf.

**Cross-domain prerequisites.** None. The outbox lock at `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` scans CALL SITES (`OutboxService.enqueue(...)` keyword args), not payload classes — base-class introduction is invisible.

**TDD shape.** Structural assertion (Pydantic field inheritance + `__mro__`).

### Failing test (RED)

New file `tests/backend/pytest/test_outbox_actor_payload_base_red.py`:

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
    """Approval payloads have no actor_user_id field — must NOT inherit ActorPayloadModel."""
    assert ActorPayloadModel not in cls.__mro__
```

RED at HEAD — `ActorPayloadModel` does not exist; current 6 actor classes inherit `OutboxPayloadModel` directly.

### Production edits

1. `backend/app/services/outbox/payloads.py` — insert after line :13:

```python
class ActorPayloadModel(OutboxPayloadModel):
    """Shared base for outbox payloads that carry the acting user's id."""
    actor_user_id: int
```

2. Same file, lines 30-61 — rewrite 6 classes' bases:
   - `IssueAssignedPayload(OutboxPayloadModel)` → `IssueAssignedPayload(ActorPayloadModel)` (drop `actor_user_id: int` field at :33).
   - `IssueExceptionRequestedPayload(OutboxPayloadModel)` → `IssueExceptionRequestedPayload(ActorPayloadModel)` (drop :38).
   - `IssueExceptionApprovedPayload(OutboxPayloadModel)` → `IssueExceptionApprovedPayload(ActorPayloadModel)` (drop :43).
   - `QuestionnaireSentPayload(OutboxPayloadModel)` → `QuestionnaireSentPayload(ActorPayloadModel)` (drop :50).
   - `QuestionnaireSubmittedPayload(OutboxPayloadModel)` → `QuestionnaireSubmittedPayload(ActorPayloadModel)` (drop :55).
   - `QuestionnaireClarificationRequestedPayload(OutboxPayloadModel)` → `QuestionnaireClarificationRequestedPayload(ActorPayloadModel)` (drop :61).
3. Same file, `__all__` block at :105-121 — add `"ActorPayloadModel"`.
4. Three approval payloads (`ApprovalRequestCreatedPayload:16`, `ApprovalRequestResolvedPayload:20`, `ApprovalRequestCancelledPayload:25`) UNCHANGED — they remain `OutboxPayloadModel` direct subclasses.

### Lock / TOML / contract updates

- None. Outbox call-site lock at `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` unaffected.

### README / doc updates

None — internal Pydantic refactor, not a contract surface change.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_outbox_actor_payload_base_red.py
cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `refactor(outbox): introduce ActorPayloadModel shared base for actor-bearing payloads`. RED test + base introduction + 6 inheritance edits + `__all__` update in same commit.

**Rollback.** Pydantic field declarations are class-level. Reverting collapses 6 inheritance lines and restores duplicated `actor_user_id: int` declarations. Zero data implication; serialized payloads unchanged.

**Effort.** S.

---

## Item #44 — BE-N6 — Centralize guarded path-prefix registry

**Disposition.** Add a registry data structure (TOML) that maps `module_name → {prefix, tags, dual_router?}` and lock it via architecture test. **27 `include_router` calls** at `backend/app/api/v1/router.py:34-60` (Phase 4 verified count). **`risk_questionnaires` is registered TWICE** at `:44` (`.risk_router` under `/risks` tag) and `:60` (`.router` under `/questionnaires` tag) — registry **must support `dual_router = true`** for that module. Optional follow-up: refactor `router.py` to read the registry and emit `include_router` calls in a loop. Phase 5 ships **registry + lock first**; refactor deferred to a follow-up commit.

**Dependencies.** None.

**Cross-domain prerequisites.** Must not weaken `tests/backend/pytest/architecture/test_w3_gate_snapshot.py` (4 `(method, path) → capability` mappings).

**TDD shape.** Registry-existence + parity. Walk `api_router.routes` and assert prefix/tag set equality with the registry.

### Failing test (RED)

New file `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`:

```python
"""BE-N6: router prefix registry parity with api_router.routes."""
from __future__ import annotations
import pytest
pytestmark = pytest.mark.contract

import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
REGISTRY_PATH = REPO / "backend/app/api/v1/_router_registry.toml"


def test_registry_file_exists() -> None:
    assert REGISTRY_PATH.exists(), "BE-N6: registry must live at app/api/v1/_router_registry.toml"


def _load_registry() -> dict:
    return tomllib.loads(REGISTRY_PATH.read_text())


def test_registry_covers_all_includes() -> None:
    """For every entry in router.py include_router, registry has matching row.
    Dual-router modules emit two registry rows tagged with `dual_router = true`."""
    from app.api.v1.router import api_router
    registry = _load_registry()
    # Collect (prefix, tags-tuple) pairs from all mounted sub-routers.
    actual: set[tuple[str, tuple[str, ...]]] = set()
    for route in api_router.routes:
        # FastAPI route APIs vary; pull path/methods/tags safely.
        path = getattr(route, "path", "")
        tags = tuple(sorted(getattr(route, "tags", []) or []))
        # Bucket each route under its top-level prefix segment (e.g. /risks/...)
        prefix = "/" + path.lstrip("/").split("/", 1)[0] if path != "/" else ""
        actual.add((prefix, tags))
    declared: set[tuple[str, tuple[str, ...]]] = set()
    for entry in registry.get("modules", []):
        declared.add((entry["prefix"], tuple(sorted(entry["tags"]))))
        if entry.get("dual_router"):
            # dual entries declare both prefix/tags pairs explicitly under dual_routes
            for dual in entry.get("dual_routes", []):
                declared.add((dual["prefix"], tuple(sorted(dual["tags"]))))
    missing_in_registry = actual - declared
    extra_in_registry = declared - actual
    assert not missing_in_registry, f"BE-N6: routes missing from registry: {missing_in_registry}"
    assert not extra_in_registry, f"BE-N6: registry has stale entries: {extra_in_registry}"


def test_dual_router_supported() -> None:
    """risk_questionnaires must be declared as a dual-router module."""
    registry = _load_registry()
    rq = next(
        (m for m in registry["modules"] if m["module"] == "risk_questionnaires"),
        None,
    )
    assert rq is not None, "registry missing risk_questionnaires"
    assert rq.get("dual_router") is True, "risk_questionnaires must set dual_router = true"
    assert len(rq.get("dual_routes", [])) == 2, "risk_questionnaires has 2 routers"
```

RED at HEAD — registry file does not exist.

### Production edits

Create `backend/app/api/v1/_router_registry.toml` with **25 logical entries covering all 27 `include_router` calls** (24 single-router + 1 dual = 25 logical, but 27 mounted routers because the dual contributes 2). Each entry declares `module`, `prefix` (or `prefix_owner = "module" | "aggregator"`), `tags`, and optional `dual_router = true` with a `dual_routes` array.

```toml
# backend/app/api/v1/_router_registry.toml
# Lock for BE-N6: enumerates every include_router call in app/api/v1/router.py.
# Updates here MUST be paired with updates in router.py (architecture test enforces parity).

[[modules]]
module = "health"
prefix = ""
tags = ["health"]

[[modules]]
module = "auth"
prefix = "/auth"
tags = ["auth"]

[[modules]]
module = "users"
prefix = "/users"
tags = ["users"]

[[modules]]
module = "access"
prefix = "/access"
tags = ["access"]

[[modules]]
module = "controls"
prefix = "/controls"
tags = ["controls"]

[[modules]]
module = "risks"
prefix = "/risks"
tags = ["risks"]

[[modules]]
module = "issues"
prefix_owner = "module"   # router carries its own prefix
tags = ["issues"]

[[modules]]
module = "vendors"
prefix = "/vendors"
tags = ["vendors"]

[[modules]]
module = "vendor_links"
prefix_owner = "module"
tags = ["vendor-links"]

[[modules]]
module = "vendor_reports"
prefix_owner = "module"
tags = ["vendor-reports"]

# DUAL-ROUTER: risk_questionnaires registers BOTH .risk_router (/risks tag) AND .router (/questionnaires tag).
[[modules]]
module = "risk_questionnaires"
dual_router = true
dual_routes = [
    { router_attr = "risk_router", prefix_owner = "module", tags = ["questionnaires"] },
    { router_attr = "router",      prefix_owner = "module", tags = ["questionnaires"] },
]

[[modules]]
module = "dashboard"
prefix = "/dashboard"
tags = ["dashboard"]

[[modules]]
module = "departments"
prefix = "/departments"
tags = ["departments"]

[[modules]]
module = "reports"
prefix = "/reports"
tags = ["reports"]

[[modules]]
module = "executions"
prefix = "/executions"
tags = ["executions"]

[[modules]]
module = "kris"
prefix_owner = "module"
tags = ["kris"]

[[modules]]
module = "approvals"
prefix = "/approvals"
tags = ["approvals"]

[[modules]]
module = "notifications"
prefix = "/notifications"
tags = ["notifications"]

[[modules]]
module = "admin"
prefix = "/admin"
tags = ["admin"]

[[modules]]
module = "directory"
prefix_owner = "module"
tags = ["directory"]

[[modules]]
module = "orphaned_items"
prefix = "/orphaned-items"
tags = ["governance"]

[[modules]]
module = "lookups"
prefix = "/lookups"
tags = ["lookups"]

[[modules]]
module = "activity_log"
prefix = "/activity-log"
tags = ["activity-log"]

[[modules]]
module = "riskhub"
prefix = "/riskhub"
tags = ["riskhub"]

[[modules]]
module = "riskhub_questionnaires"
prefix_owner = "module"
tags = ["questionnaires"]

[[modules]]
module = "preferences"
prefix_owner = "module"
tags = ["preferences"]
```

(Refactor `router.py` to a registry-driven loop is a follow-up commit; Phase 5 ships TOML + parity test only — Loop 1 explicit deferral at `plan-loop-1-07-endpoints.md:435-436`.)

### Lock / TOML / contract updates

- New TOML registry under `backend/app/api/v1/_router_registry.toml` (the lock target).
- New architecture test above (`pytestmark = pytest.mark.contract`).

### README / doc updates

- Add an "Endpoint registry" subsection in `backend/app/api/v1/endpoints/README.md` referencing the new TOML and the lock test.

### Verification

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_router_prefix_registry_red.py
cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_w3_gate_snapshot.py
make -f scripts/Makefile test-architecture-locks
```

**Commit boundary.** ONE commit `feat(api): centralize guarded path-prefix registry`. RED test + TOML registry + README subsection in same commit.

**Rollback.** Pure additive metadata + parity test. Revert removes both. No production-routing change.

**Effort.** M.

---

## Domain dependency graph (this recipe set)

```
Free-order pool (any time, any order):
  ┌────────────────────────────────────┐
  │ #7   endpoint shim DELETE     S    │
  │ #18  build_approval_read R&D  S    │
  │ #33  banner UNIFY (FE)        S    │
  │ #54  lifecycle.py INLINE      S    │
  │ #75  auto_reject_kri DEDUP    S    │
  │ #42  ActorPayloadModel base   S    │
  │ #44  router prefix registry   M    │
  └────────────────────────────────────┘

Hub wave (additive, three commits, separated):
  ┌──────────────────────┐
  │ #9   can_view_*  S   │  ── first commit
  └──────────┬───────────┘
             │ (commit lands)
             ▼
  ┌──────────────────────┐
  │ #34  privilege tier  │  ── second commit  (XL: 28-32h, 25 sites / 16 files)
  │      EXTRACT    XL   │
  └──────────┬───────────┘
             │ ★ 2-week separation ★ (Phase 4 cohesion guidance)
             ▼
  ┌──────────────────────┐
  │ #60  PrivilegeContext│  ── third commit  (M, backend-only)
  │      Depends    M    │
  └──────────────────────┘
```

---

## Cross-domain handoff notes

- **#34 + #60 single ownership.** This recipe is the SINGLE OWNER of migrating `can_resolve_approvals(current_user)` away from per-site predicates. R/C/K domain recipes MUST NOT also queue migrations of `_authorization_capabilities/{risks,controls,kris}.py:54/54/74`, `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py`, or `_kri_history/{governance,intake}.py:238/42`. AST-scan lock (Test B in #34) prevents drift across domains.
- **#34 + #60 §Vocabulary edit.** Both items append rows to `docs/security/authorization-capability-contract.md:43-54` (Phase 4 correction — NOT line :119 which is the AUTHZ-APPROVALS row). Both items also append surface-level info to the AUTHZ-APPROVALS row at :119 (Service-policy column for #34; Backend-guard column for #60). JSON mirror must be re-emitted; validator must pass after each commit.
- **#42 outbox-base.** `OutboxService.enqueue` lock at `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` is unaffected — base-class change is invisible. #63 (out-of-cluster outbox dispatch tracking) consumes `ActorPayloadModel` after #42 lands.
- **#44 router registry.** Lock test must NOT weaken `architecture/test_w3_gate_snapshot.py` (4 `(method, path) → capability` mappings). Refactor of `router.py` to registry-driven loop deferred to follow-up commit (Loop 1 :435-436).
- **#54 deepening tests.** This recipe is the SINGLE OWNER of `test_architecture_deepening_contracts.py:1005, :1025, :1041` rewrites. Other recipes must NOT touch those three tests.
- **#7 + #18 shared file.** Both edit `backend/app/api/v1/endpoints/approvals/_shared.py`. Two separate commits — either lands first; the other yields a smaller `_shared.py`. Endpoints domain recipe (#44) must NOT also queue these deletions.
- **#33 frontend invariant test.** `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` is untouched by this recipe set.
- **#75 auto-reject co-location.** Chosen `_approval_execution/results.py` (not new `auto_reject.py`) because both duplicates already import `SideEffectResult` from `.results` at line :18. Phase 4 prompt left both options open; this is an authored choice — record it.

---

## AST-scan code snippet for #34 (centerpiece)

This is the test body that replaces Phase 4's "fragile" string-search lock. It is future-proof: a new file added in any domain is automatically covered without editing the lock.

```python
def test_can_resolve_approvals_only_in_policy_or_permissions() -> None:
    """S6.6: AST-scan lock — `can_resolve_approvals(...)` Call nodes only inside
    approval_scenario_policy.* and core.permissions.*. Future-proof against new
    files (Phase 4 found per-file string-search fragile)."""
    import ast
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    BACKEND_APP = REPO / "backend" / "app"
    ALLOWED = {
        "backend/app/services/approval_scenario_policy.py",
        "backend/app/core/_permissions/evaluation.py",
        "backend/app/core/permissions.py",
    }
    offenders: list[str] = []
    for py in BACKEND_APP.rglob("*.py"):
        rel = str(py.relative_to(REPO))
        if rel in ALLOWED:
            continue
        try:
            tree = ast.parse(py.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (
                    fn.id if isinstance(fn, ast.Name)
                    else fn.attr if isinstance(fn, ast.Attribute)
                    else None
                )
                if name == "can_resolve_approvals":
                    offenders.append(f"{rel}:{node.lineno}")
    assert not offenders, (
        "S6.6: can_resolve_approvals() must only be called from approval_scenario_policy "
        "or core.permissions. Offenders:\n  " + "\n  ".join(offenders)
    )
```

---

## File-touch summary (all 10 items combined)

| File | Items | Action |
|---|---|---|
| `backend/app/api/v1/endpoints/approvals/_shared.py` | #7, #18 | delete `_get_approval_department_id` (#7), delete `_build_approval_read` (#18) |
| `backend/app/api/v1/endpoints/approvals/resolve.py` | #18 | repoint 3 call sites |
| `backend/app/api/v1/endpoints/approvals/detail.py` | #18, #34, #60 | repoint 1 call site (#18); use `tier` (#34); accept `Depends` (#60) |
| `backend/app/services/_notification_approval_helpers.py` | #9 | delete `can_user_view_approval_resource` |
| `frontend/src/components/kri-form/KRIFormContainer.tsx` | #33 | hoist i18n; switch import |
| `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` | #33 | DELETE |
| `backend/app/services/approval_scenario_policy.py` | #34 | add `ApprovalPrivilegeTier` + `resolve_approval_privilege_tier` |
| 16 backend files (25 sites) | #34 | replace `can_resolve_approvals(current_user)` with helper-driven tier |
| `backend/app/api/v1/endpoints/notifications.py` | #34, #60 | helper (#34); accept `Depends` (#60) |
| `backend/app/api/v1/endpoints/users/summary.py` | #34, #60 | helper (#34); accept `Depends` (#60) |
| `backend/app/services/_approval_queue/__init__.py` | #54 | inline 4 imports |
| `backend/app/services/_approval_queue/lifecycle.py` | #54 | DELETE |
| `backend/app/api/deps.py` | #60 | add `PrivilegeContext` + `get_privilege_context` |
| `backend/app/services/_approval_execution/results.py` | #75 | add `auto_reject_kri_approval` |
| `backend/app/services/_approval_execution/kri_history_correction.py` | #75 | delete duplicate; repoint 5 callers |
| `backend/app/services/_approval_execution/kri_value_submission.py` | #75 | delete duplicate; repoint 1 caller |
| `backend/app/services/outbox/payloads.py` | #42 | add `ActorPayloadModel`; rewrite 6 inheritance lines |
| `backend/app/api/v1/_router_registry.toml` | #44 | NEW — 25 logical entries / 27 routers |
| `backend/app/api/v1/endpoints/README.md` | #44 | add registry subsection |
| `tests/backend/pytest/test_architecture_deepening_contracts.py` | #7, #9, #18, #34, #54, #60, #75 | append assertions; rewrite 3 deepening tests for #54 |
| `tests/backend/pytest/test_approval_privilege_tier.py` | #34 | NEW |
| `tests/backend/pytest/test_privilege_context.py` | #60 | NEW |
| `tests/backend/pytest/test_outbox_actor_payload_base_red.py` | #42 | NEW |
| `tests/backend/pytest/architecture/test_router_prefix_registry_red.py` | #44 | NEW |
| `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx` | #33 | NEW or augment |
| `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts` | #33 | NEW |
| `docs/security/authorization-capability-contract.md` | #34, #60 | §Vocabulary at :43-54 (NEW rows); AUTHZ-APPROVALS at :119 (extend cells) |
| `docs/security/authorization-capability-contract.json` | #34, #60 | re-emit |

---

## Phase 4 corrections incorporated (audit)

- **#34 effort XL (28-32h), not M.** Loop 1 said M; Phase 4 effort-adversarial review (`review-loop-2-06-effort-adversarial.md:48-73`) escalated to XL: 25 sites × 30min + dataclass + parametric matrix + 2 review rounds.
- **#34 AST-scan, not string-search.** Phase 4 test-gaps-adversarial review (`review-loop-2-01-test-gaps-adversarial.md:127-137, :241`) flagged string-search lock as fragile; per-file enumeration misses new files. Recipe ships AST-scan as the centerpiece test.
- **#34 + #60 §Vocabulary edit at :43-54, NOT :119.** Phase 4 correction. The Vocabulary table lives at :43-54; line :119 is the AUTHZ-APPROVALS *row* of the contract table (extended in a separate cell-level edit).
- **#34 site count: 25 (verified by AST scan today), Loop 1 hedged "22+".** Phase 4 test-gaps confirmed grep yields 25 in `backend/app`. Recipe enumerates all 25 explicitly.
- **#44 dual-router for `risk_questionnaires`.** `router.py:44, :60` register two routers from the same module. Registry schema includes `dual_router = true` + `dual_routes` array; lock test specifically asserts this.
- **#44 27 calls, not 28.** Phase 4 verified `grep -c "^api_router\.include_router" router.py == 27`. Recipe TOML enumerates 25 logical entries → 27 mounted routers (24 single + 1 dual = 27).
- **#75 byte-identical 2-line functions co-located in `results.py`.** Phase 4 prompt named `_approval_execution/{kri_history_correction.py:23, kri_value_submission.py:23}` and offered `results.py` OR new `auto_reject.py` — recipe chooses `results.py` because both duplicates already import `SideEffectResult` from `.results` at line :18.
- **2-week separation between #34 and #60.** Phase 4 cohesion soak guidance — large 16-file migration must stabilize before request-scoped Depends lands on top.
- **#9 → #34 → #60 hub-wave additivity.** Loop 1 :18-23 + Loop 2 master sequence preserved; Phase 4 sequence-adversarial review (`review-loop-2-02-sequence-adversarial.md:481`) confirmed 3/3 hub-wave ordering.
- **All architecture/contract tests carry `pytestmark = pytest.mark.contract`.** Loop 2 cohesion correction; the deepening contracts file already declares it at line :9 — appended assertions inherit it.
- **All backend HTTP-level tests use `client_factory`** from `tests/backend/pytest/conftest.py:876`.

End of recipe-03-approvals.
