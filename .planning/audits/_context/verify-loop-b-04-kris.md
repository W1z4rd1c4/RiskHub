# Verify Loop B (Adversarial) — Domain 4: KRI history + KRI form + KRI vendor assignment

Phase 2-B re-verifies Loop A verdicts (`.planning/audits/_context/verify-loop-a-04-kris.md`)
against current repo state. Hallucinated quotes are the dominant failure mode;
doc/lock-only Reject arguments are INVALID; Defers must be planned, not blanket.

Convention: `file:line` + ≤15-word verbatim quotes.

Items in domain: #3 S3.11, #24 S3.4, #26 S3.9, #50 S3.2, #51 S3.3, #52 S3.5, #62 S5.9, #73 ADR-012.

---

## Item #3 — Loop A said: PROCEED. 0 prod importers, 1 test importer; lock symbol-list excludes `buildVendorContextWarning`.

- **Quote check**: PASS.
  - `frontend/src/components/kri-form/kriFormWorkflow.ts:6` — `export function buildVendorContextWarning({` (verbatim).
  - File total length 14 lines (matches Loop A "14 lines").
- **Importer count check**: PASS.
  - `rg "buildVendorContextWarning|kriFormWorkflow" frontend tests` returns exactly:
    - `frontend/src/components/kri-form/kriFormWorkflow.ts:6` (definition).
    - `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8` — `import { buildVendorContextWarning } from '@/components/kri-form/kriFormWorkflow';`
    - same file lines 28-29 (test usages).
  - 0 production callers confirmed.
- **Lock check**: PASS.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1330` — `def test_frontend_workflow_helpers_are_used_by_production_code`.
  - Tuple at lines 1331-1340 lists `nextEntityFormStep`, `previousEntityFormStep`, `resolveSubmitOutcome`, `resetLinkPaginationOnSearch`, `resolveLinkActionOutcome`, `buildQuestionnaireComparisonModel`, `buildOrphanResolutionLabel`, `resolveOrphanStaleTarget`. **`buildVendorContextWarning` is NOT in the list** — Loop A's claim verified verbatim.
- **Cluster atomicity (#24+#51)**: N/A.
- **Defer override soundness**: N/A — original verdict was Accept.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Item #24 — Loop A said: PROCEED. 4 prod importers, 6 doc citations (3 MD + 3 JSON); cluster atomic with #51.

- **Quote check**: PASS.
  - `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` — `from app.services._kri_history.value_application import visible_linked_vendors` (verbatim).
  - File total 5 lines (Loop A's "6-line file" claim is OFF-BY-ONE — file is 5 lines including `__all__`; minor).
- **Importer count check**: PASS (4).
  - `backend/app/api/v1/endpoints/kris/crud/create.py:22` — `from ..linked_vendors import visible_linked_vendors`
  - `backend/app/api/v1/endpoints/kris/crud/restore.py:17` — same import
  - `backend/app/api/v1/endpoints/kris/crud/breaches.py:18` — same import
  - `backend/app/api/v1/endpoints/kris/crud/detail.py:15` — same import
- **Doc-citation check**: PASS (6 strings).
  - `docs/security/authorization-capability-contract.md:116,117,118` — all three name `kris/linked_vendors.py`.
  - `docs/security/authorization-capability-contract.json:368,388,410` — three `backend_authority` strings name the file.
- **Cluster atomicity (#24+#51)**: CONFIRMED.
  - `kris/linked_vendors.py:3` literally re-exports through the value_application shim. If #51 deletes `value_application.py` first, this line breaks. If #24 deletes the barrel first, the 4 endpoint callers break unless rewritten. Both fixes touch the SAME LINE/FILE chain. Atomic-cluster framing is sound. (Minor: a strict-ordered split is technically possible if barrel is deleted before shim, but the doc-citation churn is identical, so single-commit framing is defensible.)
- **Defer override soundness**: N/A — original verdict was Accept-with-mod.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT** (off-by-one on line count is trivia, not material).

---

## Item #26 — Loop A said: PROCEED. 1 prod importer (`KRINewPage.tsx`); 4 test sites; ESLint rule pinned at `eslint.config.js:146`. NO `KRIEditPage.tsx` exists.

- **Quote check**: PASS.
  - `frontend/src/components/KRIForm.tsx` (entire file, 2 lines):
    - `:1` — `export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`
    - `:2` — `export type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`
- **KRIEditPage.tsx check**: PASS.
  - `find frontend/src -iname "*KRIForm*"` returns 12 files in `kri-form/` plus `KRIForm.tsx` and `kriFormValidation.ts`. **No `KRIEditPage.tsx`.**
  - `find frontend/src/pages -iname "*kri*"` returns: `KRIsPage.tsx`, `KRINewPage.tsx`, `KRIDetailPage.tsx`, `kris/KRIsTableSection.tsx`, `kris/kriPagePresentation.ts`, `kris/useKrisPageState.ts`, `detail/useKriDetailState.ts`. None are an "edit" page.
  - `KRIDetailPage.tsx` and `KRIsPage.tsx` were checked: neither imports `KRIForm` (grep returned no output).
- **Importer count check**: PASS (1 prod + 4 tests).
  - Prod: `frontend/src/pages/KRINewPage.tsx:5` — `import { KRIForm } from '@/components/KRIForm';`
  - Tests:
    - `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5`
    - `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4`
    - `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66` — `vi.mock('@/components/KRIForm', () => ({`
    - `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32` — `vi.mock('@/components/KRIForm', () => ({`
- **ESLint rule check**: PASS verbatim.
  - `frontend/eslint.config.js:146` — `files: ["src/components/KRIForm.tsx"],`
  - `:148-150` — `"max-lines": ["error", { max: 25, skipBlankLines: true, skipComments: true }],`
  - `:152-155` — `"max-lines-per-function": ["error", { max: 25, ... }],`
  - `:156` — `complexity: ["error", 2],`
  - Rule MUST be removed alongside file deletion (otherwise lint loses target).
- **Cluster atomicity (#24+#51)**: N/A.
- **Defer override soundness**: N/A — original verdict was Accept-with-mod.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Item #50 — Loop A said: PROCEED. 22-line wrapper, 0 prod, lock-line `:998`.

- **Quote check**: PASS (with minor note).
  - `backend/app/services/_kri_history/submission.py:9` — `async def _create_kri_submission_approval(`
  - File body (verified via Read): 22 lines total (header through return). Lines 6 and 16 are the canonical-name import and forward-call:
    - `:6` — `from .approval_intake import create_kri_submission_approval`
    - `:16-21` — `return await create_kri_submission_approval(db, kri=kri, data=data, current_user=current_user,)`
- **Importer count check**: PASS (0 prod).
  - `rg "_kri_history.submission|_create_kri_submission_approval"` returns:
    - the file itself (`:9`)
    - `tests/backend/pytest/test_architecture_deepening_contracts.py:998` — `"from app.services._kri_history.submission import _create_kri_submission_approval"` (negative-assertion).
  - Doc citations naming the file as service-policy: `docs/security/authorization-capability-contract.md:117,118`, `docs/security/authorization-capability-contract.json:389,411`. (Loop A claimed "4 doc-citation strings" — verified, confirmed.)
- **Lock check**: PASS verbatim.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:997-1002`:
    ```
    for private_import in (
        "from app.services._kri_history.submission import _create_kri_submission_approval",
        ...
    )
        assert private_import not in route_sources
    ```
  - This is a NEGATIVE-assertion list. If `submission.py` is deleted, the line `:998` inside this list is dead but not breaking — it asserts the string is absent from a route source, which remains true. So the lock-line "must be relaxed" is accurate but the failure mode is benign (still passes if string absent everywhere).
- **Cluster atomicity (#24+#51)**: N/A — standalone.
- **Defer override soundness**: N/A — original verdict was Accept.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Item #51 — Loop A said: PROCEED. 7-line shim, 3 prod importers (one is #24's barrel); atomic with #24.

- **Quote check**: PASS.
  - `backend/app/services/_kri_history/value_application.py` (verified entire file):
    - `:1` — `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors`
    - `:3-7` — `__all__ = ["apply_kri_value_directly", "run_best_effort_notification", "visible_linked_vendors",]`
  - File length 8 lines (Loop A said "7 lines total"). Off by one but immaterial.
- **Importer count check**: PASS (3 via shim).
  - `backend/app/services/_register_listings/kris.py:31` — `from app.services._kri_history.value_application import visible_linked_vendors`; call at `:402` — `linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", []))`. Verified.
  - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` — same import; call at `:200` — `linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", []))`. Verified.
  - `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` — same import (this is the #24 barrel).
  - `apply_kri_value_directly` and `run_best_effort_notification` not imported via the shim by any production module — verified via direct grep against `value_application` (only `visible_linked_vendors` is consumed).
- **Cluster atomicity (#24+#51)**: CONFIRMED.
  - The shared seam IS the line `kris/linked_vendors.py:3`. Both #24 and #51 force a rewrite of that import line. Same 4 doc citations cite both `value_application.py` (md:117,118 + json:389,411) and `kris/linked_vendors.py` (md:116,117,118 + json:368,388,410). Single-commit framing required.
- **Lock check**: PASS verbatim.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:976` — `value_application_path = "backend/app/services/_kri_history/value_application.py"`
  - `:979-980` — `assert "_apply_kri_value_directly" not in _source(value_application_path)` and `assert "_run_best_effort_notification" not in _source(value_application_path)`. If file is deleted, `_source(...)` raises FileNotFoundError → tests fail. Lock MUST be relaxed in same commit.
- **Defer override soundness**: N/A — original verdict was Accept-with-mod.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Item #52 — Loop A said: PROCEED. 14 lines, 0 prod, only lock-pinned at `:962`.

- **Quote check**: PASS verbatim.
  - `backend/app/services/_kri_history/correction_plans.py` (file length 14 lines including blanks):
    - `:7-10` — `@dataclass(frozen=True)\nclass KriCorrectionDraft: entry_id: int, pending_changes: dict[str, Any]`
    - `:13-14` — `def build_kri_correction_plan(*, entry_id: int, pending_changes: dict[str, Any]) -> KriCorrectionDraft:\n    return KriCorrectionDraft(entry_id=entry_id, pending_changes=pending_changes)`
- **Importer count check**: PASS (0 prod).
  - `rg "correction_plans|build_kri_correction_plan|KriCorrectionDraft"` returns:
    - the file itself
    - `tests/backend/pytest/test_architecture_deepening_contracts.py:956` — `from app.services._kri_history import approval_intake, correction_plans, direct_application, governance, projection`
    - `:962` — `assert hasattr(correction_plans, "build_kri_correction_plan")`
  - **The architecture lock is the ONLY thing keeping this file alive.** Loop A verified.
- **Cluster atomicity (#24+#51)**: N/A — standalone.
- **Defer override soundness**: N/A — original verdict was Accept.
- **Blocker missed**: none.
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Item #62 — Loop A said: PROCEED with sequenced split (relocate first, then route through canonical with bulk-reconciliation primitive). Defer override on #69 dependency.

- **Quote check**: PASS verbatim.
  - `backend/app/services/kri_vendor_assignment.py:81` — `async def assign_vendors_to_kri(`
  - `:91-102` — VendorRiskLink mutation block:
    - `:91` — `if normalized_parent_vendor_ids:`
    - `:102` — `db.add(VendorRiskLink(vendor_id=vendor_id, risk_id=kri.risk_id))`
  - `:104-117` — VendorKRILink reconciliation:
    - `:112` — `await db.delete(link)` (within a `for link in current_links` loop)
    - `:117` — `db.add(VendorKRILink(vendor_id=vendor_id, kri_id=kri.id))`
  - **0 audit emissions** in this entire bulk path (no `vendor_link_created` / `vendor_link_deleted` calls). Verified by reading entire 119-line file.
- **Canonical workflow audit emission**: PASS verbatim.
  - `backend/app/services/_vendor_links/workflow.py:265` — `async def link_vendor_target(`
  - `:285-292` — `await vendor_link_created(db, actor=current_user, vendor=vendor, link_kind=kind, target_id=entity_id, log_activity_func=log_activity_func,)`
  - `:301` — `async def unlink_vendor_target(`
  - `:321-328` — `await vendor_link_deleted(db, actor=current_user, vendor=vendor, link_kind=kind, target_id=entity_id, log_activity_func=log_activity_func,)`
  - Loop A's "bulk path emits NONE" claim is fully verified against current code.
- **Importer count check**: PASS (4 prod).
  - `backend/app/api/v1/endpoints/kris/crud/create.py:16` — `from app.services.kri_vendor_assignment import (assign_vendors_to_kri, validate_assignable_vendors,)`
  - `backend/app/services/_approval_execution/kri_generic_edit.py:16` — `from app.services.kri_vendor_assignment import assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids`
  - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` — `from app.services.kri_vendor_assignment import assign_vendors_to_kri`
  - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — `from app.services.kri_vendor_assignment import normalize_vendor_ids, validate_assignable_vendors`
  - Plus 1 test (`tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`) and 1 architecture-lock pin (`tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` — file path is in `VENDOR_SERVICE_FILES`).
- **Architecture-lock check**: PASS verbatim.
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` — `REPO_ROOT / "backend/app/services/kri_vendor_assignment.py",`
  - The file path travels with the file when relocated; lock list MUST update on move. Loop A verified.
- **Cluster atomicity (#24+#51)**: N/A.
- **Defer override soundness**: PARTIAL. Loop A's argument has two halves:
  - **Half A (table shape independence from #69)**: SOUND. `VendorRiskLink` and `VendorKRILink` are concrete tables today (`backend/app/models/vendor_kri_link.py:16-26`, `backend/app/models/vendor_risk_link.py:16-28`). #69's mixin/polymorphic merge changes table inheritance, not the *interface* `link_vendor_target`/`unlink_vendor_target` exposes. Relocation + canonical-routing is genuinely orthogonal to table shape.
  - **Half B (audit-cardinality concern unaddressed)**: RISKY. The dev's actual defer reason in `developer answer.md:710` is "Doing it early risks mismatched audit cardinality or link semantics." Today: 0 audit events for any bulk reconciliation. After Loop A's recommended fix: N events for an N-row reconciliation. This IS a customer-visible audit-log shape change. Loop A acknowledges this implicitly ("Recommended sequence ... add a bulk-reconciliation function ...") but does NOT plan WHAT semantics the new bulk function should expose (one rolled-up event vs N individual events). Without that decision, Loop A's "Proceed" is incomplete.
  - Net: Loop A is right that #69 is not a hard blocker, but the audit-emission semantic decision is the *real* unresolved question, and Loop A has only relocated the question, not answered it.
- **Blocker missed**: NONE for tables, but the audit-cardinality question must be answered before the consolidation lands.
- **Final Phase 2-B verdict**: **CORRECT-WITH-CORRECTION**. Loop A's defer-override is sound on the #69 dependency claim; the audit-cardinality semantics decision must be planned explicitly (one-event-per-reconciliation vs N-events) and is the real prerequisite the dev's defer was guarding.

---

## Item #73 — Loop A said: PROCEED. ADR-012 file does not exist; period algebra real and load-bearing; duplicate `REPORTING_GRACE_DAYS` confirmed.

- **Quote check**: PASS verbatim.
  - `backend/app/services/_kri_history/periods.py:21` — `def period_bounds_for_date(target_date: clock.date, frequency: str) -> Tuple[clock.date, clock.date]:`
  - `:50` — `def latest_closed_period_for_date(target_date: clock.date, frequency: str) -> Tuple[clock.date, clock.date]:`
  - `:59` — `def is_period_end_boundary(period_end: clock.date, frequency: str) -> bool:`
  - `:87` — `def due_date(period_end: clock.date) -> clock.date:`
  - `:93` — `return period_end + timedelta(days=REPORTING_GRACE_DAYS)`
  - `:109` — `def is_within_reporting_window(period_end: clock.date, as_of: clock.date | None = None) -> bool:`
  - File ends at line 113 (Loop A "21-113" range accurate).
- **Constants duplicate check**: PASS (and a SECOND duplicate Loop A missed mentioning).
  - `backend/app/services/_kri_history/constants.py:1-2` — `# Reporting grace window in days after period end\nREPORTING_GRACE_DAYS = 15`
  - `backend/app/services/_config/lookup.py:26` — `REPORTING_GRACE_DAYS = 15` (this is the `ConfigDefaults` duplicate — Loop A and dev's audit referenced "ConfigDefaults" without the file path; verified).
  - `backend/app/services/kri_deadline_service.py:52` — `REPORTING_GRACE_DAYS = ConfigDefaults.REPORTING_GRACE_DAYS` (third reach via ConfigDefaults).
  - Loop A's "duplicate constant" claim is correct; the duplicate is at `_config/lookup.py:26`, not in `_kri_history/constants.py` (the latter is the SSOT under ADR-012).
- **Cross-service reach check**: PASS verbatim.
  - `backend/app/services/kri_deadline_service.py:64` — `return KRIHistoryService.due_date(period_end)`
  - `:77` — `_, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)`
  - `:78` — `_, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)`
  - Three static-method reaches verified at exact line numbers Loop A cited (`:62-81` range).
- **ADR file check**: PASS.
  - `ls docs/adr/` returns ADR-001 through ADR-010 plus README.md. **No ADR-011, no ADR-012.** Confirmed.
- **Cluster atomicity (#24+#51)**: N/A.
- **Defer override soundness**: N/A — original verdict was Accept (write ADR doc).
- **Blocker missed**: none. Implementation cleanup (collapsing `KRIHistoryService` static-method reaches) is explicitly out of scope per dev answer line 821 ("plan implementation cleanup separately") and audit line 2105 ("implementation cleanup ... separate Tier-3 follow-up").
- **Final Phase 2-B verdict**: **CORRECT**.

---

## Adversarial summary

| # | Loop A verdict | Phase 2-B verdict | Adversarial finding |
|---|---|---|---|
| 3 | PROCEED | **CORRECT** | All quotes, importer count, lock symbol-list check verbatim; nothing changed since Loop 0 |
| 24 | PROCEED | **CORRECT** | All 4 prod importers + 6 doc citations verified; cluster atomicity sound (off-by-one on file length is trivia) |
| 26 | PROCEED | **CORRECT** | No `KRIEditPage.tsx` exists; ESLint rule at `eslint.config.js:146` confirmed verbatim; 1 prod + 4 test sites |
| 50 | PROCEED | **CORRECT** | 0 prod importers; lock at `:998` is negative-assertion (relaxation is benign) |
| 51 | PROCEED | **CORRECT** | 3 prod importers via shim verified; cluster atomicity with #24 confirmed; lock `:976-980` would FileNotFoundError on delete |
| 52 | PROCEED | **CORRECT** | 0 prod, only lock at `:962` keeps file alive |
| 62 | PROCEED w/ sequenced split | **CORRECT-WITH-CORRECTION** | Defer override on #69 table-shape grounds is sound; audit-cardinality semantics decision (1 event vs N events for bulk reconciliation) is the actual unresolved question Loop A inherited from dev's defer and only relocated, did not answer |
| 73 | PROCEED | **CORRECT** | ADR file genuinely absent; period algebra at `periods.py:21-113` verbatim; ConfigDefaults duplicate at `_config/lookup.py:26` (location detail Loop A elided) |

### Adversarial focus area answers (per task brief)

1. **#24 + #51 atomic cluster — same code seam?** YES. `kris/linked_vendors.py:3` is `from app.services._kri_history.value_application import visible_linked_vendors`. Both items rewrite that exact line. 6 of the 6 doc citations overlap. Cluster atomicity CONFIRMED.

2. **#26 `KRIForm.tsx` — does any other KRI edit page exist?** NO. `find frontend/src -iname "*kri*"` and `find frontend/src/pages -iname "*kri*"` enumerate every KRI-related path. There is no `KRIEditPage.tsx`. `KRIDetailPage.tsx` and `KRIsPage.tsx` were grep-checked for `KRIForm` imports — neither imports it. Loop A's importer count of 1 production + 4 tests is correct.

3. **#62 vendor assignment audit emission gap real?** YES. `kri_vendor_assignment.py:81-117` directly calls `db.add(VendorRiskLink(...))`, `db.delete(link)`, `db.add(VendorKRILink(...))` with NO audit emission. Canonical `_vendor_links/workflow.py:285,322` calls `vendor_link_created`/`vendor_link_deleted`. The asymmetry is real, present, and unrelated to #69's table-shape work.

4. **#62 NOT blocked by #69 — does Loop A's recommendation conflict with #69's mixin/polymorphic shape?** NO direct conflict. #69 changes table inheritance; the public surface of `link_vendor_target`/`unlink_vendor_target` (which Loop A wants the bulk reconciliation to call into) is table-agnostic. **However**, Loop A's recommendation introduces a NEW bulk-reconciliation primitive in `_vendor_links/workflow.py`, and the choice between rolled-up and per-row audit semantics is an unresolved customer-visible decision that the dev's defer was guarding. Recommend Loop A treat this as a sub-task with an explicit semantic decision before #62 lands.

5. **#73 ADR-012 algebra — `_kri_history/periods.py:21-113` SSOT vs `_kri_history/constants.py:1-2` `REPORTING_GRACE_DAYS`?** SSOT verified at periods.py. The `constants.py` value is the ONE consumed by `periods.py:9` (`from .constants import REPORTING_GRACE_DAYS`) and by `kri_history_service.py:8`, so it is *part of* the SSOT, not a duplicate of it. The actual DUPLICATE is `_config/lookup.py:26` (`REPORTING_GRACE_DAYS = 15` inside the `ConfigDefaults` class), reached via `kri_deadline_service.py:52` (`REPORTING_GRACE_DAYS = ConfigDefaults.REPORTING_GRACE_DAYS`) and `kri_deadline_support.py:36` (`get_config_int(db, "reporting_grace_days", ConfigDefaults.REPORTING_GRACE_DAYS)`). Loop A's framing was directionally right but mis-located the duplicate (it called `_kri_history.constants` and `ConfigDefaults` two duplicates; in fact `_kri_history.constants` is the SSOT and only `_config/lookup.py:26` is the duplicate to collapse via ADR-012).

6. **ESLint rule at `eslint.config.js:146` — must be removed alongside #26?** YES. Verified verbatim:
   - `:146` — `files: ["src/components/KRIForm.tsx"],`
   - `:148-156` — pins `max-lines: 25`, `max-lines-per-function: 25`, `complexity: 2` to that exact path.
   - With the file deleted, ESLint will not fail (the rule simply has no target), but the rule line is dead config and MUST be deleted in the same commit for hygiene. Loop A's coupling claim sound.

### Hallucination check

- All quoted code lines were re-read against current files. No fabricated quotes found.
- One off-by-one on `value_application.py` line count (Loop A "7 lines"; actual 8). Trivial.
- One off-by-one on `kris/linked_vendors.py` line count (Loop A "6-line file"; actual 5 lines). Trivial.
- One mis-framing for #73: Loop A called `_kri_history.constants` a duplicate; it is the SSOT. The actual duplicate is `_config/lookup.py:26`. This is a *correction*, not a fabrication — the duplicate exists, just not where Loop A pointed.

### Defer-override audit

- Only #62 had a Defer that Loop A overruled. The override rests on TWO claims:
  1. **Table-shape independence from #69** — VERIFIED SOUND.
  2. **Audit-emission gap is a current bug worth fixing now** — VERIFIED REAL but the dev's actual defer reason ("audit cardinality semantics") is unresolved by Loop A.
- Recommend Phase 2-B's downstream planning treat the bulk-reconciliation audit-cardinality decision as an explicit sub-step of #62, not just a sequencing footnote.

### Atomic-commit clusters (verified)

| Cluster | Items | Why atomic |
|---|---|---|
| A | #24 + #51 | Share `kris/linked_vendors.py:3` import line; share 6 doc citations |
| B | #50 | Standalone — lock-line `:998` (negative-assertion) + 4 doc citations |
| C | #52 | Standalone — only lock `:962` keeps file alive |
| D | #3 | Standalone — file + test, no lock-list churn |
| E | #26 | Page rewrite + 4 test sites + ESLint rule at `:146` + README prose |
| F | #62 | Relocate file (architecture lock at `boundaries_red.py:16` travels) + design+add bulk reconciliation primitive in `_vendor_links/workflow.py` (with explicit audit-cardinality decision) + swap 4 callers. Independent of #69. |
| G | #73 | ADR document only; no code edits |

### Non-prerequisites confirmed (overruling dev Defer for #62)

- #62 does NOT require #69 (table mixin/polymorphic merge). Verified by reading link models — they are concrete tables and `link_vendor_target`/`unlink_vendor_target` operate at a level above the table shape.
- #62 DOES require an explicit audit-cardinality decision (rolled-up vs per-row events for bulk reconciliation) before consolidation lands — the dev's defer was guarding this and Loop A only relocated the question.
