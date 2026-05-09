# Verify Loop A — Domain 4: KRI history + KRI form + KRI vendor assignment

Phase 2 verification re-checking findings #3, #24, #26, #50, #51, #52, #62, #73 against
current repo state. User overruled Reject/Defer arguments grounded only in docs/locks.

Convention: file:line + ≤15-word quotes.

---

## #3 — S3.11 Frontend `kriFormWorkflow.ts` delete

- **Original**: Accept (P2)
- **Current verdict**: PROCEED — Phase 1 confirmed; nothing changed in current tree
- **Code state (verified)**:
  - `frontend/src/components/kri-form/kriFormWorkflow.ts:6` — `export function buildVendorContextWarning({`
  - File is 14 lines: a `VendorContextWarningInput` interface plus one trivial pure helper.
- **Importers**:
  - 0 production importers (grep across `frontend/src/`).
  - 1 test importer: `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8` —
    `import { buildVendorContextWarning } from '@/components/kri-form/kriFormWorkflow';`
  - Cleanup-audit corroboration: `tests/results/quality/frontend/cleanup-audit/unreachable.md:10` —
    "`kriFormWorkflow.ts` | no-ref | proven-unused | No imports/exports reference this module."
- **Architecture-lock contact**:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1330` —
    `def test_frontend_workflow_helpers_are_used_by_production_code`. The asserted symbol
    list at lines 1331-1340 does **not** include `buildVendorContextWarning`, so deletion
    does not require relaxing this lock. Audit note at line 1576 about same-commit lock
    relaxation is OUTDATED — the lock already excludes this symbol.
- **Coupled artifacts (must move with delete)**:
  - File: `frontend/src/components/kri-form/kriFormWorkflow.ts` (delete)
  - Test: `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8,28-29` (delete or rewrite)

---

## #24 — S3.4 KRI linked-vendors barrel removal

- **Original**: Accept w/ mod (citation/doc updates)
- **Current verdict**: PROCEED — confirms 6-line barrel; 4 prod importers; 5 doc citations
- **Code state (verified)**:
  - `backend/app/api/v1/endpoints/kris/linked_vendors.py:1-5` — 6-line file:
    `from app.services._kri_history.value_application import visible_linked_vendors`
    `__all__ = ["LinkedVendorRead", "User", "visible_linked_vendors"]`
- **Production importers (4)**:
  - `backend/app/api/v1/endpoints/kris/crud/breaches.py:18` — `from ..linked_vendors import visible_linked_vendors`
  - `backend/app/api/v1/endpoints/kris/crud/detail.py:15` — `from ..linked_vendors import visible_linked_vendors`
  - `backend/app/api/v1/endpoints/kris/crud/create.py:22` — `from ..linked_vendors import visible_linked_vendors`
  - `backend/app/api/v1/endpoints/kris/crud/restore.py:17` — `from ..linked_vendors import visible_linked_vendors`
  - (call sites: `breaches.py:68`, `detail.py:50`, `create.py:99`, `restore.py:85`)
- **Doc citations that must move atomically**:
  - `docs/security/authorization-capability-contract.md:116` (AUTHZ-KRIS-READ backend_authority)
  - `docs/security/authorization-capability-contract.md:117` (AUTHZ-KRIS-WRITE backend_authority)
  - `docs/security/authorization-capability-contract.md:118` (AUTHZ-KRIS-HISTORY backend_authority)
  - `docs/security/authorization-capability-contract.json:368` — `"backend_authority": ".../kris/linked_vendors.py..."`
  - `docs/security/authorization-capability-contract.json:388` — same string in WRITE entry
  - `docs/security/authorization-capability-contract.json:410` — same string in HISTORY entry
  - = **6 citation strings across MD+JSON** (matches audit "6 citations").
- **Coupling**: shares the underlying `visible_linked_vendors` symbol with #51, so #24 and #51
  must land in one commit (otherwise either the barrel re-import dies or callers are split
  across stale paths).

---

## #26 — S3.9 KRIForm shim deletion

- **Original**: Accept w/ mod (rewrite page + test mocks first)
- **Current verdict**: PROCEED — Phase 1 confirmed 2-line shim; 5 callers (1 prod page + 4 tests)
- **Code state (verified)**:
  - `frontend/src/components/KRIForm.tsx` is 2 lines (the file ends at line 2):
    `export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`
    `export type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`
- **Importers**:
  - Production (1): `frontend/src/pages/KRINewPage.tsx:5` — `import { KRIForm } from '@/components/KRIForm';`
  - **No `KRIEditPage.tsx`** — there is no separate edit page in the tree (verified via `find`).
    The audit's hint was wrong on that file's existence; only `KRINewPage.tsx` imports.
  - Tests (4):
    - `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5` — `import { KRIForm } from "@/components/KRIForm";`
    - `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4` — `import { KRIForm } from '@/components/KRIForm';`
    - `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66` — `vi.mock('@/components/KRIForm', () => ({`
    - `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32` — `vi.mock('@/components/KRIForm', () => ({`
- **Coupled artifacts**:
  - `frontend/eslint.config.js:146` — file-targeted rule
    `files: ["src/components/KRIForm.tsx"], rules: { "max-lines": ["error", { max: 25, ...`
    must be removed when the shim is deleted.
  - `frontend/src/components/kri-form/README.md:5` — calls KRIForm.tsx the "public ... facade";
    needs prose update.
  - `docs/security/authorization-capability-contract.md:117` mentions "KRI form/list components"
    but doesn't pin `KRIForm.tsx` by name — no JSON/MD edit required.

---

## #50 — S3.2 KRI submission alias deletion

- **Original**: Accept (P2)
- **Current verdict**: PROCEED — file is a dead 22-line wrapper, no production caller
- **Code state (verified)**:
  - `backend/app/services/_kri_history/submission.py:9` — `async def _create_kri_submission_approval(`
    is a 13-line wrapper that just forwards to `create_kri_submission_approval` (line 6 import,
    line 16 call). Phase 1 finding confirmed.
- **Importers**:
  - 0 production importers of `_create_kri_submission_approval` (rg shows only the file itself).
  - The canonical name `create_kri_submission_approval` is imported by:
    - `backend/app/services/_kri_history/intake.py:12` (the only prod consumer)
    - `tests/backend/pytest/test_w1_privileged_escalation_red.py:15` and `:222`
  - Internal cross-import inside the submission file (line 6) is the only thing keeping
    this module live.
- **Coupled artifacts**:
  - Architecture-lock negative-assertion at `tests/backend/pytest/test_architecture_deepening_contracts.py:998`:
    `"from app.services._kri_history.submission import _create_kri_submission_approval"` listed
    as a forbidden import. If the module is gone, the lock can be relaxed (or just the line dropped).
  - `backend/app/services/_kri_history/README.md:21` lists `submission.py` (cosmetic).
  - 4 doc-citation strings in `docs/security/authorization-capability-contract.{md:117,118,161, json:389,411}`
    name `submission.py` in the service-policy chain — must drop in same commit.

---

## #51 — S3.3 KRI value-application shim deletion

- **Original**: Accept w/ mod (atomic with #24 + contract sync)
- **Current verdict**: PROCEED — confirms whole-file alias; 3 prod importers, 1 endpoint barrel
- **Code state (verified)**:
  - `backend/app/services/_kri_history/value_application.py:1` — entire body:
    `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors`
    plus an `__all__` list. 7 lines total. Pure re-export.
  - Canonical implementations live in `backend/app/services/_kri_history/direct_application.py`:
    - `visible_linked_vendors` at line 30
    - `run_best_effort_notification` at line 46
    - `apply_kri_value_directly` at line 92
- **Consumers of the three exports** (via `_kri_history.value_application`):
  1. `backend/app/services/_register_listings/kris.py:31` (call at `:402`) — uses `visible_linked_vendors`.
  2. `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` (call at `:200`) — uses `visible_linked_vendors`.
  3. `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` — barrel from #24, uses `visible_linked_vendors`.
  - `apply_kri_value_directly` and `run_best_effort_notification` have **0 importers via the shim**
    (they are imported directly from `direct_application` by `intake.py:13`, `approval_intake.py:37`).
  - = **3 import sites to repoint** + the shim file.
- **Coupled artifacts**:
  - Architecture-lock `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980` —
    `value_application_path = "backend/app/services/_kri_history/value_application.py"` and
    `assert "_apply_kri_value_directly" not in _source(value_application_path)`. If the file
    is deleted, these assertions need to relax (path no longer exists).
  - 4 doc-citation strings in `docs/security/authorization-capability-contract.{md:117,118,161, json:389,411}`
    name `value_application.py` in service-policy chain — same coordination as #50.
- **Sequencing**: must land in same commit as #24 (both touch `kris/linked_vendors.py:3` →
  `value_application` import that disappears).

---

## #52 — S3.5 KRI correction-plans fake seam deletion

- **Original**: Accept (P2)
- **Current verdict**: PROCEED — 14-line module with 0 prod consumers
- **Code state (verified)**:
  - `backend/app/services/_kri_history/correction_plans.py:7` — `class KriCorrectionDraft:` (frozen dataclass),
    `:13` — `def build_kri_correction_plan(*, entry_id, pending_changes) -> KriCorrectionDraft`. 14 lines total.
- **Consumers**:
  - **0 production importers** (grep across `backend/`).
  - 1 test importer: `tests/backend/pytest/test_architecture_deepening_contracts.py:956,962` —
    `from app.services._kri_history import ... correction_plans, ...` and
    `assert hasattr(correction_plans, "build_kri_correction_plan")`. **The architecture lock
    is the only thing keeping this file alive.**
- **Coupled artifacts**:
  - Lock at `test_architecture_deepening_contracts.py:962` must be relaxed in same commit.

---

## #62 — S5.9 KRI vendor assignment consolidation

- **Original**: Defer (P4) — until vendor-link migration/mixin (#69) settles
- **Current verdict**: PROCEED with sequenced execution — orchestrator NOT respecting Defer
- **Code state (verified)**:
  - `backend/app/services/kri_vendor_assignment.py:81` — `async def assign_vendors_to_kri(...)`.
    Lines 91-117 directly mutate `VendorRiskLink` and `VendorKRILink` rows
    (`db.add(VendorKRILink(vendor_id=..., kri_id=...))` at `:117`, `await db.delete(link)` at `:112`)
    **bypassing** the canonical workflow.
  - `backend/app/services/_vendor_links/workflow.py:265-333` — canonical
    `link_vendor_target` / `unlink_vendor_target` that route through `_vendor_governance.links`
    AND emit `vendor_link_created` / `vendor_link_deleted` audit events
    (`workflow.py:285,322`). Bulk path emits **none**.
- **Production importers of `kri_vendor_assignment`** (4, matches audit):
  - `backend/app/api/v1/endpoints/kris/crud/create.py:16` — `from app.services.kri_vendor_assignment import (`
  - `backend/app/services/_approval_execution/kri_generic_edit.py:16` — `assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids`
  - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` — `assign_vendors_to_kri`
  - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — `normalize_vendor_ids, validate_assignable_vendors`
- **Real prerequisite (orchestrator question)**:
  - Audit dependency graph at line 1612: `S5.9 ← S5.2 mixin` (vendor-link mixin/polymorphic table merge).
  - **NOT a hard prerequisite for relocation/audit-emission fix.** The audit-emission gap
    (Phase 1 finding labeled "REAL placement") exists today regardless of whether tables
    are unified. Two scopes inside #62:
    1. **Move into `_vendor_links/`**: pure file relocation + import rewrite. No coupling to #69.
    2. **Route through `link_vendor_target`/`unlink_vendor_target`** so audit events fire:
       coupling depends on whether the bulk-reconciliation semantics survive — `assign_vendors_to_kri`
       does add/remove in one transaction with parent-risk-vendor backfill (`:91-102`),
       which `link_vendor_target` does not currently do.
  - **Recommended sequence (no implementation steps)**: relocate first (no semantic change),
    then add a bulk-reconciliation function in `_vendor_links/workflow.py` that calls the
    canonical create/delete with audit emission, then swap callers — this is independent of #69.
- **Coupled artifacts**:
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` —
    pins the path `backend/app/services/kri_vendor_assignment.py` as a "vendor governance
    boundary file". The lock travels with the file when relocated.

---

## #73 — S3.12 ADR-012 KRI time-series period algebra

- **Original**: Accept (P2)
- **Current verdict**: PROCEED — ADR file does not exist; period algebra is real and load-bearing
- **State of `docs/adr/`**:
  - Highest existing ADR is `ADR-010-postgres-migration-rehearsal-contract.md`.
  - Neither `ADR-011-...md` (auth scheme, finding #72) nor `ADR-012-kri-time-series.md`
    exists — confirmed by `ls docs/adr/`.
- **Period-algebra evidence (algebra is real, distributed across modules)**:
  - `backend/app/services/_kri_history/periods.py:21` — `def period_bounds_for_date(target_date, frequency)`.
  - `:50` — `def latest_closed_period_for_date(target_date, frequency)`.
  - `:59` — `def is_period_end_boundary(period_end, frequency)`.
  - `:87` — `def due_date(period_end): return period_end + timedelta(days=REPORTING_GRACE_DAYS)`.
  - `:109` — `def is_within_reporting_window(period_end, as_of=None)`.
  - `backend/app/services/_kri_history/constants.py` defines `REPORTING_GRACE_DAYS`;
    Phase 1 candidate reports a duplicate constant in `ConfigDefaults`.
  - **Cross-service reach (the leak ADR-012 must address)**:
    `backend/app/services/kri_deadline_service.py:62-81` —
    `:64` `return KRIHistoryService.due_date(period_end)`,
    `:77` `_, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)`,
    `:78` `_, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)`.
    Three static-method reaches into the `_kri_history` package from outside.
  - Other in-package callers of period algebra:
    `backend/app/services/_kri_history/recording.py:16-22` (imports `due_date`, `latest_closed_period_for_date`,
    `period_bounds_for_date`, `is_period_end_boundary`, `is_within_reporting_window`),
    `queries.py:14-19` (imports `due_date`, `latest_closed_period_for_date`, `period_bounds_for_date`,
    `reporting_owner_id`), `workflow.py:10` (`latest_closed_period_for_date`).
  - Service.py:22,38 `latest_closed_period_for_date = staticmethod(latest_closed_period_for_date)` —
    the static-method bridge the ADR is meant to lock down.
- **No existing ADR-012 file**; #73 is "create the ADR document". Implementation cleanup
  (collapsing the three KRIHistoryService reaches) is explicitly out of scope per audit
  line 2105 (Tier-3 follow-up).

---

## Summary

| # | Finding | Verdict (was) | Verdict (now) | Notes |
|---|---|---|---|---|
| 3 | S3.11 kriFormWorkflow.ts | Accept | PROCEED | 0 prod, 1 test importer; lock symbol-list excludes it |
| 24 | S3.4 kris/linked_vendors barrel | Accept w/mod | PROCEED | 4 prod importers, 6 doc citations (3 MD + 3 JSON) |
| 26 | S3.9 KRIForm.tsx shim | Accept w/mod | PROCEED | 1 prod (KRINewPage), 4 test sites; ESLint rule pinned |
| 50 | S3.2 _kri_history/submission.py | Accept | PROCEED | 22-line wrapper, 0 prod, lock-line :998 |
| 51 | S3.3 _kri_history/value_application.py | Accept w/mod | PROCEED | 7-line shim, 3 prod importers (one is #24's barrel) |
| 52 | S3.5 _kri_history/correction_plans.py | Accept | PROCEED | 14 lines, 0 prod, only lock-pinned :962 |
| 62 | S5.9 kri_vendor_assignment | Defer | PROCEED w/ sequenced split | Relocation independent of #69; audit-emission gap is current bug |
| 73 | S3.12 ADR-012 | Accept | PROCEED | No ADR-011/012 in tree; algebra evidence concrete |

### Atomic-commit clusters
- **Cluster A (#24 + #51)**: both touch `kris/linked_vendors.py:3 → value_application` →
  `direct_application` chain and the same 6 doc citations. Cannot land separately.
- **Cluster B (#50)**: standalone — only the lock line and 5 doc-citation strings move with it.
- **Cluster C (#52)**: standalone — only `test_architecture_deepening_contracts.py:962` moves.
- **Cluster D (#3)**: standalone — file + test, no lock-list churn.
- **Cluster E (#26)**: page rewrite + test mock rewrites + ESLint rule + README prose.
- **Cluster F (#62)**: relocate file (architecture lock travels) + add bulk reconciliation
  surface in `_vendor_links/workflow.py` + swap 4 callers. Independent of #69.
- **Cluster G (#73)**: ADR document only; no code edits.

### Non-prerequisites called out (overruling Defer for #62)
- #62 does NOT require #69 (vendor-link mixin/polymorphic merge). The audit-emission
  asymmetry between `assign_vendors_to_kri` and `link_vendor_target`/`unlink_vendor_target`
  exists today; relocation + canonical-routing fixes it without changing the link tables.
- #69 is a forward-only Postgres migration concern (ADR-010); #62 is a pure service-layer
  consolidation. They are orthogonal.
