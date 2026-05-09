# Phase 2 Loop B (ADVERSARIAL) — Verification: Approvals + scenario policy + queue + notification helpers

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Scope: items #7 (C-N1), #9 (S6.5), #18 (S6.2), #33 (S6.4), #34 (S6.6), #54 (S6.3), #60 (S6.6 PrivilegeContext).
Method: re-read each cited file in full; compare bodies line-by-line; recount caller graphs; check for hallucinated quotes.

---

## Item #7 — Loop A said: DELETE endpoint shim `_get_approval_department_id` (0 production callers; service-side has 4 consumers).
- Quote check: PASS — `backend/app/api/v1/endpoints/approvals/_shared.py:17` confirmed `async def _get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:`. Service-side `backend/app/services/_approval_execution/loading.py:31` confirmed `async def get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:`.
- Body comparison: PASS — both branch on `RISK / CONTROL / KRI` resource_type → `select(Risk.department_id)/Control.department_id/Risk.department_id via KRI join` and return `scalar_one_or_none()`; structurally identical resolver.
- Importer count check: PASS — endpoint shim has 0 production callers; service-side has 4 (`approval_execution_service.py:84,128,193`, `_approval_execution/logging.py:16`).
- Blocker missed: none.
- Final Phase 2-B verdict: CORRECT.

---

## Item #9 — Loop A said: DELETE duplicate `can_user_view_approval_resource` at `_notification_approval_helpers.py:72` and redirect line 98 to canonical `approval_scenario_policy.can_view_approval_resource`.
- Quote check: PASS — `backend/app/services/approval_scenario_policy.py:134` confirmed `async def can_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:`; `backend/app/services/_notification_approval_helpers.py:72` confirmed `async def can_user_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:`.
- Body comparison: PASS — both bodies (lines 134-142 vs 72-79) functionally identical:
  - `if approval.resource_type == ApprovalResourceType.RISK: return await can_read_risk_id(db, user, approval.resource_id)` (identical at both)
  - `if approval.resource_type == ApprovalResourceType.CONTROL: return await can_read_control_id(...)` (identical)
  - `if approval.resource_type == ApprovalResourceType.KRI: return await can_read_kri_id(...)` (identical)
  - `return False` (identical)
  - Branch order, argument names, and trailing fallthrough match exactly. Only the wrapper function name differs (`can_view_approval_resource` vs `can_user_view_approval_resource`). The canonical version has a one-line docstring; the duplicate omits it. No semantic divergence.
- Importer count check: PASS — canonical has 6 active consumers (`endpoints/approvals/detail.py:50`, `services/approval_queue_visibility.py:37`, `services/notification_visibility.py:82`, `services/approval_execution_service.py:235`, `services/_approval_execution/authorization.py:46`, `tests/backend/pytest/test_approval_workflow.py:629`); duplicate has 1 internal caller (`_notification_approval_helpers.py:98`).
- Blocker missed: none.
- Final Phase 2-B verdict: CORRECT.

---

## Item #18 — Loop A said: REPOINT 4 endpoint call sites to `services._approval_queue.projection.build_approval_read` and DELETE endpoint copy.
- Quote check: PASS — `backend/app/api/v1/endpoints/approvals/_shared.py:34` confirmed `def _build_approval_read(approval: ApprovalRequest, current_user: User) -> ApprovalRequestRead:`; `backend/app/services/_approval_queue/projection.py:13` confirmed `def build_approval_read(approval: ApprovalRequest, current_user: User) -> ApprovalRequestRead:`.
- Body comparison: PASS — field-for-field identical. Both compute `pending_changes = approval.pending_changes` then `capabilities = approval_capabilities(approval=approval, current_user=current_user)`, then `return ApprovalRequestRead.model_validate({...})` with the **same 19 fields in the same order**: `id, resource_type, resource_id, action_type, pending_changes, status, reason, requested_by_id, requested_by_name, requested_by_email, resolved_by_id, resolved_by_name, resolved_at, resolution_notes, created_at, resource_name, can_approve, can_reject, capabilities`. Both use the **same conditional expressions** (`approval.action_type.value if approval.action_type else "delete"`, `approval.status.value.lower()`, `approval.requested_by.name if approval.requested_by else None`, etc.). The only difference is the leading docstring on the endpoint copy: `"""Build ApprovalRequestRead dict from model with user names."""` (line 35); the service copy is undocumented.
- Importer count check: PASS — 4 endpoint call sites confirmed (`resolve.py:61,85,102` + `detail.py:56`); 2 service call sites (`_approval_queue/execution.py:47`, `_approval_queue/projection.py:44`).
- Blocker missed: none. The deepening contract test at `tests/backend/pytest/test_architecture_deepening_contracts.py:1029` already locks `hasattr(projection, "build_approval_read")` — repointing reinforces the lock.
- Final Phase 2-B verdict: CORRECT.

---

## Item #33 — Loop A said: UNIFY under `ApprovalQueuedBanner` (prop-driven), KRI variant hoists i18n into `KRIFormContainer`, DELETE `KriApprovalQueuedBanner.tsx`.
- Quote check: PASS — `frontend/src/components/forms/ApprovalQueuedBanner.tsx:12` confirmed `export function ApprovalQueuedBanner({ closeLabel, message, onClose, title, viewApprovalsLabel })`; `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx:11` confirmed `export function KriApprovalQueuedBanner({ message, onClose })`.
- Body comparison: CORRECT-WITH-CORRECTION — Loop A's "structurally identical" is essentially right but glosses over a minor structural divergence:
  - **Outer wrapper differs by one nested div**: `ApprovalQueuedBanner` uses a single outer `<div className="...flex items-start gap-3...">` directly enclosing the icon + content. `KriApprovalQueuedBanner` wraps with an outer `<div className="...">` containing a child `<div className="flex items-start gap-3">` that holds the icon + content. One extra wrapper.
  - **CSS class ordering differs**: parent uses `mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3`; KRI uses `mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4` (no flex container at this level — flex is on the inner wrapper). Visually equivalent.
  - **Body composition**: Both render `Clock` icon, title `<p>`, message `<p>`, `Link to="/approvals"` with `CheckCircle`, close `<button>`. Same elements in same logical order.
  - **i18n**: parent variant takes `closeLabel/title/viewApprovalsLabel/message` via props (caller supplies). KRI variant inlines `useTranslation(['approvals', 'common', 'errorKeys'])` and renders `t('approval_submitted', { ns: 'errorKeys' })` for the title, `errorKeys.`-prefix routing on message, `t('common:actions.view') + t('approvals:title')` for the link, `t('common:actions.close')` for the button. This is a parent-side concern and is hoistable into `KRIFormContainer`.
- Importer count check: PASS — `ApprovalQueuedBanner` used in `RiskFormContainer.tsx:112`, `ControlFormContainer.tsx:181`; `KriApprovalQueuedBanner` used in `KRIFormContainer.tsx:159`.
- Blocker missed: none. The extra wrapper div in the KRI variant is a benign artifact and disappears on consolidation. KRI variant's `errorKeys.`-prefix routing logic can be lifted into the caller.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION (note the extra wrapper div + class-order drift; neither blocks unification).

---

## Item #34 — Loop A said: EXTRACT `resolve_approval_privilege_tier` helper; "5+ files" repeat the privileged predicate.
- Quote check: PASS — every cited line was verified.
  - `backend/app/services/_approval_execution/authorization.py:30` — `is_privileged = can_resolve_approvals(current_user)`.
  - `backend/app/services/approval_execution_service.py:116` — `is_privileged = can_resolve_approvals(current_user)`.
  - `backend/app/services/approval_execution_service.py:222` — `if not can_resolve_approvals(current_user):`.
  - `backend/app/services/approval_execution_service.py:235` — `if not can_resolve_approvals(current_user) and not await can_view_approval_resource(db, current_user, approval):`.
  - `backend/app/services/approval_execution_service.py:237` — `elif not can_resolve_approvals(current_user) or privileged_scenario_match is not True:`.
  - `backend/app/api/v1/endpoints/approvals/detail.py:47` — `is_privileged = can_resolve_approvals(current_user)`.
  - `backend/app/services/_approval_queue/queries.py:33` — `is_privileged = can_resolve_approvals(current_user)`.
  - `backend/app/services/_approval_queue/counts.py:12` — `if can_resolve_approvals(current_user):`.
  - `backend/app/services/notification_visibility.py:78` — `if can_resolve_approvals(current_user):`.
  - `backend/app/services/notification_visibility.py:207` — `if can_resolve_approvals(current_user):`.
  - `backend/app/services/_authorization_capabilities/{approvals,risks,controls,kris}.py` — verified in each (`approvals.py:15`, `risks.py:54`, `controls.py:54`, `kris.py:74`).
- Body comparison: N/A (predicate-call duplication, not function-body duplication).
- Importer count check: CORRECT-WITH-CORRECTION — Loop A said "5+ files" but actual file count is **16 distinct files** with 22+ call sites:
  ```
  backend/app/api/v1/endpoints/approvals/detail.py
  backend/app/api/v1/endpoints/notifications.py
  backend/app/api/v1/endpoints/users/summary.py
  backend/app/services/_approval_execution/authorization.py
  backend/app/services/_approval_queue/counts.py
  backend/app/services/_approval_queue/queries.py
  backend/app/services/_authorization_capabilities/approvals.py
  backend/app/services/_authorization_capabilities/controls.py
  backend/app/services/_authorization_capabilities/kris.py
  backend/app/services/_authorization_capabilities/risks.py
  backend/app/services/_entity_mutation_lifecycle/approval_plans.py
  backend/app/services/_entity_mutation_lifecycle/archive_plans.py
  backend/app/services/_kri_history/governance.py
  backend/app/services/_kri_history/intake.py
  backend/app/services/approval_execution_service.py
  backend/app/services/notification_visibility.py
  ```
  The `_entity_mutation_lifecycle/approval_plans.py:69,162,267`, `_entity_mutation_lifecycle/archive_plans.py:110,186,255`, `_kri_history/governance.py:238`, `_kri_history/intake.py:42`, `endpoints/notifications.py:127`, and `endpoints/users/summary.py:26` sites were not enumerated by Loop A. The disposition (extract a helper) does not change, but the migration scope is broader than "5+ files" suggests.
- Blocker missed: none. All inputs (`current_user`, `approval`, `db`) are in scope at every call site.
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION (migration touches ~16 files, not 5; helper extraction disposition stands).

---

## Item #54 — Loop A said: DELETE `lifecycle.py` and inline its 4 imports into `_approval_queue/__init__.py`; rewrite the deepening contract tests anchoring `lifecycle`.
- Quote check: PASS — `backend/app/services/_approval_queue/lifecycle.py` is 17 lines and contains:
  - Line 1: `from __future__ import annotations`
  - Lines 3-6: 4 `from .{contracts,counts,execution,queries} import …` lines.
  - Lines 8-16: a single `__all__` list naming 7 symbols.
  - **No non-re-export logic anywhere.** Confirmed pure aggregator.
- Body comparison: N/A (file is pure imports + `__all__`).
- Importer count check: PASS — `_approval_queue/__init__.py:1-9` re-exports the same 7 symbols `from .lifecycle import (...)` (a second hop). Endpoints reach the symbols via `from app.services._approval_queue import (…)` → `__init__` → `lifecycle.py` → leaf modules.
- Blocker missed: 3 deepening-contract tests (not 2) anchor `lifecycle` and must be rewritten in the same commit:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1005` — `test_approval_queue_routes_use_queue_lifecycle_module` asserts `hasattr(lifecycle, "ApprovalRequestIntakePlan/ApprovalQueuePage/ApprovalQueueProjection")`.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1025` — `test_approval_queue_lifecycle_uses_service_owned_helpers` asserts `inspect.getsource(lifecycle)` contains `from .{contracts,counts,execution,queries} import`.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1041` — `test_approval_queue_lifecycle_delegates_intake_query_projection` reads `_source("backend/app/services/_approval_queue/lifecycle.py")` and asserts certain symbols are absent. Loop A undercounted by one test (Loop A cited `1005-1038`, missing the one at 1041 which also reads lifecycle source).
- Final Phase 2-B verdict: CORRECT-WITH-CORRECTION (3 deepening tests need rewriting, not 2).

---

## Item #60 — Loop A said: OVERRIDE-DEFER-NOT-VALID; prerequisite is #34 (helper extraction), not a frontend AuthContext.
- Quote check: PASS — confirmed no `PrivilegeContext`, `privilege_context`, `PrivilegeTier`, or `privilege_tier` exists anywhere in `backend/app/` or `frontend/src/`. Confirmed no backend `AuthContext` or `auth_context` exists. The frontend `AuthContext` (`frontend/src/contexts/AuthContext.tsx:11`) is a React context for auth state, unrelated to the proposed backend request-scoped object.
- Body comparison: N/A (proposed new abstraction).
- Importer count check: PASS — the proposed migration sites (8+ recomputation points in `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/{queries,counts}.py`) are the same call sites enumerated for #34. Loop A's pointer to #34 as the gate is correct.
- Blocker missed: NO frontend prereq. The proposed `PrivilegeContext` is a backend-only `Depends(get_privilege_context)` injectable returning a frozen dataclass on `request.state` for the lifetime of one request. It does not touch FE. (The FE `AuthContext` is purely a React state holder for `user`, `token`, `isAuthenticated` and has no equivalence to the backend's privilege-tier computation.)
- Final Phase 2-B verdict: CORRECT.

---

## Bonus duplicate — `_auto_reject_kri_approval`
- Quote check: PASS — both copies exist verbatim:
  - `backend/app/services/_approval_execution/kri_history_correction.py:23` — `def _auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult: return SideEffectResult.auto_rejected(reason)` (5 internal callers in this file at lines 50, 56, 67, 78, 119).
  - `backend/app/services/_approval_execution/kri_value_submission.py:23` — same 2-line definition (callers within the same file).
- Body comparison: PASS — bodies are byte-identical 2-line functions. Both files import `SideEffectResult` from `.results`. Both files share `from app.models import ApprovalRequest, KeyRiskIndicator, User` and `from .results import SideEffectResult`. The natural co-location is `_approval_execution/results.py` (where `SideEffectResult.auto_rejected` already lives) so the helper becomes a one-line classmethod or module function alongside the result type.
- Importer count check: PASS — each duplicate is private to its own module (leading underscore + module-private use); zero cross-module imports.
- Blocker missed: none.
- Recommendation: **INCORPORATE as a new numbered item** in the resolution plan. Trivial, no doc/lock side-effects, no migration risk; co-locating it with `SideEffectResult` in `_approval_execution/results.py` (or a new `_approval_execution/auto_reject.py`) follows the same "delete duplicate, redirect callers" pattern as #9 and is independently mergeable. Suggested numbering: append as a new low-priority item (#61 or as a "bonus" line attached to the #34 wave since both touch `_approval_execution/`).

---

## Cross-item summary (Phase 2-B final verdicts)

| Item | Loop A verdict | Phase 2-B verdict | Correction |
|---|---|---|---|
| #7  C-N1 | CONFIRM-DELETE | CORRECT | none |
| #9  S6.5 | CONFIRM-DELETE-REDIRECT | CORRECT | none |
| #18 S6.2 | CONFIRM-REPOINT-DELETE | CORRECT | none |
| #33 S6.4 | CONFIRM-UNIFY | CORRECT-WITH-CORRECTION | extra wrapper `<div>` + class-order drift in KRI variant; benign |
| #34 S6.6 | CONFIRM-EXTRACT | CORRECT-WITH-CORRECTION | scope is 16 files / 22+ sites, not "5+" |
| #54 S6.3 | CONFIRM-INLINE | CORRECT-WITH-CORRECTION | 3 deepening tests need rewriting, not 2 |
| #60 S6.6 PC | OVERRIDE-DEFER-NOT-VALID | CORRECT | none |
| Bonus `_auto_reject_kri_approval` | flagged "out of scope" | INCORPORATE as new item | trivial; co-locate with `SideEffectResult` |

**Heavy-hub note** (re-confirmed): `services/approval_scenario_policy.py` has 13 importers today. #9, #34, #60 all extend this file. Three additive commits in the order Loop A specified is the safe sequence.

**No hallucinated quotes detected.** Every cited line and every body-comparison claim was verified against current code as of branch `main` at HEAD.
