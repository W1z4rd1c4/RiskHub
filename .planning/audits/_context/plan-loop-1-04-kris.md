# Phase 3 Loop 1 plan — Domain 4: KRI + ADR-012 (period algebra)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`

This plan covers Phase 2-B verdicts for items #3, #24, #25, #26, #50, #51, #52, #62, #73.
TDD shape: every change starts with a failing test or failing structural assertion.
No parallelism; doc/lock-only Reject arguments are INVALID; #62 Defer is overruled.

Source-of-truth references (re-verified against current tree):

- `frontend/src/components/kri-form/kriFormWorkflow.ts:6` — `export function buildVendorContextWarning({` (14-line file)
- `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` — `from app.services._kri_history.value_application import visible_linked_vendors` (5-line barrel)
- `backend/app/services/_kri_history/submission.py:9` — `async def _create_kri_submission_approval(` (22-line wrapper)
- `backend/app/services/_kri_history/value_application.py:1` — `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors` (8-line whole-file alias)
- `backend/app/services/_kri_history/correction_plans.py:13` — `def build_kri_correction_plan(*, entry_id: int, pending_changes: dict[str, Any])` (14 lines)
- `frontend/src/components/KRIForm.tsx:1` — `export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';` (2 lines)
- `backend/app/services/kri_vendor_assignment.py:81-119` — `async def assign_vendors_to_kri(` mutates `VendorRiskLink`/`VendorKRILink` directly with 0 audit emissions
- `backend/app/services/_vendor_links/workflow.py:265-333` — canonical `link_vendor_target`/`unlink_vendor_target` emits `vendor_link_created`/`vendor_link_deleted`
- `backend/app/services/_kri_history/periods.py:21,50,59,87,109` — period algebra (`period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, `is_within_reporting_window`)
- `backend/app/services/_kri_history/constants.py:2` — `REPORTING_GRACE_DAYS = 15` (the SSOT)
- `backend/app/services/_config/lookup.py:26` — `REPORTING_GRACE_DAYS = 15` (the duplicate inside `ConfigDefaults` to collapse)
- `backend/app/services/kri_deadline_service.py:64,77,78` — three `KRIHistoryService.*` static-method reaches that ADR-012 anchors
- `tests/backend/pytest/test_architecture_deepening_contracts.py:962,976-980,998,1330-1340` — locks
- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` — `kri_vendor_assignment.py` pinned in `VENDOR_SERVICE_FILES`

---

## Item #3 — S3.11 — Delete `kriFormWorkflow.ts` shim

- Final disposition: DELETE file + delete sole test importer.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none. Lock-symbol list at `test_architecture_deepening_contracts.py:1331-1340` already excludes `buildVendorContextWarning`.
- TDD shape: structural-failure-first — write a test that asserts the file is absent before removing it (red on the current tree), then make it green by deleting.
- Failing test(s) to write FIRST:
  - In `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts` (or a small new structural test file under `tests/frontend/unit/src/components/__tests__/`), add an assertion that `import.meta.glob('@/components/kri-form/kriFormWorkflow.ts')` resolves to an empty record OR that `fs.existsSync('frontend/src/components/kri-form/kriFormWorkflow.ts') === false`. The current tree fails this assertion (file exists at `kriFormWorkflow.ts:1-14`) → red.
  - Backend mirror lock test in `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` (new test) asserting `not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()` → red.
- Code/file changes:
  - Delete `frontend/src/components/kri-form/kriFormWorkflow.ts`.
  - Delete `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts` import line `:8` and usage at `:28-29`. If file becomes empty/test-only-for-this-symbol, delete the whole test file; otherwise prune symbol references only.
- Lock/TOML/contract updates:
  - None required for `test_frontend_workflow_helpers_are_used_by_production_code` — the asserted symbol list (`:1331-1340`) does not include `buildVendorContextWarning`. Verified.
  - No TOML registry entries to touch.
- README / doc updates: none. Symbol is not referenced in docs.
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - frontend unit-test runner against the new "file-absent" assertion
  - `rg "buildVendorContextWarning|kriFormWorkflow"` returns no hits in `frontend/` or `tests/frontend/`
- Commit boundary: standalone single commit.
- Rollback note: `git revert` restores the 14-line file and the test.
- Effort: S.

---

## Item #24 — S3.4 — Delete-and-repoint `kris/linked_vendors.py` barrel (atomic with #51)

- Final disposition: DELETE the 5-line barrel; repoint 4 endpoint importers directly at `_kri_history.direct_application`.
- Dependencies (in-domain): **ATOMIC with #51** — both rewrite the same line `kris/linked_vendors.py:3` (`from app.services._kri_history.value_application import visible_linked_vendors`).
- Cross-domain prerequisites: none. The 6 doc citations are within this domain's sphere of responsibility (KRI surface).
- TDD shape: import-graph-failure-first — assert the barrel file is absent and that no endpoint imports `from ..linked_vendors`.
- Failing test(s) to write FIRST:
  - Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:
    1. `assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()` → red.
    2. For each of `breaches.py`, `detail.py`, `create.py`, `restore.py`, assert `"from ..linked_vendors" not in path.read_text()` → red on `breaches.py:18`, `detail.py:15`, `create.py:22`, `restore.py:17`.
- Code/file changes:
  - Delete `backend/app/api/v1/endpoints/kris/linked_vendors.py`.
  - Repoint `backend/app/api/v1/endpoints/kris/crud/breaches.py:18`, `detail.py:15`, `create.py:22`, `restore.py:17` from `from ..linked_vendors import visible_linked_vendors` to `from app.services._kri_history.direct_application import visible_linked_vendors`.
- Lock/TOML/contract updates:
  - None in TOML registries.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:998-1000` (negative-assertion list) is unaffected — the negative-imports remain absent post-repoint.
- README / doc updates (must land in same commit):
  - `docs/security/authorization-capability-contract.md:116,117,118` — strip `kris/linked_vendors.py` from `backend_authority` cells (3 places).
  - `docs/security/authorization-capability-contract.json:368,388,410` — strip the same string from the JSON `backend_authority` keys (3 places).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `rg "kris/linked_vendors|from ..linked_vendors|from \\.linked_vendors"` returns no hits.
- Commit boundary: SAME COMMIT as #51 (atomic cluster A).
- Rollback note: cluster reverts together; barrel + value_application come back as one unit.
- Effort: S (atomic with #51 → joint S/M).

---

## Item #25 — S3.7 — Extract KRI department-scope helper

- Final disposition: EXTRACT the `dept_ids = get_user_department_ids(...) → filter` block duplicated across `due_soon.py:30-51`, `overdue.py:29-50`, and `breaches.py:41-47` into a single helper (e.g. `apply_kri_department_scope` in `backend/app/api/v1/endpoints/kris/access.py`).
- Dependencies (in-domain): none directly, but coexists with #24's repoint; sequencing-friendly — not atomic.
- Cross-domain prerequisites: none.
- TDD shape: behavioural test plus structural assertion that the duplicated pattern is gone.
- Failing test(s) to write FIRST:
  - Behavioural test in `tests/backend/pytest/test_kris_department_scope_helper_red.py` (new) using `client_factory` (per `tests/backend/pytest/conftest.py`), exercising `GET /kris/due-soon`, `GET /kris/overdue`, `GET /kris/breaches` with: privileged user (no dept filter, dept_ids=None), non-privileged user with mismatched `department_id`, non-privileged user with matching `department_id`, and no `department_id`. Pin the empty-list response on department mismatch (currently produced by inline code at `due_soon.py:42`, `overdue.py:41`, `breaches.py:46`). The new helper must produce identical responses.
  - Structural lock in `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`: assert that `get_user_department_ids` appears at most once across `due_soon.py`, `overdue.py`, `breaches.py` (currently 3 → red).
- Code/file changes:
  - Add `apply_kri_department_scope(items, *, current_user, department_id, item_dept_attr="department_id")` (or equivalent) in `backend/app/api/v1/endpoints/kris/access.py`.
  - Replace the duplicated blocks at `due_soon.py:30-51`, `overdue.py:29-50`, `breaches.py:41-47` with calls to the new helper.
- Lock/TOML/contract updates: none. The new helper does not change capability semantics — only consolidates a pure-Python filter pattern.
- README / doc updates: none required (no doc citation pins this duplicate pattern).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_kris_history_listing_api.py` (existing rbac suite must still pass)
  - `rg "get_user_department_ids" backend/app/api/v1/endpoints/kris/` shows only the new helper site + `access.py` import.
- Commit boundary: standalone single commit.
- Rollback note: revert restores the inline triplicated blocks.
- Effort: S.

---

## Item #26 — S3.9 — Delete `KRIForm.tsx` shim + ESLint pin

- Final disposition: DELETE 2-line shim; rewrite the 1 production import in `KRINewPage.tsx`; rewrite 4 test sites; remove the file-targeted ESLint pin.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none. Verified `KRIEditPage.tsx` does NOT exist (`KRINewPage.tsx` is the sole production importer).
- TDD shape: structural-absence-first.
- Failing test(s) to write FIRST:
  - Add to backend lock `test_w4_bc_g_kri_history_boundaries_red.py` (or new frontend-mirror test): `assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()` → red.
  - Add: assert `'src/components/KRIForm.tsx'` not in `frontend/eslint.config.js:146` content (i.e., the rule block at `:145-158` is absent) → red.
  - Add: assert `"from '@/components/KRIForm'"` and `"vi.mock('@/components/KRIForm'"` do not appear under `frontend/src/` and `tests/frontend/unit/src/` → red on the 5 known sites.
- Code/file changes:
  - Delete `frontend/src/components/KRIForm.tsx`.
  - Rewrite `frontend/src/pages/KRINewPage.tsx:5` from `import { KRIForm } from '@/components/KRIForm';` to `import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';` (and import the type from `'@/components/kri-form/kriForm.types'` if used in the file).
  - Rewrite test imports:
    - `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5`
    - `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4`
    - `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66` (`vi.mock` target)
    - `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32` (`vi.mock` target)
    All four must point at `'@/components/kri-form/KRIFormContainer'`.
  - Remove the `files: ["src/components/KRIForm.tsx"]` block at `frontend/eslint.config.js:145-158`.
- Lock/TOML/contract updates: none. The capability contract `md:117` mentions "KRI form/list components" without pinning the shim file; no edit required.
- README / doc updates:
  - `frontend/src/components/kri-form/README.md` — remove any "public facade" prose that references `KRIForm.tsx` (verified at `:5` per Loop A).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `cd frontend && pnpm lint` (or repo-equivalent) — must still pass without the file-targeted rule.
  - `rg "@/components/KRIForm" frontend tests` returns no hits.
- Commit boundary: standalone single commit.
- Rollback note: revert restores the 2-line shim + 1 page import + 4 test sites + ESLint rule + README prose.
- Effort: S.

---

## Item #50 — S3.2 — Delete `_kri_history/submission.py` wrapper

- Final disposition: DELETE the 22-line file. 0 production importers of `_create_kri_submission_approval`; the canonical `create_kri_submission_approval` in `approval_intake.py` already serves all live consumers.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural-absence-first.
- Failing test(s) to write FIRST:
  - Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`: `assert not (REPO_ROOT / "backend/app/services/_kri_history/submission.py").exists()` → red.
  - Add: assert `"_create_kri_submission_approval"` does not appear in any file under `backend/app/services/_kri_history/` (currently appears in `submission.py:9`) → red.
- Code/file changes:
  - Delete `backend/app/services/_kri_history/submission.py`.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:998` — negative-assertion line `"from app.services._kri_history.submission import _create_kri_submission_approval"` is benign post-delete (it asserts absence in route source), but for hygiene drop the now-dead string from the tuple at `:997-1002`.
- README / doc updates (must land in same commit):
  - `backend/app/services/_kri_history/README.md` — remove `submission.py` from the file inventory at `:21`.
  - `docs/security/authorization-capability-contract.md:117,118,161` — strip `submission.py` from the service-policy/inventory cells (3 strings).
  - `docs/security/authorization-capability-contract.json:389,411` — strip `submission.py` from the JSON `service_policy` strings (2 places).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/test_w1_privileged_escalation_red.py` (consumes the canonical name; must still pass).
  - `rg "_kri_history/submission|_create_kri_submission_approval"` returns no hits.
- Commit boundary: standalone single commit.
- Rollback note: revert restores file + lock entry + 5 doc-citation strings.
- Effort: S.

---

## Item #51 — S3.3 — Delete `_kri_history/value_application.py` shim (atomic with #24)

- Final disposition: DELETE the 8-line whole-file alias; repoint 3 production importers (one of which is the #24 barrel) directly at `_kri_history/direct_application`.
- Dependencies (in-domain): **ATOMIC with #24** — both rewrite `kris/linked_vendors.py:3`. Single commit.
- Cross-domain prerequisites: none.
- TDD shape: structural-absence-first.
- Failing test(s) to write FIRST:
  - Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`: `assert not (REPO_ROOT / "backend/app/services/_kri_history/value_application.py").exists()` → red.
  - Add: assert `"_kri_history.value_application"` does not appear in any file under `backend/` → red on:
    - `backend/app/services/_register_listings/kris.py:31`
    - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21`
    - `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` (this disappears via #24).
- Code/file changes:
  - Delete `backend/app/services/_kri_history/value_application.py`.
  - Repoint imports:
    - `backend/app/services/_register_listings/kris.py:31` → `from app.services._kri_history.direct_application import visible_linked_vendors` (call at `:402` unchanged).
    - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` → same pivot (call at `:200` unchanged).
    - The third site (`kris/linked_vendors.py:3`) is removed entirely as part of #24.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980` — `value_application_path = "backend/app/services/_kri_history/value_application.py"` and the two `_source(value_application_path)` assertions at `:979,980` must be DELETED in same commit; otherwise `_source(...)` raises `FileNotFoundError` and the test fails.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:999-1000` — drop the now-dead `"from app.services._kri_history.value_application import _apply_kri_value_directly"` and `"from app.services._kri_history.value_application import ("` strings from the negative-assertion tuple.
- README / doc updates (must land in same commit):
  - `docs/security/authorization-capability-contract.md:117,118,161` — strip `value_application.py` from service-policy/inventory cells (3 strings).
  - `docs/security/authorization-capability-contract.json:389,411` — strip `value_application.py` from JSON `service_policy` strings (2 places).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/test_kri_history_intake_workflow.py tests/backend/pytest/test_kris_value_submission_api.py` (consumers of the canonical names; must still pass)
  - `rg "_kri_history.value_application|_kri_history/value_application"` returns no hits.
- Commit boundary: SAME COMMIT as #24 (atomic cluster A).
- Rollback note: cluster reverts together; shim + barrel + 6 doc citations + 4 lock lines come back as one unit.
- Effort: S.

---

## Item #52 — S3.5 — Delete `_kri_history/correction_plans.py`

- Final disposition: DELETE the 14-line module. 0 production consumers; only the architecture lock at `:962` keeps it alive.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: none.
- TDD shape: structural-absence-first.
- Failing test(s) to write FIRST:
  - Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`: `assert not (REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py").exists()` → red.
  - Add: assert `"correction_plans"` and `"build_kri_correction_plan"` and `"KriCorrectionDraft"` do not appear under `backend/app/services/_kri_history/` → red on the file itself.
- Code/file changes:
  - Delete `backend/app/services/_kri_history/correction_plans.py`.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:956` — drop `correction_plans` from the import tuple.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:962` — drop `assert hasattr(correction_plans, "build_kri_correction_plan")`.
  - Both edits MUST land in same commit; otherwise the test raises `ImportError`.
- README / doc updates: `backend/app/services/_kri_history/README.md` — remove the `correction_plans.py` row from the inventory if listed (Loop A note).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `pytest tests/backend/pytest/test_kris_history_corrections_api.py` (correction flows; must still pass through the live `corrections.py` module).
  - `rg "correction_plans|build_kri_correction_plan|KriCorrectionDraft"` returns no hits.
- Commit boundary: standalone single commit.
- Rollback note: revert restores file + 2 lock lines.
- Effort: S.

---

## Item #62 — S5.9 — Relocate `kri_vendor_assignment.py` and route through canonical with PER-ROW audit events

### Audit-cardinality decision (the real question Phase 2-B inherited)

The dev's defer reason at `developer answer.md:710` was "Doing it early risks mismatched audit cardinality or link semantics." Phase 2-B (`verify-loop-b-04-kris.md:185-188`) flagged that Loop A only relocated this question, did not answer it. **Decision: PER-ROW EVENTS.**

Rationale (recorded in this plan, to be quoted in the commit message and the new ADR-012 cross-reference):

1. **Audit completeness over noise.** Today: 0 events for any reconciliation (`kri_vendor_assignment.py:81-119`). Canonical `_vendor_links/workflow.py:285,322` emits one `vendor_link_created` / `vendor_link_deleted` per row. Switching to per-row matches existing audit-log shape exactly — downstream consumers (notification trigger filters, audit-search UI) already assume one event per `(vendor_id, target_id)` mutation. A rolled-up event would invent a new audit shape.
2. **Idempotency / replay.** Per-row events let outbox replay re-create individual rows; rolled-up events lose granularity needed for partial retries.
3. **Customer-visible diff.** N events instead of 0 events for a bulk reconciliation is an additive change; 1 event for N rows would silently re-shape the activity feed (vendor pages would lose per-link rows).
4. **Lock alignment.** The architecture lock in `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` expects vendor-governance services to emit through canonical link mutators; per-row events satisfy this without inventing new primitives.

This decision is recorded in the new ADR-012 (item #73) as a normative reference and in the commit message of #62.

### Plan skeleton

- Final disposition: RELOCATE `backend/app/services/kri_vendor_assignment.py` into `backend/app/services/_vendor_links/` (e.g. `_vendor_links/kri_assignment.py`); REWRITE the bulk reconciliation in `assign_vendors_to_kri` to call `link_vendor_target` / `unlink_vendor_target` per row (PER-ROW audit). Parent-risk-vendor backfill at `:91-102` becomes per-row `link_vendor_target` calls of kind risk; vendor-KRI reconciliation at `:104-117` becomes per-row `unlink_vendor_target`/`link_vendor_target` calls of kind kri.
- Dependencies (in-domain): none. **Defer override**: NOT blocked by #69 (vendor-link mixin). Phase 2-B confirmed table-shape independence.
- Cross-domain prerequisites: none. Loop B confirmed `link_vendor_target`/`unlink_vendor_target` interface is table-agnostic.
- TDD shape: behavioural-failure-first (audit emission count) plus structural assertions for relocation.
- Failing test(s) to write FIRST:
  1. Behavioural audit-cardinality test in `tests/backend/pytest/test_kri_vendor_assignment_audit_red.py` (new) using `client_factory`. Scenario: a KRI is assigned 3 vendors, then re-assigned to a different set of 2 vendors (1 overlap, 1 removal, 1 addition). Assert that the activity log contains:
     - 3 `vendor_link_created` events (initial assign)
     - 1 `vendor_link_deleted` event (the removal)
     - 1 `vendor_link_created` event (the addition)
     - All carry `link_kind="kri"` and the correct `target_id=kri.id`.
     Plus, when `ensure_parent_risk_vendor_ids` is non-empty for a vendor not yet linked to the parent risk, assert one additional `vendor_link_created` event with `link_kind="risk"` and `target_id=kri.risk_id`.
     Today: ALL of these counts are 0. Test goes red against the current implementation.
  2. Structural relocation lock in `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py`: replace `REPO_ROOT / "backend/app/services/kri_vendor_assignment.py"` at `:16` with the new path under `_vendor_links/`. Add an explicit assertion that `(REPO_ROOT / "backend/app/services/kri_vendor_assignment.py").exists() is False`. Both red on current tree.
  3. Structural lock that the new module does NOT contain `db.add(VendorRiskLink(`, `db.add(VendorKRILink(`, or `await db.delete(link)` (i.e., no direct table mutation; everything routes through the canonical mutators). Currently red because `kri_vendor_assignment.py:102,112,117` has all three.
- Code/file changes:
  - Relocate `backend/app/services/kri_vendor_assignment.py` → `backend/app/services/_vendor_links/kri_assignment.py`.
  - Rewrite `assign_vendors_to_kri`:
    - Remove direct `select(VendorRiskLink...)` / `db.add(VendorRiskLink(...))` block at `:91-102`.
    - Remove direct `select(VendorKRILink...)` / `await db.delete(link)` / `db.add(VendorKRILink(...))` block at `:104-117`.
    - Replace with per-row calls to `link_vendor_target(db, vendor_id=..., current_user=..., kind="risk", entity_id=kri.risk_id)` for the parent-risk reconciliation and `link_vendor_target` / `unlink_vendor_target` with `kind="kri"`, `entity_id=kri.id` for the KRI reconciliation.
    - Preserve return type `list[int]` (the normalized linked-vendor IDs).
    - `normalize_vendor_ids`, `validate_assignable_vendors`, `ensure_vendors_exist`, `get_kri_vendor_ids` retain their current signatures (they have non-link-mutating callers).
  - Update 4 production importers to the new path:
    - `backend/app/api/v1/endpoints/kris/crud/create.py:16` — `from app.services._vendor_links.kri_assignment import (assign_vendors_to_kri, validate_assignable_vendors,)`
    - `backend/app/services/_approval_execution/kri_generic_edit.py:16` — same package, `assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids`
    - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` — `assign_vendors_to_kri`
    - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — `normalize_vendor_ids, validate_assignable_vendors`
- Lock/TOML/contract updates:
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` — change the `VENDOR_SERVICE_FILES` entry to the new path. Lock travels with the file.
  - Audit no other lock cites `kri_vendor_assignment` by path. (Verified: `rg "kri_vendor_assignment" tests/`.)
- README / doc updates:
  - `docs/security/authorization-capability-contract.md:172` mentions `backend/app/services/kri_vendor_assignment.py` in a 2026-05-06 perimeter-pass note. Update path to new location.
  - `docs/security/authorization-capability-contract.json` if any string mentions the path (verify with `rg`).
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/test_kri_vendor_assignment_audit_red.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_approval_workflow.py` (cover the canonical surface, the existing domain-error guard, and approval-driven KRI mutation paths).
  - `rg "VendorRiskLink|VendorKRILink" backend/app/services/_vendor_links/kri_assignment.py` returns hits only via canonical helpers, no `db.add`/`db.delete`.
- Commit boundary: SINGLE COMMIT. Relocate + rewrite + 4 importer rewrites + lock-line update + doc updates + the new audit-cardinality test together. Splitting risks half-routed audit emissions in production code.
- Rollback note: revert restores the old file at the old path with 0 audit emissions; the new behavioural test at `test_kri_vendor_assignment_audit_red.py` re-fires red as a safety net. Document the per-row decision in the commit message body so a revert preserves the intent for re-attempt.
- Effort: M (half-day–1 day): bulk-rewrite + audit-test + 4 importer pivots.

---

## Item #73 — ADR-012 — KRI time-series period algebra

### Loop B correction acknowledged

Loop B established that `_kri_history/constants.py:2` IS the SSOT (it is consumed by `periods.py:9`, `kri_history_service.py:8`, and across the package). The duplicate to collapse via ADR-012 is `_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS = 15`, reached from `kri_deadline_service.py:52` and `kri_deadline_support.py:36`.

### Plan skeleton

- Final disposition:
  1. WRITE `docs/adr/ADR-012-kri-time-series-period-algebra.md` declaring `_kri_history/periods.py` (and `_kri_history/constants.py`) as the SSOT for KRI time-series period bounds and reporting-grace days.
  2. ADD a new lock test `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` plus a new TOML registry `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` enumerating allowed importers/static-method consumers of the period algebra and `REPORTING_GRACE_DAYS`.
  3. COLLAPSE the three `KRIHistoryService.*` static-method reaches in `kri_deadline_service.py:64,77,78` into a single `KRIDeadlineService.classify(submission, *, now)` (or equivalent) helper that consumes the period algebra directly. This collapses the ConfigDefaults duplicate by routing the deadline service through `_kri_history/constants.REPORTING_GRACE_DAYS` instead of `ConfigDefaults.REPORTING_GRACE_DAYS`.
- Dependencies (in-domain): touches `kri_deadline_service.py` which is also referenced by item #62's relocation only by package proximity — they do not share lines. ADR-012 lock test should explicitly allow `_vendor_links/kri_assignment.py` once #62 lands (or, simpler, the lock cites the period-algebra symbols, not the vendor-assignment file).
- Cross-domain prerequisites: none. Loop B confirmed implementation cleanup (collapsing static-method reaches) was originally framed as Tier-3 follow-up but is included in this plan per the task brief ("Three reaches in `kri_deadline_service.py:64,77,78` collapse into `KRIDeadlineService.classify(submission, *, now)`").
- TDD shape: structural lock + behavioural equivalence test for the new `classify` helper.
- Failing test(s) to write FIRST:
  1. New lock `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`:
     - Assert `docs/adr/ADR-012-kri-time-series-period-algebra.md` exists → red on current tree.
     - Assert `REPORTING_GRACE_DAYS = 15` appears in EXACTLY ONE source-of-truth location: `backend/app/services/_kri_history/constants.py`. Currently red because `backend/app/services/_config/lookup.py:26` also defines the constant.
     - Assert that no module outside the allowlist (read from `_kri_state_vocabulary_allowlist.toml`) imports `period_bounds_for_date`, `latest_closed_period_for_date`, `due_date`, `is_period_end_boundary`, `is_within_reporting_window`, or accesses `KRIHistoryService.due_date` / `.period_bounds_for_date` / `.latest_closed_period_for_date`. Allowlist initial entries: `_kri_history/*`, `kri_history_service.py` (re-export), `kri_deadline_service.py` (post-collapse: only via `KRIDeadlineService.classify`).
     - Assert that `kri_deadline_service.py` contains AT MOST one reference to `KRIHistoryService.` (the collapsed `classify` helper); currently red — three reaches at `:64,77,78`.
     - Assert that `kri_deadline_service.py` does NOT reference `ConfigDefaults.REPORTING_GRACE_DAYS`; currently red at `:52`.
  2. New behavioural test `tests/backend/pytest/test_kri_deadline_classify_red.py` (using `client_factory`-style fixtures or pure unit tests of `KRIDeadlineService.classify`): for representative `(KeyRiskIndicator, frequency, today, last_period_end)` tuples, assert the output `(period_end, due, reporting_owner_id, is_breached)` matches what the current pre-collapse `_resolve_period_end` + `_due_date` + `_reporting_owner_id` chain returns. Pre-collapse the test enforces equivalence against the existing in-place computation; post-collapse it pins the new helper's contract.
  3. New TOML `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` with sections for `period_algebra_consumers`, `reporting_grace_days_consumers`, and `kri_history_service_static_method_consumers`. Initial entries documented in the lock test.
- Code/file changes:
  - Create `docs/adr/ADR-012-kri-time-series-period-algebra.md`. Contents (no length cap):
    - Status: Accepted.
    - Context: Period-algebra and `REPORTING_GRACE_DAYS` were duplicated and reached via `KRIHistoryService` static-method bridges (pinned at `_kri_history/service.py:37,38,42`) from outside the package.
    - Decision: `_kri_history/periods.py:21,50,59,87,109` is the SSOT for `(period_bounds_for_date, latest_closed_period_for_date, is_period_end_boundary, due_date, is_within_reporting_window)`. `_kri_history/constants.py:2` (`REPORTING_GRACE_DAYS = 15`) is the SSOT for the grace window. `ConfigDefaults.REPORTING_GRACE_DAYS` is removed in favor of importing the SSOT directly. Cross-package consumers go through a single named entry point (`KRIDeadlineService.classify` or equivalent), not three independent static-method calls.
    - Cross-references: ADR-001 (capabilities module unification), ADR-008 (risk threshold SSOT — same SSOT pattern), ADR-007 (bounded-context taxonomy).
    - Ties to #62: per-row audit cardinality decision (already documented in ADR for vendor-link audit, here recorded by reference for orthogonality).
    - Consequences: lock-list pins live in `_kri_state_vocabulary_allowlist.toml`; future additions to that allowlist require ADR amendment + deepening-contract review.
  - Add `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`.
  - Add `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`.
  - Add `tests/backend/pytest/test_kri_deadline_classify_red.py`.
  - Edit `backend/app/services/kri_deadline_service.py`:
    - Remove `from app.models.global_config import ConfigDefaults` line `:13` (or trim ConfigDefaults usage to non-grace-day fields if other consumers remain — see `:50,53,54`; keep ConfigDefaults for `NEAR_BREACH_THRESHOLD`, `DUPLICATE_LOOKBACK_DAYS`, etc., but remove the `REPORTING_GRACE_DAYS` line at `:52`).
    - Add `from app.services._kri_history.constants import REPORTING_GRACE_DAYS` (or import from `kri_history_service` re-export).
    - Replace `_resolve_period_end` (`:75-81`) and `_due_date` (`:62-64`) static helpers with a single `KRIDeadlineService.classify(kri, *, today)` that returns a frozen `KriDeadlineClassification` dataclass with `(period_end, due, reporting_owner_id, …)` computed via `period_bounds_for_date` / `latest_closed_period_for_date` / `due_date` imports from `_kri_history/periods` (or via the `KRIHistoryService` re-export, but consolidated to ONE call).
    - `_process_single_kri` (`:233-269`) consumes the new `classify` result.
  - Edit `backend/app/services/kri_deadline_support.py:36` — drop the `ConfigDefaults.REPORTING_GRACE_DAYS` fallback in `load_kri_deadline_config`; replace with `from app.services._kri_history.constants import REPORTING_GRACE_DAYS` and use it as the default.
  - Edit `backend/app/services/_config/lookup.py:26` — REMOVE the `REPORTING_GRACE_DAYS = 15` line from `ConfigDefaults`. (If any remaining consumer reaches `ConfigDefaults.REPORTING_GRACE_DAYS`, the lock test enumerates them; per Phase 2-B verification, only `kri_deadline_service.py:52` and `kri_deadline_support.py:36` reach it.)
- Lock/TOML/contract updates:
  - New file: `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` (contents per task brief).
  - New lock test: `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`.
  - The makefile target `test-architecture-locks` already discovers tests in `tests/backend/pytest/architecture/`; verify by running it after creation.
- README / doc updates:
  - `docs/adr/README.md` — add ADR-012 row to the index.
  - `docs/security/authorization-capability-contract.md` — no edit required (the contract does not pin `REPORTING_GRACE_DAYS` SSOT; the ADR is the new authority).
  - `backend/app/services/_kri_history/README.md` — add a one-line "see ADR-012" link.
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/test_kri_deadline_classify_red.py tests/backend/pytest/test_kri_deadline_service.py tests/backend/pytest/test_kri_history.py tests/backend/pytest/test_kris_history_listing_api.py tests/backend/pytest/test_kris_value_submission_api.py` (every period-algebra-using suite).
  - `rg "ConfigDefaults.REPORTING_GRACE_DAYS|REPORTING_GRACE_DAYS = 15"` returns hits ONLY in `_kri_history/constants.py`.
  - `rg "KRIHistoryService\\.(due_date|period_bounds_for_date|latest_closed_period_for_date)" backend/` returns hits only inside `_kri_history/` (the static-method bridges) plus the single new `classify` call site in `kri_deadline_service.py`.
- Commit boundary: SINGLE COMMIT. ADR + lock test + TOML + collapse code change + ConfigDefaults removal must land together; otherwise the lock test goes red on the next CI run.
- Rollback note: revert restores the `_config/lookup.py:26` duplicate, the three static-method reaches, and removes the ADR/lock/TOML. The behavioural classify test prevents silent regression of the per-call semantics.
- Effort: M (ADR draft + lock test + TOML + code collapse + ConfigDefaults pruning).

---

## Domain dep graph (in-domain)

```
#3 ────────────────── standalone (cluster D)
#24 ──┬── atomic ── #51 (cluster A; shared seam: kris/linked_vendors.py:3)
#51 ──┘
#25 ────────────────── standalone (cluster I — new) — touches kris/ endpoints; sequencing-friendly with #24 but not atomic
#26 ────────────────── standalone (cluster E)
#50 ────────────────── standalone (cluster B)
#52 ────────────────── standalone (cluster C)
#62 ────────────────── standalone (cluster F) — defer overruled, not blocked by #69
#73 ────────────────── standalone (cluster H) — touches kri_deadline_service.py and _config/lookup.py
```

### Recommended sequential execution order (single-developer, sequential per repo rules)

1. **#3** — smallest delete; validates the structural-absence-test pattern.
2. **#52** — same pattern, single backend file + 2 lock lines.
3. **#50** — same pattern, single backend file + 1 lock-tuple entry + 5 doc citations.
4. **#24 + #51** — atomic cluster A; one commit.
5. **#26** — frontend pattern verification (file delete + 5 import sites + ESLint pin + README prose).
6. **#25** — endpoint refactor; lands cleanly after #24's import-tree settles (so the new helper sees a stable `linked_vendors` resolution).
7. **#62** — relocation + per-row audit rewrite + 4 importers; lock-line travels with the file.
8. **#73** — ADR + lock test + TOML + classify collapse + ConfigDefaults pruning.

This order minimises lock-test churn: each step lands its own structural assertion before the next step runs, and no two steps fight over the same file or lock line.

---

## Cross-domain notes

- **#24 / #51 + cap-contract docs (out-of-domain):** the 6 doc citations in `docs/security/authorization-capability-contract.{md:116,117,118, json:368,388,410}` cross the documentation-surface domain. Coordinate with the docs-domain plan loop to ensure no parallel rewrite collides on the same MD/JSON cells. The documentation-surface plan must absorb these 6 citation updates as joint deliverables of cluster A's commit (single commit, written here).
- **#50 + cap-contract docs:** 5 doc citations (md:117,118,161 + json:389,411) are similarly cross-cutting; same coordination note.
- **#51 + cap-contract docs:** same 5 citations as #50 (the strings overlap: both files appear in the same service-policy chains).
- **#26 + ESLint + frontend domain:** the ESLint config touch crosses the frontend-architecture-domain plan. Coordinate the rule deletion at `eslint.config.js:145-158` to ensure no other frontend item re-introduces a file-targeted block on a `KRIForm.tsx` ghost path.
- **#62 + vendor governance (out-of-domain):** the relocation moves the file under `_vendor_links/`, which is under the vendor-governance plan domain's authority. The vendor-governance domain plan must accept the new path as a permitted vendor-link service file in `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:12-17`. The KRI domain owns the rewrite of `assign_vendors_to_kri` and the per-row audit decision; the vendor-governance domain owns the decision that `link_vendor_target`/`unlink_vendor_target` are the canonical surface (already established at `_vendor_links/workflow.py:265-333`).
- **#62 NOT blocked by #69:** Phase 2-B verified table-shape independence. The vendor-link mixin/polymorphic merge (#69) and #62 are orthogonal. The audit-cardinality decision (per-row, recorded in this plan and in ADR-012 cross-reference) is the real prerequisite the dev's defer was guarding; this plan answers it explicitly.
- **#73 + ConfigDefaults removal (cross-cutting):** removing `REPORTING_GRACE_DAYS` from `ConfigDefaults` at `_config/lookup.py:26` reaches outside the KRI domain into shared config infrastructure. Verify with `rg "ConfigDefaults\\.REPORTING_GRACE_DAYS" backend/` that the only consumers are `kri_deadline_service.py:52` and `kri_deadline_support.py:36` (Phase 2-B confirmed); if any cross-domain consumer surfaces, escalate to the cross-cut plan loop before removal.
- **#73 + the classify collapse:** consolidates three static-method bridges (`_kri_history/service.py:37,38,42`). The bridges themselves stay (they remain the API-package's compatibility seam) but no out-of-package call site reaches them once `kri_deadline_service.py` is collapsed. The lock test enforces this.

---

## Effort summary

| Item | Effort | Cluster | Sequence |
|------|--------|---------|----------|
| #3   | S      | D       | 1        |
| #52  | S      | C       | 2        |
| #50  | S      | B       | 3        |
| #24  | S (in cluster A: combined S/M) | A | 4 |
| #51  | S (in cluster A: combined S/M) | A | 4 |
| #26  | S      | E       | 5        |
| #25  | S      | I       | 6        |
| #62  | M      | F       | 7        |
| #73  | M      | H       | 8        |

Total domain effort: 7×S + 2×M ≈ 1.5–2 days of focused work for a single developer, sequential. No parallelism assumed.
