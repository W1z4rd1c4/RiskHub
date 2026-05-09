# Phase 3 Loop 1 — Plan: Approvals + scenario policy + queue + notification helpers + bonus duplicate

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Domain: items #7 (C-N1), #9 (S6.5), #18 (S6.2), #33 (S6.4), #34 (S6.6), #54 (S6.3), #60 (PrivilegeContext), #75 (bonus `_auto_reject_kri_approval`).
Inputs: Loop A (`verify-loop-a-03-approvals.md`), Loop B (`verify-loop-b-03-approvals.md`), backend-services audit, backend-endpoints audit, test-surface audit, documentation-surface audit, deepening audit, developer answer.
Constraints: TDD (failing test first), single-developer sequential, no doc/lock-only Reject, defers not respected, no production edits or gate runs in this loop. Only file paths, lock targets, and verification commands are described.

State verified at HEAD against current `main`:

- `_get_approval_department_id` exists at `backend/app/api/v1/endpoints/approvals/_shared.py:17` (0 production callers; verified with grep).
- `_build_approval_read` exists at `backend/app/api/v1/endpoints/approvals/_shared.py:34` with 4 call sites (`resolve.py:61,85,102` + `detail.py:56`); canonical `build_approval_read` at `backend/app/services/_approval_queue/projection.py:13`.
- `can_user_view_approval_resource` duplicate at `backend/app/services/_notification_approval_helpers.py:72` with 1 internal caller at line 98; canonical `can_view_approval_resource` at `backend/app/services/approval_scenario_policy.py:134`.
- Frontend duplicate banner at `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx:11`; prop-driven sibling at `frontend/src/components/forms/ApprovalQueuedBanner.tsx:12`.
- `can_resolve_approvals(current_user)` repeated across 16 distinct files with 22+ sites (counted via grep above).
- `_approval_queue/lifecycle.py` is 17 lines of pure re-exports (no logic); `__init__.py` re-imports the same 7 symbols from it. 3 deepening tests anchor it: `test_architecture_deepening_contracts.py:1005,1025,1041` (Loop B confirmed; Loop A undercounted by one).
- `_auto_reject_kri_approval` byte-identical 2-line definitions at `backend/app/services/_approval_execution/kri_history_correction.py:23` (5 internal callers) and `backend/app/services/_approval_execution/kri_value_submission.py:23` (1 internal caller).

Sequencing constraint: `services/approval_scenario_policy.py` is touched by #9, #34, #60. Land in this order to keep the hub additive:

1. #9 (delete duplicate that already redirects in by content).
2. #34 (add `resolve_approval_privilege_tier`).
3. #60 (add `Depends(get_privilege_context)` factory layered on top of #34).

`#7`, `#18`, `#33`, `#54`, `#75` are independent of the hub wave and can interleave freely with each other or before the wave.

---

## Item #7 — C-N1 — DELETE endpoint shim `_get_approval_department_id`

- Final disposition: DELETE the endpoint helper at `backend/app/api/v1/endpoints/approvals/_shared.py:17-31`. Service-side canonical at `backend/app/services/_approval_execution/loading.py:31` already serves the 4 active service consumers (`approval_execution_service.py:84,128,193`, `_approval_execution/logging.py:16`).
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion (architecture / module-attribute lock) — fail because the dead shim still exists; pass once the symbol is gone.
- Failing test(s) to write FIRST:
  - New regression in `tests/backend/pytest/test_architecture_deepening_contracts.py` (sibling of `test_approval_queue_routes_use_queue_lifecycle_module`): assert `not hasattr(app.api.v1.endpoints.approvals._shared, "_get_approval_department_id")`. Will fail RED at HEAD.
  - Same test asserts `hasattr(app.services._approval_execution.loading, "get_approval_department_id")` (positive anchor for the canonical surface so deletion does not orphan service consumers).
- Code/file changes:
  - `backend/app/api/v1/endpoints/approvals/_shared.py` — remove lines 17–31 (`async def _get_approval_department_id` and its body) and the now-unused `from sqlalchemy import select` / `Control, KeyRiskIndicator, Risk` imports if no longer referenced (`_build_approval_read` uses neither).
  - Verify no straggler imports of `_get_approval_department_id` outside the file (already 0 by grep).
- Lock/TOML/contract updates:
  - None needed for `_endpoint_commit_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_archive_allowlist.toml` — symbol is not anchored.
  - Add the new structural assertion described above to `tests/backend/pytest/test_architecture_deepening_contracts.py`.
- README / doc updates:
  - None. `docs/security/authorization-capability-contract.md` AUTHZ-APPROVALS row references `services/_approval_execution/` already; the endpoint shim is internal.
  - Optional: cross-reference in `backend/app/api/v1/endpoints/approvals/README.md` if it enumerates `_shared.py` symbols.
- Verification commands (Phase 4 will execute; listed for reference, not run here):
  - `cd backend && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k _get_approval_department_id`.
  - `cd backend && pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py -x`.
  - `make -f scripts/Makefile test-architecture-locks`.
- Commit boundary: single commit `chore(approvals): drop dead _get_approval_department_id endpoint shim`. Test + deletion in same commit.
- Rollback note: pure deletion of dead code; revert restores the shim. No data, schema, or capability surface changes.
- Effort: S.

---

## Item #9 — S6.5 — DELETE-AND-REDIRECT `can_user_view_approval_resource`

- Final disposition: DELETE the duplicate at `backend/app/services/_notification_approval_helpers.py:72-79` and rewrite its single internal caller at line 98 to call `approval_scenario_policy.can_view_approval_resource`. Loop B body comparison confirmed bodies are identical with only the docstring missing on the duplicate.
- Dependencies (in-domain): none structurally; this is the first additive change in the `approval_scenario_policy.py` hub wave (#9 → #34 → #60).
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + behavioral regression — fail because the duplicate still exists; pass once `_notification_approval_helpers` no longer defines `can_user_view_approval_resource` and `eligible_approval_notification_recipients` consumes the canonical helper.
- Failing test(s) to write FIRST:
  - New structural assertion in `tests/backend/pytest/test_architecture_deepening_contracts.py` asserting `not hasattr(app.services._notification_approval_helpers, "can_user_view_approval_resource")` and `"approval_scenario_policy.can_view_approval_resource" in inspect.getsource(app.services._notification_approval_helpers.eligible_approval_notification_recipients)`. RED at HEAD.
  - Behavioral coverage: extend the existing recipient-eligibility test in `tests/backend/pytest/test_approval_workflow.py` (which already imports `can_view_approval_resource` at line 26) to assert that recipients filtering uses the canonical helper end-to-end (i.e. parametrize a candidate without read access on each `ApprovalResourceType` and confirm `eligible_approval_notification_recipients` skips them with `skipped["hidden_resource"] += 1`).
- Code/file changes:
  - `backend/app/services/_notification_approval_helpers.py` — delete lines 72–79; rewrite line 98 to `if not await can_view_approval_resource(db, candidate, approval):`; add `from app.services.approval_scenario_policy import can_view_approval_resource` to the existing import block at line 9 (already imports `RISK_OWNER_APPROVER_ROLE, scenario_roles_for_approval`).
- Lock/TOML/contract updates:
  - None on TOML allowlists (symbol not anchored).
  - New structural assertion described above goes into `tests/backend/pytest/test_architecture_deepening_contracts.py`.
- README / doc updates:
  - None. Authorization contract already cites `approval_scenario_policy.py` (see `docs/security/authorization-capability-contract.json:109`).
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_approval_workflow.py -x`.
  - `cd backend && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval`.
- Commit boundary: single commit `refactor(approvals): consolidate can_view_approval_resource on approval_scenario_policy`.
- Rollback note: redirection-only; revert restores the duplicate. No serialization, schema, or wire-format change.
- Effort: S.

---

## Item #18 — S6.2 — REPOINT-AND-DELETE `_build_approval_read`

- Final disposition: REPOINT 4 endpoint call sites (`backend/app/api/v1/endpoints/approvals/resolve.py:61,85,102` and `backend/app/api/v1/endpoints/approvals/detail.py:56`) to `app.services._approval_queue.projection.build_approval_read`, then DELETE `backend/app/api/v1/endpoints/approvals/_shared.py:34-61`. Loop B confirmed bodies are 19-field-for-field identical; only the endpoint copy carries a docstring.
- Dependencies (in-domain): none. Independent of #7 but the cleanup of `_shared.py` is naturally co-mergeable; commit them separately to keep diffs small (each test reads cleaner).
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + regression on response shape parity.
- Failing test(s) to write FIRST:
  - New assertion in `tests/backend/pytest/test_architecture_deepening_contracts.py`: `not hasattr(app.api.v1.endpoints.approvals._shared, "_build_approval_read")` and `"build_approval_read" in (inspect.getsource(resolve) + inspect.getsource(detail))`. RED at HEAD.
  - Response-shape regression: in `tests/backend/pytest/test_approval_resolution.py` (or a focused new test in `test_approval_workflow.py`), assert that POST `/approvals/{id}/approve`, `/reject`, `/cancel`, and GET `/approvals/{id}` all return the same 19 keys and identical values for the same approval row when invoked side-by-side. Today the two paths produce identical dicts; the regression locks that property so the repoint cannot drift fields.
  - The existing positive anchor at `tests/backend/pytest/test_architecture_deepening_contracts.py:1029` (`assert hasattr(projection, "build_approval_read")`) is reinforced — no change needed.
- Code/file changes:
  - `backend/app/api/v1/endpoints/approvals/resolve.py` — replace `from ._shared import _build_approval_read, logger` (line 18) with `from ._shared import logger` and `from app.services._approval_queue.projection import build_approval_read`; replace 3 call sites at lines 61/85/102 (`_build_approval_read(...)` → `build_approval_read(...)`).
  - `backend/app/api/v1/endpoints/approvals/detail.py` — replace `from ._shared import _build_approval_read` (line 15) with `from app.services._approval_queue.projection import build_approval_read`; replace call site at line 56.
  - `backend/app/api/v1/endpoints/approvals/_shared.py` — delete lines 34–61 plus now-orphaned imports (`approval_resource_label`, `ApprovalRequestRead`, `approval_capabilities`, `User`, `ApprovalRequest`).
  - Keep the `logger` symbol; `resolve.py` still imports it.
- Lock/TOML/contract updates:
  - `_endpoint_commit_allowlist.toml`: no changes (current entries are auth-flow only). Confirm no new `db.commit` is introduced.
  - Existing deepening contract test at `test_architecture_deepening_contracts.py:1029` continues to assert the canonical exists; new structural assertion (above) locks the absence of the endpoint copy.
- README / doc updates:
  - None. AUTHZ-APPROVALS row already names `services/_approval_queue/projection.py`.
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approvals.py -x`.
  - `cd backend && pytest tests/backend/pytest/test_architecture_deepening_contracts.py`.
- Commit boundary: single commit `refactor(approvals): repoint _build_approval_read to approval_queue.projection`.
- Rollback note: revert restores the endpoint copy and re-adds the import; response shape is unchanged either way.
- Effort: S.

---

## Item #33 — S6.4 — UNIFY frontend approval-queued banners

- Final disposition: UNIFY under `frontend/src/components/forms/ApprovalQueuedBanner.tsx` (prop-driven). Hoist the KRI variant's i18n into `KRIFormContainer` (same pattern as `RiskFormContainer.tsx:111-119` and `ControlFormContainer.tsx:180-188`). DELETE `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`. Loop B noted the KRI variant has one extra wrapper `<div>` and class-order drift; both disappear on consolidation.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none. Frontend-only.
- TDD shape: failing component + structural assertion. Existing positive test at `tests/frontend/unit/src/components/forms/ApprovalQueuedBanner.test.tsx` is an anchor; new test pins the KRI consumer.
- Failing test(s) to write FIRST:
  - Augment or add `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx`: render `<KRIFormContainer>` with `state.approvalQueued` set, assert it renders a single `ApprovalQueuedBanner` (matching `data-testid` or accessible role) with the resolved title and `errorKeys.*`-prefixed message paths translated. RED at HEAD because the container still imports the dedicated `KriApprovalQueuedBanner`.
  - New unit test or eslint-style assertion: `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts` asserting that `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` does not exist (e.g. `expect(existsSync(...)).toBe(false)`), plus a grep-style check that `KriApprovalQueuedBanner` is not imported anywhere in `frontend/src`. RED at HEAD.
- Code/file changes:
  - `frontend/src/components/kri-form/KRIFormContainer.tsx` — replace `import { KriApprovalQueuedBanner } from './KriApprovalQueuedBanner';` (line 7) with `import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';`; replace lines 158–163 (the `<KriApprovalQueuedBanner ... />` block) with the prop-driven version, computing `closeLabel`, `title`, `viewApprovalsLabel`, and `message` (with `errorKeys.`-prefix routing) inside the container, mirroring `RiskFormContainer.tsx:111-119`.
  - DELETE `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`.
- Lock/TOML/contract updates:
  - None backend-side. Frontend invariant test home (`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`) is unaffected.
- README / doc updates:
  - `frontend/src/components/forms/README.md` — if it enumerates banner siblings, add a note that the KRI form uses this canonical component (otherwise none).
  - `frontend/src/components/kri-form/README.md` — remove any reference to `KriApprovalQueuedBanner` if listed.
- Verification commands:
  - `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form tests/frontend/unit/src/components/forms`.
  - `cd frontend && npx tsc --noEmit`.
- Commit boundary: single commit `refactor(frontend/kri): unify approval queued banner via KRIFormContainer i18n hoist`.
- Rollback note: restores the local KRI banner component plus its container import; behavior is i18n-equivalent.
- Effort: S.

---

## Item #34 — S6.6 — EXTRACT `resolve_approval_privilege_tier`

- Final disposition: EXTRACT a single canonical helper into `backend/app/services/approval_scenario_policy.py` returning a frozen dataclass tier (e.g. `@dataclass(frozen=True) class ApprovalPrivilegeTier: is_privileged: bool; is_primary_approver: bool; is_requester: bool; scenario_match: bool | None; privileged_scenario_match: bool | None`) plus an async helper `async def resolve_approval_privilege_tier(db, user, approval) -> ApprovalPrivilegeTier`. Migrate all 16 files / 22+ sites enumerated by Loop B. Migrate atomically (single commit), but the test surface and helper signature live one commit ahead so the structural assertion can be RED before the migration commits.
- Dependencies (in-domain): #9 lands first (it adds another consumer indirectly via the same hub file; keeps the hub additive in three commits, not seven).
- Cross-domain prerequisites: none today (`backend/app/api/deps.py` does not yet expose a `Depends`-injected privilege object — that arrives in #60).
- TDD shape: behavioral regression + structural assertion. The helper must produce the same tier triplet as the hand-rolled ladders today across the three flows (`assert_can_approve`, `_assert_can_reject`, `get_approval_request`).
- Failing test(s) to write FIRST:
  - New test file `tests/backend/pytest/test_approval_privilege_tier.py`: parametrize `(user_role, approval.scenario_approver_roles, approval.status, primary_approver_id)` across the 8 `TIER_CAPABLE_SCENARIO_KEYS` plus a legacy (`scenario_approver_roles is None`) case; for each, instantiate the new helper and call into existing entry points (`assert_can_approve` from `_approval_execution/authorization.py:16`, `_assert_can_reject` from `approval_execution_service.py:215`, `get_approval_request` HTTP path) and assert the tier dataclass equals the legacy hand-rolled result. RED at HEAD because the helper does not exist.
  - Structural assertion in `tests/backend/pytest/test_architecture_deepening_contracts.py`: `hasattr(app.services.approval_scenario_policy, "resolve_approval_privilege_tier")` and a string-search lock asserting that `"can_resolve_approvals(current_user)"` does **not** appear inside the post-migration files (`_authorization_capabilities/{approvals,risks,controls,kris}.py`, `_approval_queue/{queries,counts}.py`, `_approval_execution/authorization.py`, `approval_execution_service.py`, `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py`, `_kri_history/{governance,intake}.py`, `endpoints/approvals/detail.py`, `endpoints/notifications.py`, `endpoints/users/summary.py`, `notification_visibility.py`). The allow-set is `app.services.approval_scenario_policy` and `app.core.permissions`. RED at HEAD because all 16 files match the banned string.
  - Snapshot regression: `tests/backend/pytest/test_approval_workflow.py`, `test_approval_resolution.py`, `test_approval_workflow.py::test_workflow_*`, and `test_w1_privileged_escalation_red.py` are existing behavioral coverage; do not modify their assertions, but extend `test_approval_workflow.py` with a parametric tier consistency test asserting the same `(is_privileged, scenario_match, privileged_scenario_match)` triplet across the three flows for one approval row.
- Code/file changes:
  - `backend/app/services/approval_scenario_policy.py` — append `ApprovalPrivilegeTier` dataclass and `async def resolve_approval_privilege_tier(db, user, approval)` body that aggregates `can_resolve_approvals(user)`, `user_matches_approval_scenario_role(approval, user)`, `scenario_allows_privileged_resolution(approval, user)`, `is_primary_approver`, `is_requester`. Re-uses `can_view_approval_resource` from the same module (#9 redirect already in place).
  - Migrate **call sites** (Loop B's verified 22+, grouped by file):
    - `backend/app/api/v1/endpoints/approvals/detail.py:47` — replace 4 hand-rolled booleans with `tier = await resolve_approval_privilege_tier(db, current_user, approval)`.
    - `backend/app/api/v1/endpoints/notifications.py:127` — replace `if not can_resolve_approvals(current_user):` with the helper's `is_privileged`.
    - `backend/app/api/v1/endpoints/users/summary.py:24-26` — same.
    - `backend/app/services/_approval_execution/authorization.py:30` — replace 5 booleans with the helper.
    - `backend/app/services/_approval_queue/counts.py:12` — same.
    - `backend/app/services/_approval_queue/queries.py:28,33` — same; adjust the f-string log line at line 28 to read `tier.is_privileged` instead of `can_resolve_approvals(...)`.
    - `backend/app/services/_authorization_capabilities/approvals.py:15` — same.
    - `backend/app/services/_authorization_capabilities/controls.py:54` — same.
    - `backend/app/services/_authorization_capabilities/kris.py:74` — same.
    - `backend/app/services/_authorization_capabilities/risks.py:54` — same.
    - `backend/app/services/_entity_mutation_lifecycle/approval_plans.py:69,162,267` — same.
    - `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:110,186,255` — same.
    - `backend/app/services/_kri_history/governance.py:238` — same.
    - `backend/app/services/_kri_history/intake.py:42` — same.
    - `backend/app/services/approval_execution_service.py:116,222,235,237` — collapse the four predicate calls into one helper invocation per function.
    - `backend/app/services/notification_visibility.py:78,207` — same.
  - Update each file's import block: drop `from app.core.permissions import can_resolve_approvals` (where it becomes unused) and add `from app.services.approval_scenario_policy import resolve_approval_privilege_tier` (or the dataclass alone where the bare boolean is enough).
  - Keep `backend/app/core/permissions.py:25,102` exports (`can_resolve_approvals`) untouched — the helper still uses it internally; only consumers outside the policy module are migrated.
- Lock/TOML/contract updates:
  - New deepening contract assertion (above) added to `tests/backend/pytest/test_architecture_deepening_contracts.py`.
  - Add a "privilege tier" §Vocabulary entry to `docs/security/authorization-capability-contract.md` and re-run/update `docs/security/authorization-capability-contract.json` accordingly so the contract validator (`scripts/security/validate_authz_capability_contract.py`) passes.
  - No TOML allowlist changes (`_capabilities_all_allowlist.toml` does not pin `can_resolve_approvals`).
- README / doc updates:
  - `docs/security/authorization-capability-contract.md` AUTHZ-APPROVALS row: reference the new helper alongside `approval_scenario_policy.py`.
  - `backend/app/services/README.md` (if exists in this dir) or the `_approval_execution/README.md`: cross-reference the helper.
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_approval_privilege_tier.py tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_w1_privileged_escalation_red.py -x`.
  - `python3 scripts/security/validate_authz_capability_contract.py`.
  - `make -f scripts/Makefile test-architecture-locks`.
- Commit boundary: single migration commit `refactor(approvals): centralize privilege-tier resolution in approval_scenario_policy`. Tests precede or share the commit (TDD: RED in same commit at HEAD; GREEN once migration lands).
- Rollback note: this is the largest in-domain diff (16 files). Revert restores the per-site predicates verbatim. No schema, capability surface, or wire-format change.
- Effort: M.

---

## Item #54 — S6.3 — INLINE `_approval_queue/lifecycle.py`

- Final disposition: INLINE `backend/app/services/_approval_queue/lifecycle.py` into `backend/app/services/_approval_queue/__init__.py` (move the 4 leaf imports + `__all__` directly into `__init__`). DELETE `lifecycle.py`. REWRITE 3 deepening tests in the same commit:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1005` (`test_approval_queue_routes_use_queue_lifecycle_module`).
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1025` (`test_approval_queue_lifecycle_uses_service_owned_helpers`).
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1041` (`test_approval_queue_lifecycle_delegates_intake_query_projection`).
- Dependencies (in-domain): none. Independent of #18 (both touch different surfaces); independent of #34/#60.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion. The 3 existing deepening tests must be rewritten to anchor `app.services._approval_queue` (the package) rather than the `lifecycle` submodule. Until rewritten, they will RED-fail after `lifecycle.py` is deleted; this is the desired RED.
- Failing test(s) to write FIRST:
  - In the same commit, REWRITE the 3 deepening tests:
    - `test_approval_queue_routes_use_queue_lifecycle_module` (line 1005): drop `from app.services._approval_queue import lifecycle`; replace with `from app.services import _approval_queue as queue_pkg`; assert `hasattr(queue_pkg, "ApprovalRequestIntakePlan/ApprovalQueuePage/ApprovalQueueProjection")`. Keep the route-source assertion (`route_source = inspect.getsource(queue) + inspect.getsource(resolve)`) unchanged — endpoints still import from `app.services._approval_queue` (line 13 of `queue.py`/`resolve.py`).
    - `test_approval_queue_lifecycle_uses_service_owned_helpers` (line 1025): drop the `lifecycle` import; replace `lifecycle_source = inspect.getsource(lifecycle)` with `package_source = inspect.getsource(queue_pkg)` (i.e. read `__init__.py`). Keep the four `from .{contracts,counts,execution,queries} import` assertions, now applied to `__init__.py`.
    - `test_approval_queue_lifecycle_delegates_intake_query_projection` (line 1041): drop the `_source("backend/app/services/_approval_queue/lifecycle.py")` read; replace with `_source("backend/app/services/_approval_queue/__init__.py")`. Keep the same banned-string set (`create_approval_request_with_audit`, `select(ApprovalRequest)`, `def _build_delete_intake_plan`, `def _approval_queue_page`).
  - The rewrites are RED at HEAD against the deletion; once `lifecycle.py` is gone and `__init__.py` carries the imports, they GREEN.
- Code/file changes:
  - `backend/app/services/_approval_queue/__init__.py` — replace the current `from .lifecycle import (...)` block with the 4 leaf imports verbatim from `lifecycle.py` lines 3–6 (`from .contracts import ApprovalQueuePage, ApprovalQueueProjection, ApprovalRequestIntakePlan`, `from .counts import count_pending_approval_queue`, `from .execution import create_delete_approval_request`, `from .queries import list_approval_queue_page, list_my_approval_queue_page`). Keep the existing `__all__` list (it is already correct and identical).
  - DELETE `backend/app/services/_approval_queue/lifecycle.py`.
- Lock/TOML/contract updates:
  - The 3 deepening tests rewritten as above. No TOML allowlist anchors `lifecycle.py`.
- README / doc updates:
  - `backend/app/services/_approval_queue/README.md` (if exists) — drop any reference to `lifecycle.py` (the module no longer exists).
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -x`.
  - `cd backend && pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -x` (sanity: endpoints still import via the package).
- Commit boundary: single commit `refactor(approvals): inline _approval_queue/lifecycle into package __init__`.
- Rollback note: revert restores `lifecycle.py` and the original `__init__.py` indirection plus the original deepening test bodies.
- Effort: S.

---

## Item #60 — S6.6 — INTRODUCE `PrivilegeContext` + `Depends(get_privilege_context)`

- Final disposition: BACKEND-ONLY (Loop B confirmed no FE prereq). Add a request-scoped privilege object via `Depends(...)` in `backend/app/api/deps.py` returning a frozen dataclass derived from `current_user` (cached on `request.state` for the lifetime of one request). Migrate the 8+ recomputation sites in `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/{queries,counts}.py` to consume the context. Real prerequisite is #34 (helper must exist; #60 wraps it).
- Dependencies (in-domain): #34 must land first. #54 is a soft (non-blocking) prerequisite for clean package boundary; sequence #34 → #54 → #60 if interleaving with #54.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + behavioral regression on caller migration.
- Failing test(s) to write FIRST:
  - New test file `tests/backend/pytest/test_privilege_context.py`: assert that `Depends(get_privilege_context)` injects a `PrivilegeContext` whose fields equal the post-#34 helper's `ApprovalPrivilegeTier` for the same `(current_user, approval)` pair, AND that within a single request the context is computed once (e.g. instrument the helper call counter). RED at HEAD because `get_privilege_context` does not exist.
  - Structural assertion in `tests/backend/pytest/test_architecture_deepening_contracts.py`: `hasattr(app.api.deps, "get_privilege_context")` and `hasattr(app.api.deps, "PrivilegeContext")`; plus a string-search lock asserting that `"can_resolve_approvals(current_user)"` does not appear in the migration target set: `_authorization_capabilities/{approvals,risks,controls,kris}.py`, `_approval_queue/{queries,counts}.py`. RED at HEAD because #34 used the helper but the per-request caching object did not exist.
- Code/file changes:
  - `backend/app/api/deps.py` — add:
    - `@dataclass(frozen=True) class PrivilegeContext: is_resolver: bool; can_view_approvals_globally: bool; scoped_dept_ids: frozenset[int]` (concrete fields TBD by behavior; minimum: `is_resolver`).
    - `async def get_privilege_context(current_user: User = Depends(get_current_user)) -> PrivilegeContext: ...` deriving from `current_user` and caching on `request.state` (FastAPI request injection added in the same signature).
  - Endpoints already using approval permission checks (`detail.py:47`, `notifications.py:127`, `users/summary.py:26`) accept the new `Depends(get_privilege_context)` and read `privilege.is_resolver` instead of recomputing.
  - `_authorization_capabilities/{approvals,risks,controls,kris}.py` and `_approval_queue/{queries,counts}.py` accept an optional `privilege: PrivilegeContext | None = None` parameter (default `None`); when provided, read `privilege.is_resolver`; when absent, fall through to `resolve_approval_privilege_tier` (preserving service-layer call sites that have no FastAPI request).
  - `backend/app/services/approval_scenario_policy.py` continues to host `resolve_approval_privilege_tier` — `get_privilege_context` is a FastAPI-thin wrapper.
- Lock/TOML/contract updates:
  - New structural assertion (above) added to `test_architecture_deepening_contracts.py`.
  - Add §Privilege context to `docs/security/authorization-capability-contract.md`; refresh `docs/security/authorization-capability-contract.json` (validator must pass).
  - No `_endpoint_commit_allowlist.toml` ratchet (no new commits introduced).
  - No `_capabilities_all_allowlist.toml` change (no new resource/action pair).
- README / doc updates:
  - `docs/security/authorization-capability-contract.md` AUTHZ-APPROVALS row: cite `get_privilege_context` as the request-scoped facade.
  - `backend/app/api/README.md` (if exists) — note the new `Depends`.
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_privilege_context.py tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approval_privilege_tier.py -x`.
  - `python3 scripts/security/validate_authz_capability_contract.py`.
  - `make -f scripts/Makefile test-architecture-locks`.
- Commit boundary: single commit `feat(approvals): request-scoped PrivilegeContext via Depends(get_privilege_context)`. Test + helper + migration in same commit; #34 is its predecessor.
- Rollback note: largest authorization-pathway change. Revert restores per-call `can_resolve_approvals(current_user)` invocations; capability surface and HTTP responses unchanged.
- Effort: M.

---

## Item #75 — Bonus — DELETE-AND-CONSOLIDATE `_auto_reject_kri_approval`

- Final disposition: DELETE-AND-CONSOLIDATE. Move the byte-identical 2-line `_auto_reject_kri_approval` (currently duplicated at `backend/app/services/_approval_execution/kri_history_correction.py:23` and `backend/app/services/_approval_execution/kri_value_submission.py:23`) into a single home. Recommended host: `backend/app/services/_approval_execution/results.py` (where `SideEffectResult.auto_rejected` already lives), exported as a module-level helper `def auto_reject_kri_approval(approval, reason) -> SideEffectResult` (drop the leading underscore since it now crosses module boundaries). Repoint the 5 callers in `kri_history_correction.py` (lines 50, 56, 67, 78, 119) and the 1 caller in `kri_value_submission.py` (line 97).
- Dependencies (in-domain): none. Independent of #7/#9/#18/#33/#34/#54/#60.
- Cross-domain prerequisites: none.
- TDD shape: structural assertion + light behavioral regression.
- Failing test(s) to write FIRST:
  - New structural assertion in `tests/backend/pytest/test_architecture_deepening_contracts.py`: `not hasattr(app.services._approval_execution.kri_history_correction, "_auto_reject_kri_approval")` AND `not hasattr(app.services._approval_execution.kri_value_submission, "_auto_reject_kri_approval")` AND `hasattr(app.services._approval_execution.results, "auto_reject_kri_approval")`. RED at HEAD.
  - Behavioral parity: extend `tests/backend/pytest/test_approval_side_effect_dispatch.py` (existing test for side effect dispatch) with a parametrized case that exercises both auto-reject paths (history correction stale; value submission stale) and asserts the resulting `SideEffectResult.outcome == SideEffectOutcome.AUTO_REJECTED` and `.reason` propagates to `apply_auto_rejection`.
- Code/file changes:
  - `backend/app/services/_approval_execution/results.py` — append `def auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult: return SideEffectResult.auto_rejected(reason)` (or co-locate as `@staticmethod` on `SideEffectResult` if preferred — the function form is closer to current callers).
  - `backend/app/services/_approval_execution/kri_history_correction.py` — delete lines 23–24; replace 5 call sites (lines 50, 56, 67, 78, 119) with `auto_reject_kri_approval(...)`; add `from .results import auto_reject_kri_approval` to the existing `from .results import SideEffectResult` import (line 18) → merge.
  - `backend/app/services/_approval_execution/kri_value_submission.py` — delete lines 23–24; replace caller at line 97; same import update at line 18.
- Lock/TOML/contract updates:
  - None on TOML allowlists. New structural assertion added to deepening contracts test as above.
- README / doc updates:
  - None (internal helper). Optional: `backend/app/services/_approval_execution/README.md` if it enumerates module symbols.
- Verification commands:
  - `cd backend && pytest tests/backend/pytest/test_approval_side_effect_dispatch.py tests/backend/pytest/test_approval_edit_apply.py tests/backend/pytest/test_pending_kri_approval_preflight.py -x`.
  - `cd backend && pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject`.
- Commit boundary: single commit `refactor(approvals): consolidate _auto_reject_kri_approval in _approval_execution.results`.
- Rollback note: revert restores the two duplicate definitions; outcome semantics unchanged.
- Effort: S.

---

## Domain dependency graph

```
                ┌────────────────────────────┐
                │ #7  endpoint shim DELETE   │  S, independent
                └────────────────────────────┘
                ┌────────────────────────────┐
                │ #18 _build_approval_read   │  S, independent (touches _shared.py)
                │     REPOINT-AND-DELETE     │
                └────────────────────────────┘
                ┌────────────────────────────┐
                │ #33 banner UNIFY (FE)      │  S, independent
                └────────────────────────────┘
                ┌────────────────────────────┐
                │ #54 lifecycle.py INLINE    │  S, independent (rewrites 3 deep tests)
                └────────────────────────────┘
                ┌────────────────────────────┐
                │ #75 auto_reject_kri DEDUP  │  S, independent
                └────────────────────────────┘

  approval_scenario_policy.py hub wave (sequential — additive in three commits):
                ┌────────────────────────────┐
                │ #9  can_user_view_*  DELETE│  S
                └────────────────┬───────────┘
                                 │
                                 ▼
                ┌────────────────────────────┐
                │ #34 resolve_approval_      │  M (16 files / 22+ sites)
                │     privilege_tier EXTRACT │
                └────────────────┬───────────┘
                                 │
                                 ▼
                ┌────────────────────────────┐
                │ #60 PrivilegeContext +     │  M, backend-only
                │     Depends(get_privilege_)│
                │     migrate 8+ sites       │
                └────────────────────────────┘
```

Free-order pool (any order, any time): #7, #18, #33, #54, #75.
Sequential wave: #9 → #34 → #60.

## Cross-domain notes

- **Frontend domain (#33 only)**: `KRIFormContainer.tsx` is the only consumer of the doomed `KriApprovalQueuedBanner.tsx`. No change to `RiskFormContainer.tsx` or `ControlFormContainer.tsx`. Frontend authz invariant tests at `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` are not touched by any item in this domain.
- **Authorization contract**: #34 and #60 require touching `docs/security/authorization-capability-contract.md` + `.json`. The contract validator (`scripts/security/validate_authz_capability_contract.py`) must be re-run; AUTHZ-APPROVALS row already references `approval_scenario_policy.py` so the diff is purely additive (a §Vocabulary entry for "privilege tier"/"privilege context").
- **Cross-domain `_authorization_capabilities/*` fan-out**: #34 and #60 migrate `_authorization_capabilities/{risks,controls,kris}.py` — these files are shared with the Risks, Controls, and KRIs domains. Other domain plans must not double-migrate the same predicate; coordinate via this plan being the single owner of `can_resolve_approvals` migration.
- **Cross-domain `_entity_mutation_lifecycle/*` and `_kri_history/*` fan-out**: #34 also migrates `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py` (shared with risks/controls/KRIs mutation flow) and `_kri_history/{governance,intake}.py` (shared with KRI domain). Same single-owner principle.
- **Endpoints domain overlap**: `endpoints/approvals/_shared.py` is co-touched by #7 (delete `_get_approval_department_id`) and #18 (delete `_build_approval_read`). Two commits, ordered freely; either yields a smaller `_shared.py`. The endpoints domain plan must not also queue these deletions.
- **Test-surface domain overlap**: deepening contract tests at `test_architecture_deepening_contracts.py:1005,1025,1041` are owned by #54 in this plan; no other plan should rewrite them.
- **No migration files**: no Alembic / DB-schema work for any item in this domain.
