# Phase 2 Loop A — Verification: Approvals + scenario policy + queue + notification helpers

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Scope: items #7 (C-N1), #9 (S6.5), #18 (S6.2), #33 (S6.4), #34 (S6.6), #54 (S6.3), #60 (S6.6 PrivilegeContext).
Method: read each cited file, confirm caller graph with `grep`, validate developer's note against current code.

Note on path correction: developer notes use `endpoints/approvals/...` shorthand; the real path in this repo is `backend/app/api/v1/endpoints/approvals/...`. All findings below quote the actual path.

---

## Item #7 — C-N1 — Endpoint `_get_approval_department_id` shim delete

- Developer verdict: Accept (P2).
- Phase 2 verdict: CONFIRM.
- Current code state (file:line + ≤15-word quote):
  - `backend/app/api/v1/endpoints/approvals/_shared.py:17` — `async def _get_approval_department_id(db: AsyncSession, approval: ApprovalRequest)`.
  - `backend/app/services/_approval_execution/loading.py:31` — `async def get_approval_department_id(db: AsyncSession, approval: ApprovalRequest)`.
  - Bodies are byte-identical resolver patterns (RISK / CONTROL / KRI → `Risk.department_id`).
  - Caller scan (`grep -rn _get_approval_department_id backend tests`) shows **0 production callers** of the endpoint copy; only its own definition matches.
  - The service-side `get_approval_department_id` is consumed at `services/approval_execution_service.py:84,128,193` and `services/_approval_execution/logging.py:6,16` — 4 active consumers.
- True technical blocker: none. Endpoint helper is a dead copy.
- Final disposition: **DELETE** the endpoint shim `_get_approval_department_id`. Endpoints already do not reach for department resolution; nothing imports it.
- Doc/lock side-effects: none expected; `_endpoint_commit_allowlist.toml` does not anchor this symbol. Verify `_naming_allowlist.toml` for any literal mention before deletion.
- Prerequisites: none.

---

## Item #9 — S6.5 — `can_user_view_approval_resource` duplicate delete

- Developer verdict: Accept w/mod (the duplicate is **service-side**, not endpoint).
- Phase 2 verdict: CONFIRM (developer's redirect is correct).
- Current code state (file:line + ≤15-word quote):
  - Canonical: `backend/app/services/approval_scenario_policy.py:134` — `async def can_view_approval_resource(db, user, approval) -> bool:` returning `can_read_risk_id / can_read_control_id / can_read_kri_id`.
  - Duplicate: `backend/app/services/_notification_approval_helpers.py:72` — `async def can_user_view_approval_resource(db, user, approval) -> bool:` body branches on the same three `ApprovalResourceType` values calling the same `can_read_*_id` helpers.
  - Bodies are functionally identical (only the wrapper function name differs).
  - Caller graph for the canonical (`approval_scenario_policy.can_view_approval_resource`): `endpoints/approvals/detail.py:50`, `services/approval_queue_visibility.py:37`, `services/notification_visibility.py:82`, `services/approval_execution_service.py:235`, `services/_approval_execution/authorization.py:46`, plus test `tests/backend/pytest/test_approval_workflow.py:629`.
  - Caller graph for the duplicate: only `_notification_approval_helpers.py:98` (its own neighbour `eligible_approval_notification_recipients`). Nothing else imports it.
- True technical blocker: none.
- Final disposition: **DELETE** the duplicate at `_notification_approval_helpers.py:72-79` and rewrite line 98 of `eligible_approval_notification_recipients` to call `approval_scenario_policy.can_view_approval_resource`. Phase 1 confirmation that the bodies match is correct.
- Doc/lock side-effects: none. `_notification_approval_helpers.py` is internal; no allowlist references the duplicate symbol.
- Prerequisites: none.

---

## Item #18 — S6.2 — `_build_approval_read` consolidation

- Developer verdict: Accept (P2).
- Phase 2 verdict: CONFIRM.
- Current code state (file:line + ≤15-word quote):
  - Endpoint copy: `backend/app/api/v1/endpoints/approvals/_shared.py:34` — `def _build_approval_read(approval, current_user) -> ApprovalRequestRead:` (62 lines including docstring).
  - Service copy: `backend/app/services/_approval_queue/projection.py:13` — `def build_approval_read(approval, current_user) -> ApprovalRequestRead:` (~27 lines).
  - Both call `approval_capabilities(...)` and `approval_resource_label(...)` then `ApprovalRequestRead.model_validate({...})` with the **same field set** (id, resource_type, resource_id, action_type, pending_changes, status, reason, requested_by_*, resolved_by_*, resolved_at, resolution_notes, created_at, resource_name, can_approve, can_reject, capabilities). The dicts are field-for-field identical.
  - Endpoint callers of the duplicate: `endpoints/approvals/resolve.py:18,61,85,102` and `endpoints/approvals/detail.py:15,56` — 4 call sites + 1 import.
  - Service callers of the canonical: `services/_approval_queue/execution.py:15,47` and `services/_approval_queue/projection.py:44` (its own helper trio).
- True technical blocker: none. The two implementations share the same dependency surface (`approval_capabilities`, `approval_resource_label`, `ApprovalRequestRead`); no cyclic import risk.
- Final disposition: **REPOINT** the 4 endpoint call sites (`resolve.py:61,85,102` + `detail.py:56`) to `services._approval_queue.projection.build_approval_read` and **DELETE** `endpoints/approvals/_shared.py:34-61`.
- Doc/lock side-effects: `tests/backend/pytest/test_architecture_deepening_contracts.py:1029` already locks `hasattr(projection, "build_approval_read")` — repointing reinforces, not breaks, that contract. Confirm `_endpoint_commit_allowlist.toml` does not anchor this name.
- Prerequisites: none.

---

## Item #33 — S6.4 — Approval queued banner unification

- Developer verdict: Accept (P2).
- Phase 2 verdict: CONFIRM.
- Current code state (file:line + ≤15-word quote):
  - `frontend/src/components/forms/ApprovalQueuedBanner.tsx:12` — `export function ApprovalQueuedBanner({ closeLabel, message, onClose, title, viewApprovalsLabel })`.
  - `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx:11` — `export function KriApprovalQueuedBanner({ message, onClose })` (does its own i18n via `useTranslation`).
  - Markup is structurally identical: amber-themed banner div, `Clock` icon, title + message, `Link to="/approvals"` with `CheckCircle`, close button.
  - Difference: the parent variant takes labels via props; the KRI variant inlines `useTranslation('approvals'|'common'|'errorKeys')` and does `errorKeys.` prefix routing on the message string.
  - Consumers: `frontend/src/components/risk-form/RiskFormContainer.tsx`, `frontend/src/components/control-form/ControlFormContainer.tsx` use `ApprovalQueuedBanner`; `frontend/src/components/kri-form/KRIFormContainer.tsx` uses `KriApprovalQueuedBanner`.
- True technical blocker: none. The KRI variant's i18n decision is a parent-side concern that can be hoisted into `KRIFormContainer`.
- Final disposition: **UNIFY** under `ApprovalQueuedBanner` (prop-driven). Update `KRIFormContainer` to compute the resolved `title`/`message`/labels via `useTranslation` itself (handling the `errorKeys.*` prefix path) and pass them through. **DELETE** `KriApprovalQueuedBanner.tsx`.
- Doc/lock side-effects: none server-side. Frontend invariant tests and `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` are unaffected. Update `frontend/src/components/forms/README.md` if it enumerates banner siblings.
- Prerequisites: none.

---

## Item #34 — S6.6 — Privileged-tier resolve authorization helper

- Developer verdict: Accept w/mod (centralize with regression coverage).
- Phase 2 verdict: CONFIRM.
- Current code state (file:line + ≤15-word quote): the same `is_privileged = can_resolve_approvals(current_user)` predicate (and its `not can_resolve_approvals(current_user)` sibling) is repeated across **at least 5 distinct files in the approval flow**, each pairing it with a slightly different scenario-role check:
  - `backend/app/services/_approval_execution/authorization.py:30` — `is_privileged = can_resolve_approvals(current_user)` then `scenario_match` + `privileged_scenario_match` triple in `assert_can_approve`.
  - `backend/app/services/approval_execution_service.py:116` — `is_privileged = can_resolve_approvals(current_user)` in `cancel_request_workflow`.
  - `backend/app/services/approval_execution_service.py:222,235,237` — three `can_resolve_approvals(current_user)` checks in `_assert_can_reject` interleaved with `scenario_match` / `privileged_scenario_match`.
  - `backend/app/api/v1/endpoints/approvals/detail.py:47` — `is_privileged = can_resolve_approvals(current_user)` then `is_scenario_approver = user_matches_approval_scenario_role(...) is True and await can_view_approval_resource(...)`.
  - `backend/app/services/_approval_queue/queries.py:33` — `is_privileged = can_resolve_approvals(current_user)`.
  - `backend/app/services/_approval_queue/counts.py:12` — `if can_resolve_approvals(current_user):`.
  - `backend/app/services/notification_visibility.py:78,207` — same predicate.
  - `backend/app/services/_authorization_capabilities/{approvals,risks,controls,kris}.py` — repeated `is_resolver = can_resolve_approvals(current_user)`.
  - The triple `(is_privileged, scenario_match, privileged_scenario_match)` resolves the same authorization tier across `assert_can_approve` / `_assert_can_reject` / `detail.get_approval_request` with subtle phrasing drift (each writes its own conditional ladder).
- True technical blocker: none. All inputs (`current_user`, `approval`, `db`) are present at every site; the helper signature would be `await resolve_approval_privilege_tier(db, user, approval) -> ApprovalPrivilegeTier`.
- Final disposition: **EXTRACT** a single helper (e.g., `services/approval_scenario_policy.resolve_approval_privilege_tier`) returning the `(is_privileged, scenario_match: bool|None, privileged_scenario_match: bool|None, is_primary_approver, is_requester)` tuple (or a small dataclass). Repoint the 3 hot sites first (`_approval_execution/authorization.py`, `approval_execution_service.py:_assert_can_reject`, `endpoints/approvals/detail.py`) and add a regression test that asserts the same tier across the three flows.
- Doc/lock side-effects: `docs/security/authorization-capability-contract.md` §Vocabulary will gain a "privilege tier" term; adversarial contract tests in `tests/backend/pytest/architecture/` should pin the helper as the sole call point.
- Prerequisites: none for #34 itself; #34 must land before #60 (see below).

---

## Item #54 — S6.3 — Approval queue aggregator deletion

- Developer verdict: Accept (P2).
- Phase 2 verdict: MODIFY → **CONFIRM-INLINE-AGGREGATION** (inline lifecycle into package `__init__`).
- Current code state (file:line + ≤15-px quote):
  - `backend/app/services/_approval_queue/lifecycle.py:1-17` — pure aggregator: `from .contracts import ...`, `from .counts import ...`, `from .execution import ...`, `from .queries import ...`, then a single `__all__` list. No logic.
  - `backend/app/services/_approval_queue/__init__.py:1-19` — already re-exports the same 7 symbols by importing **from `.lifecycle`** (a second hop). So today: `endpoints/approvals/{queue.py:18, resolve.py:13}` import via `from app.services._approval_queue import (...)` → `__init__` → `lifecycle.py` → leaf modules.
  - **Lock test that anchors the `lifecycle` symbol**: `tests/backend/pytest/test_architecture_deepening_contracts.py:1005-1038` — `test_approval_queue_routes_use_queue_lifecycle_module` asserts `lifecycle` has `ApprovalRequestIntakePlan / ApprovalQueuePage / ApprovalQueueProjection`; `test_approval_queue_lifecycle_uses_service_owned_helpers` asserts `inspect.getsource(lifecycle)` contains `from .contracts/.counts/.execution/.queries import`.
- True technical blocker: the lock test is the only "bearer" of the lifecycle module's existence. Per orchestrator note ("Docs/locks are outputs, not constraints"), this lock should be rewritten — not allowed to block the cleanup.
- Final disposition: **DELETE** `lifecycle.py` and move its 4 imports (counts/contracts/execution/queries) directly into `_approval_queue/__init__.py`. **REWRITE** the two lock tests to anchor the package `__init__` (`from app.services._approval_queue import lifecycle as _; assert ...` → `from app.services import _approval_queue; assert hasattr(_approval_queue, "ApprovalRequestIntakePlan")`).
- Doc/lock side-effects: `tests/backend/pytest/test_architecture_deepening_contracts.py:1005-1038` must be updated in the same commit. No TOML allowlist references the file.
- Prerequisites: none. Independent of #18 / #34.

---

## Item #60 — S6.6 PrivilegeContext — request-scoped privilege object

- Developer verdict: Defer (P4).
- Phase 2 verdict: OVERRIDE-DEFER-NOT-VALID.
- Current code state (file:line + ≤15-word quote): no `PrivilegeContext` class exists today. The "context" is currently five-to-eight separate boolean computations recomputed at every call site — see #34 evidence above. There is no AuthContext object in `backend/app/api/deps.py` or `backend/app/core/permissions.py` that this proposal would need to extend; the request-scoped object is a clean addition.
- True technical blocker: none in the AuthContext sense. The real prerequisite is **#34 must land first** so a single helper (`resolve_approval_privilege_tier`) exists; #60 then becomes a thin wrapper that caches the helper's result on the FastAPI `request.state` (or as a `Depends(...)`-injected dataclass) for the lifetime of one request, eliminating the repeated `can_resolve_approvals(current_user)` calls inside `_authorization_capabilities/*`.
- Final disposition: **EXECUTE AFTER #34** (and after the KRI privileged-shim cleanup that hangs off #34). Specifically:
  1. Land #34 (helper exists).
  2. Land #54 (`_approval_queue` aggregator gone — same package gets the new dependency cleanly).
  3. Then introduce `PrivilegeContext` as a `Depends(get_privilege_context)` injectable in `backend/app/api/deps.py` returning a frozen dataclass `(is_resolver, can_view_approvals_globally, scoped_dept_ids)` derived from `current_user`.
  4. Migrate the 8+ recomputation sites in `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/queries.py:33`, `counts.py:12` to consume the context.
- Doc/lock side-effects: `docs/security/authorization-capability-contract.md` gets a "privilege context" section; `_endpoint_commit_allowlist.toml` and `_capabilities_all_allowlist.toml` do **not** need ratchets. A new architecture-lock test should pin "no `can_resolve_approvals(current_user)` outside `services/approval_scenario_policy.py` + `core/permissions.py`" once migration finishes.
- Prerequisites: **#34** (helper extraction); **#54** is a soft prerequisite (clean package boundary) but not blocking. The "Defer" verdict from the developer is rejected — the work is sequenceable, not blocked.

---

## Cross-item summary

| Item | Verdict | Order | Touches |
|---|---|---|---|
| #7  C-N1 | CONFIRM-DELETE | independent | `endpoints/approvals/_shared.py` only |
| #9  S6.5 | CONFIRM-DELETE-REDIRECT | independent | `services/_notification_approval_helpers.py` |
| #18 S6.2 | CONFIRM-REPOINT-DELETE | independent (after #7 if batched) | `endpoints/approvals/{_shared,resolve,detail}.py` |
| #33 S6.4 | CONFIRM-UNIFY | independent (FE-only) | `frontend/src/components/{forms,kri-form,…}` |
| #34 S6.6 | CONFIRM-EXTRACT | gate for #60 | `services/approval_scenario_policy.py`, 5+ call sites |
| #54 S6.3 | CONFIRM-INLINE | independent (must edit lock test in same commit) | `services/_approval_queue/{__init__,lifecycle}.py`, deepening contract test |
| #60 S6.6 PC | OVERRIDE-DEFER-NOT-VALID, EXECUTE | after #34 (and ideally #54) | new `Depends`, `_authorization_capabilities/*`, `_approval_queue/{queries,counts}` |

**Heavy-hub note** (orchestrator-flagged): `services/approval_scenario_policy.py` has 13 importers today. Items #9, #34, #60 all extend this file. Order them so the file gains symbols in one wave: #9 (delete duplicate that now redirects in), #34 (add `resolve_approval_privilege_tier`), #60 (add `PrivilegeContext` factory). Keeps the hub's API growth additive in three commits, not seven.

**Phase 1 cross-checks confirmed**:
- `approval_scenario_policy.py:134` body matches `_notification_approval_helpers.py:72` `can_user_view_approval_resource`: ✅ verified, identical resolver logic.
- Two copies of `_auto_reject_kri_approval` in `_approval_execution/{kri_history_correction.py:23, kri_value_submission.py:23}`: ✅ verified — both are 2-line `def _auto_reject_kri_approval(approval, reason): return SideEffectResult.auto_rejected(reason)`. Not in the in-scope item list above but flagged for completeness — should be co-located in `_approval_execution/results.py` or a new `_approval_execution/auto_reject.py`.
