# Phase 6 P6-V2 — Recipe-04 KRI empirical verification

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Mode: EMPIRICAL VERIFICATION (read actual code, quote ≤15 words).
Source: `.planning/audits/_context/recipe-04-kris.md` (lines 1-1519).
Today: 2026-05-09.

Purpose: confirm each recipe claim against the live tree, validate that the
proposed failing tests would actually fail today, sanity-check the #62
audit-cardinality decision (PER-ROW EVENTS), the #73 SSOT direction, and the
ADR-012 draft-text discipline (cite ADR-002, narrow ADR-009, omit
`## Cross-References`).

Per-finding rubric: VERIFIED / PARTIAL / STALE / FALSE-FLAG.

---

## Item #3 — `kriFormWorkflow.ts` shim deletion — VERIFIED

- File present: `frontend/src/components/kri-form/kriFormWorkflow.ts:1-14`.
  Recipe asserts 14 lines.
  `wc -l` returns 14. ✓
- Sole consumer: `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts`
  - Line 8: `import { buildVendorContextWarning } from '@/components/kri-form/kriFormWorkflow';`
  - Lines 28-29: two `expect(buildVendorContextWarning(...))` assertions. ✓
- No other production import of `kriFormWorkflow` or `buildVendorContextWarning`
  in `frontend/src/`. ✓
- Failing test (`test_kri_form_workflow_shim_is_removed`) would assert
  `not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()`.
  Today the file exists → test goes RED. ✓

Verdict: **VERIFIED**.

---

## Item #24 — `endpoints/kris/linked_vendors.py` barrel — VERIFIED

- File present: `backend/app/api/v1/endpoints/kris/linked_vendors.py:1-5`
  - Line 3: `from app.services._kri_history.value_application import visible_linked_vendors`
  - Line 5: `__all__ = ["LinkedVendorRead", "User", "visible_linked_vendors"]`
  - Imports `User`, `LinkedVendorRead` (lines 1-2). 5 lines total ✓
- 4 production importers (recipe says 4):
  - `backend/app/api/v1/endpoints/kris/crud/create.py:22`
  - `backend/app/api/v1/endpoints/kris/crud/restore.py:17`
  - `backend/app/api/v1/endpoints/kris/crud/breaches.py:18`
  - `backend/app/api/v1/endpoints/kris/crud/detail.py:15`
  All read `from ..linked_vendors import visible_linked_vendors`. ✓
- 6 doc citations:
  - `docs/security/authorization-capability-contract.md:116` — `kris/linked_vendors.py` in backend_authority ✓
  - `docs/security/authorization-capability-contract.md:117` — `kris/linked_vendors.py` in backend_authority ✓
  - `docs/security/authorization-capability-contract.md:118` — `kris/linked_vendors.py` in backend_authority ✓
  - `docs/security/authorization-capability-contract.json:368` ✓
  - `docs/security/authorization-capability-contract.json:388` ✓
  - `docs/security/authorization-capability-contract.json:410` ✓
- Failing tests (`test_kris_linked_vendors_barrel_is_removed`,
  `test_no_module_imports_value_application`) would all go RED today. ✓

Verdict: **VERIFIED**.

---

## Item #25 — KRI dept-scope helper duplication — VERIFIED (with caveat)

- `backend/app/api/v1/endpoints/kris/crud/due_soon.py:6,31` — imports and uses
  `get_user_department_ids` then performs the dept-scope filter. ✓
- `backend/app/api/v1/endpoints/kris/crud/overdue.py:6,30` — identical block. ✓
- `backend/app/api/v1/endpoints/kris/crud/breaches.py:10,41` — uses
  `get_user_department_ids` plus a `kri_read_scope_clause` fallback (recipe
  acknowledges separate shape).
- Failing test (`test_kri_endpoint_dept_scope_is_extracted`) would scan all
  three files for `get_user_department_ids` and would go RED. ✓

Caveat: `due_soon.py` and `overdue.py` have **identical** logic (true
duplicate). `breaches.py` has the same dept-filter early-exit but otherwise
follows a different SQL-build path with `kri_read_scope_clause`. The recipe
already covers this by extracting only the dept-scope predicate; the new
helper accommodates the breaches.py shape.

Verdict: **VERIFIED**. Recipe's structural lock fires red on all three files
today; the behavioural test on identical inline-vs-helper output is sound.

---

## Item #26 — `KRIForm.tsx` shim — VERIFIED

- File present: `frontend/src/components/KRIForm.tsx:1-2`. ✓
  - Line 1: `export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`
  - Line 2: `export type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`
- 1 production importer:
  - `frontend/src/pages/KRINewPage.tsx:5` — `import { KRIForm } from '@/components/KRIForm';` ✓
- 4 test sites:
  - `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5` ✓
  - `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4` ✓
  - `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66`
    (vi.mock target string) ✓
  - `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32`
    (vi.mock target string) ✓
- ESLint rule:
  `frontend/eslint.config.js:145-158` is the rule block; line 146 contains
  `files: ["src/components/KRIForm.tsx"],` exactly as recipe says. ✓
- README at `frontend/src/components/kri-form/README.md` referenced as having
  a `KRIForm.tsx` mention to strip.

Verdict: **VERIFIED**.

---

## Item #50 — `_kri_history/submission.py` — VERIFIED (line count off by 1)

- File present: `backend/app/services/_kri_history/submission.py:1-21`. Recipe
  says 22 lines; `wc -l` returns 21 (no trailing newline counted). The
  difference is cosmetic — the file body is the recipe's claimed
  `_create_kri_submission_approval` wrapper around
  `create_kri_submission_approval`. ✓
- 0 production importers. The wrapper `_create_kri_submission_approval`
  function is dead code that only gets imported by **negative-assertion**
  test strings.
- Lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:998`:
  `"from app.services._kri_history.submission import _create_kri_submission_approval"`
  inside the negative-assertion tuple at lines 997-1002. ✓
- 5 doc citations (recipe says 5):
  - `docs/security/authorization-capability-contract.md:117` — `submission.py`
    in service_policy ✓
  - `docs/security/authorization-capability-contract.md:118` — `submission.py`
    in service_policy ✓
  - `docs/security/authorization-capability-contract.md:161` — `submission.py`
    in inventory cell ✓
  - `docs/security/authorization-capability-contract.json:389` —
    `submission.py` ✓
  - `docs/security/authorization-capability-contract.json:411` —
    `submission.py` ✓

Verdict: **VERIFIED**. Line-count off-by-1 is harmless (depends on `wc -l`
behaviour with trailing newlines).

---

## Item #51 — `_kri_history/value_application.py` alias — VERIFIED (line count off by 1)

- File present: `backend/app/services/_kri_history/value_application.py:1-7`.
  Recipe says 8 lines; `wc -l` returns 7. Same trailing-newline cosmetic
  drift as #50. The file body is exactly the whole-file alias claimed.
  Line 1: `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors` ✓
- 3 production importers (recipe says 3):
  - `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` (deleted in
    same atomic cluster) ✓
  - `backend/app/services/_register_listings/kris.py:31` ✓
  - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` ✓
- Atomic-cluster integrity: deleting `kris/linked_vendors.py` AND
  `value_application.py` AND repointing the surviving 2 importers in the
  SAME COMMIT is necessary; otherwise either step alone leaves dangling
  imports. ✓ recipe correct.

Verdict: **VERIFIED**.

---

## Item #52 — `_kri_history/correction_plans.py` — VERIFIED

- File present: `backend/app/services/_kri_history/correction_plans.py:1-14`. ✓
  - Line 8: `class KriCorrectionDraft:` ✓
  - Line 13: `def build_kri_correction_plan(...)` ✓
- 0 production consumers (recipe says 0). Only kept alive by:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:956` —
    import line `from app.services._kri_history import approval_intake, correction_plans, ...`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:962` —
    `assert hasattr(correction_plans, "build_kri_correction_plan")` ✓
- Failing tests (`test_kri_history_correction_plans_is_removed`,
  `test_no_module_references_kri_correction_draft`) would go RED today. ✓

Verdict: **VERIFIED**.

---

## Item #62 — `kri_vendor_assignment.py` PER-ROW audit events — VERIFIED

### Direct mutations confirmed at the cited lines

`backend/app/services/kri_vendor_assignment.py:81-119`:
- Line 102: `db.add(VendorRiskLink(vendor_id=vendor_id, risk_id=kri.risk_id))` — direct table mutation ✓
- Line 112: `await db.delete(link)` — direct table mutation ✓
- Line 117: `db.add(VendorKRILink(vendor_id=vendor_id, kri_id=kri.id))` — direct table mutation ✓
- ZERO audit emissions: `grep` for `vendor_link_created|vendor_link_deleted|log_activity`
  returns no hits in this file. ✓

### Canonical pattern confirmed

`backend/app/services/_vendor_links/workflow.py:265-333`:
- `link_vendor_target` (line 265): emits `vendor_link_created` per row at
  line 285. ✓
- `unlink_vendor_target` (line 301): emits `vendor_link_deleted` per row at
  line 321. ✓
- Both wrap mutation+audit in try/except with `db.commit()` on success and
  `db.rollback()` on failure (atomic per-row). ✓

### 4 production importers of `kri_vendor_assignment`

- `backend/app/api/v1/endpoints/kris/crud/create.py:16-18` ✓
- `backend/app/services/_entity_mutation_lifecycle/policy.py:22` ✓
- `backend/app/services/_approval_execution/kri_generic_edit.py:16` ✓
- `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` ✓

(Plus 1 test importer at `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`.)

### PER-ROW vs ROLLED-UP decision

The PER-ROW decision is sound and matches canonical:
1. **Audit completeness over noise** — 0 events today vs canonical's per-row.
   Switching to per-row matches the existing audit-log shape; rolling up
   would invent a new schema. ✓
2. **Idempotency / replay** — per-row events let outbox replay re-create
   individual rows. ✓
3. **Customer-visible diff** — N events instead of 0 is additive; a single
   rolled-up event would silently re-shape the vendor activity feed. ✓
4. **Lock alignment** — `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
   pins the file in `VENDOR_SERVICE_FILES`. ✓

### Lock-line update

- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  currently reads `REPO_ROOT / "backend/app/services/kri_vendor_assignment.py"`. ✓
  The recipe's same-commit relocation update keeps the lock aligned with
  the new path.

### Failing tests would go RED today

- Audit cardinality test: today emits 0 events; expects ≥4. RED. ✓
- Structural relocation test: file at old path exists. RED. ✓
- "Uses canonical link mutators" test: file contains `db.add(VendorRiskLink(`,
  `db.add(VendorKRILink(`, `await db.delete(link)`. RED. ✓

Verdict: **VERIFIED**. PER-ROW EVENTS confirmed. Decision matches canonical
at `_vendor_links/workflow.py:285,322` (recipe says `:285,322`; my read
shows `:285,321` for `vendor_link_deleted` — single-line drift, harmless;
both are inside their try-block). Recipe uses both `:322` and `:321`
inconsistently in different places — should normalize on `:321`.

---

## Item #73 — ADR-012 KRI period algebra — VERIFIED with caveats

### SSOT confirmed

- `backend/app/services/_kri_history/constants.py:2`: `REPORTING_GRACE_DAYS = 15`
  is the canonical SSOT (consumed by `_kri_history/periods.py:9` and used
  in `due_date(period_end)` at `periods.py:93`). ✓
- `backend/app/services/_config/lookup.py:26`: `REPORTING_GRACE_DAYS = 15`
  inside `ConfigDefaults` is the duplicate to collapse. ✓ Direction
  confirmed: `_kri_history.constants` is canonical, `_config.lookup` is
  duplicate. Recipe correct.

### Period algebra primitives confirmed

`backend/app/services/_kri_history/periods.py`:
- Line 21: `def period_bounds_for_date(target_date, frequency)` ✓
- Line 50: `def latest_closed_period_for_date(target_date, frequency)` ✓
- Line 59: `def is_period_end_boundary(period_end, frequency)` ✓
- Line 87: `def due_date(period_end)` — uses `REPORTING_GRACE_DAYS` ✓
- Line 109: `def is_within_reporting_window(period_end, as_of)` ✓

(Recipe says `periods.py:21-113`; actual file ends at line 113. ✓)

### 3 reaches in kri_deadline_service.py

`backend/app/services/kri_deadline_service.py`:
- Line 64: `return KRIHistoryService.due_date(period_end)` ✓
- Line 77: `_, current_period_end = KRIHistoryService.period_bounds_for_date(today, kri.frequency)` ✓
- Line 78: `_, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)` ✓
- Line 52: `REPORTING_GRACE_DAYS = ConfigDefaults.REPORTING_GRACE_DAYS` ✓

Recipe accurate on all 4 lines.

### Other consumer (recipe gap)

`backend/app/services/_monitoring_status/kris.py:9` already imports
**directly** from `_kri_history.periods`:

```
from app.services._kri_history.periods import due_date, latest_closed_period_for_date
```

This file is OUTSIDE `_kri_history/` and OUTSIDE the recipe's allowlist
(recipe lists only `kri_deadline_service.py` and `kri_history_service.py`).
The lock test `test_period_algebra_consumers_are_in_allowlist` would mark
`backend/app/services/_monitoring_status/kris.py` as an offender unless
added to `_kri_state_vocabulary_allowlist.toml`.

**Recommendation**: extend the allowlist to:

```toml
[period_algebra_consumers]
files = [
    "backend/app/services/kri_deadline_service.py",
    "backend/app/services/kri_history_service.py",
    "backend/app/services/_monitoring_status/kris.py",
]
```

Without this, the lock test's first run would be a false positive against
a legitimate consumer.

### `kri_deadline_support.py:36` confirmed

`backend/app/services/kri_deadline_support.py:36`: uses
`ConfigDefaults.REPORTING_GRACE_DAYS` as the default for the
`reporting_grace_days` config key. ✓

Recipe's plan to redirect this consumer to `_kri_history.constants` is
sound.

### ADR-012 draft text — voice and ADR cross-references

Phase-4 corrections all incorporated:
1. ✅ `## Status` = `Accepted` (line 1033 of recipe).
2. ✅ No `## Cross-References` header — bullets folded into
   `## Invariant Tests` (lines 1059-1070 of recipe).
3. ✅ Cites ADR-002 in `## Decision`: "Per ADR-002, the consuming service
   (`KRIDeadlineService`) is the transaction-owning entrypoint" (line 1043).
4. ✅ Does NOT conflate ADR-009's `_reserved_modules.toml` with module-level
   deprecation. ADR-012 draft text contains no ADR-009 cross-reference. ✓
5. ✅ Replaces "reuses the same pattern as ADR-008" with the precise SSOT
   direction note: ADR-008 = cross-cutting SSOT (CRO-managed runtime
   config); ADR-012 = bounded-context-local SSOT (package-internal period
   algebra). Coexist deliberately. (Lines 1069-1070.)
6. ✅ Binds `## SSOT enforcement` to a lock test plus
   `_kri_state_vocabulary_allowlist.toml` registry.
7. ✅ Voice matches ADR-001..010: `## Status`, `## Context`, `## Decision`,
   `## Alternatives Rejected`, `## Migration Impact`, `## Rollback Strategy`,
   `## Invariant Tests`. No new top-level headers.

Cross-references inside `## Invariant Tests` cite:
- ADR-001 (capabilities module unification) — sound parallel.
- ADR-002 (service-owned transactions) — sound; aligned.
- ADR-006 (snapshot equivalence) — recipe correctly notes ADR-012's
  parametric output-equality test is OUT OF SCOPE for ADR-006 redaction
  rules (different shape).
- ADR-007 (bounded-context taxonomy) — sound; aligned.
- ADR-008 (cross-cutting SSOT vs bounded-context SSOT) — coexistence
  rationale is correct.
- ADR-009 NOT cited (per Phase 4 correction #4). ✓

Verdict: **VERIFIED**. ADR-012 draft text is coherent, cites ADR-002,
narrows away from ADR-009. The only **gap** is the missing
`_monitoring_status/kris.py` allowlist entry — recipe should add it
before #73 lands.

---

## Item #45a — Ownership characterization tests — VERIFIED

### `core/_permissions/ownership.py` shape

- 8 async functions across 141 lines (recipe says 142; trailing-newline
  drift again):
  1. `is_kri_reporting_owner` (lines 1-13) — NO `is_archived` predicate ✓
  2. `is_risk_kri_reporting_owner` (lines 16-37) — line 33:
     `KeyRiskIndicator.is_archived.is_(False)` ✓
  3. `get_kri_ids_where_reporting_owner` (lines 40-51) — NO predicate ✓
  4. `get_risk_ids_where_kri_reporting_owner` (lines 54-72) — line 68:
     `KeyRiskIndicator.is_archived.is_(False)` ✓
  5. `is_control_owner` (lines 75-87)
  6. `is_risk_control_owner` (lines 90-108) — joins
     `Control.id == ControlRiskLink.control_id` and matches owner; both
     conditions required (the recipe's "AND-of-two-conditions").
  7. `get_control_ids_where_owner` (lines 111-122)
  8. `get_risk_ids_where_control_owner` (lines 125-141)

Asymmetry pinned by recipe characterization tests:
- `is_kri_reporting_owner` accepts archived KRIs (no predicate).
- `is_risk_kri_reporting_owner` excludes archived KRIs (filters).
- `get_kri_ids_where_reporting_owner` includes archived KRI IDs.
- `get_risk_ids_where_kri_reporting_owner` excludes risks whose only
  reporting-owned KRIs are archived.

### Three test files

The three files are SEPARATE and well-scoped:
1. `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
   pins the per-row vs scope asymmetry (4 cases × test_*).
2. `tests/backend/pytest/test_ownership_resolver_control_join.py` pins the
   AND-of-two-conditions inner join at `ownership.py:104-106`.
3. `tests/backend/pytest/test_visible_ids_via_ownership.py` pins the
   `visible_*_ids` union(department, ownership) over 9 roles × 4 entity
   types via `fixture_universe` (the long pole — needs careful fixture
   construction).

### Production code untouched (test-only PR)

✓ Recipe explicitly says NONE in `### Code/file changes`. Tests-only
gate for #45b (cross-cut domain). Sound.

### Verdict

**VERIFIED**. Recipe correctly characterizes the asymmetry, the
control-join semantics, and the visible-ids contract. The fixture
universe is the long pole — needs a separate `tests/factories/` cohesion
review when implementing.

---

## Cross-cutting findings

### Atomic-cluster integrity (#24 + #51)

The atomic constraint is sound: deleting `kris/linked_vendors.py:3` and
`_kri_history/value_application.py` separately would leave dangling imports
in either `_register_listings/kris.py:31` or
`_entity_mutation_lifecycle/direct_apply.py:21`. The 6 doc citations
(`md:116-118`, `json:368/388/410`) all reference both files; splitting the
edits would create a transient state where docs reference a deleted file. ✓

### Audit-cardinality direction (#62)

Per-row events match the canonical pattern:
- `_vendor_links/workflow.py:285` — per-row `vendor_link_created`.
- `_vendor_links/workflow.py:321` — per-row `vendor_link_deleted` (recipe
  cites `:322` in some places, `:321` in others; the actual `await
  vendor_link_deleted(...)` call begins at line 321).

Rolling up to a single bulk event would:
- Lose per-row idempotency required by the outbox replay pattern.
- Silently re-shape the audit feed for non-bulk paths.
- Diverge from the canonical pattern `link_vendor_target` /
  `unlink_vendor_target` already use.

PER-ROW is the only choice consistent with ADR-002 (transaction-owning
service entrypoint) and the existing canonical surface.

### SSOT direction (#73)

`_kri_history/constants.py:2` is canonical:
- It is the older, package-internal anchor (consumed by
  `_kri_history/periods.py:9`).
- It declares `REPORTING_GRACE_DAYS = 15` directly.
- It sits inside the bounded context that owns period algebra.

`_config/lookup.py:26` is the duplicate:
- Sits in cross-cutting `_config` infrastructure.
- ADR-008 establishes `_config` as the SSOT for **CRO-managed runtime
  config** (risk thresholds, near-breach ratio).
- The grace-days constant is **package-internal** period algebra, NOT
  CRO-managed. Promoting the `_config` copy would invert the
  bounded-context-ownership direction.

Recipe correct. The collapse direction (delete `_config/lookup.py:26`,
redirect 2 consumers to `_kri_history/constants`) is sound.

### ADR-012 coherence

ADR-012 draft text is coherent and Phase 4-corrected:
- Cites ADR-002 ✓
- Does NOT cite ADR-009 (correctly avoids conflating
  `_reserved_modules.toml` with module-level deprecation) ✓
- Narrows ADR-006 reference (parametric output-equality test is OUT OF
  SCOPE for ADR-006 snapshot redaction) ✓
- Articulates the SSOT direction (cross-cutting vs bounded-context) ✓
- No novel `## Cross-References` header ✓

### Issues found

| Item | Issue | Severity |
|------|-------|----------|
| #50, #51, #45a | Line-count off by 1 (recipe-cited 22/8/142 vs `wc -l` 21/7/141) — cosmetic, depends on trailing newline | TRIVIAL |
| #62 | Recipe alternates between `:321` and `:322` for `vendor_link_deleted` line — actual is line 321 (the `await vendor_link_deleted(...)` call begins at 321) | TRIVIAL |
| #73 | `_kri_state_vocabulary_allowlist.toml` `period_algebra_consumers.files` MISSES `backend/app/services/_monitoring_status/kris.py`, which already imports `due_date` and `latest_closed_period_for_date` directly from `_kri_history.periods`. Lock would fire as a false positive on first run. | SHOULD-FIX |

### Recommendations

1. **Ship recipe as-is for items #3, #24, #25, #26, #50, #51, #52, #62, #45a**.
   All recipes are empirically verified; failing tests would go RED today.

2. **Adjust #73 allowlist before landing**:

   ```toml
   [period_algebra_consumers]
   files = [
       "backend/app/services/kri_deadline_service.py",
       "backend/app/services/kri_history_service.py",
       "backend/app/services/_monitoring_status/kris.py",
   ]
   ```

   Without this, `test_period_algebra_consumers_are_in_allowlist` produces
   a false positive on the first run.

3. **Normalize #62 line-citations** to `:321` (the actual `vendor_link_deleted`
   `await` line) — currently mixed `:321` / `:322` across recipe sections.

4. **No structural objection** to the PER-ROW decision (#62) or the SSOT
   direction (#73). Both are correct.

5. **No structural objection** to ADR-012's voice or its choice of cited
   ADRs (002, 006, 007, 008 in scope; 009 correctly absent).

6. **Cluster-A (#24+#51)** atomic-commit constraint is non-negotiable: the
   6 doc citations and the 2 surviving Python importers must land together,
   or CI breaks transitively. Recipe correctly flags this.

### Per-item verdict summary

| Item | Verdict | Notes |
|------|---------|-------|
| #3   | VERIFIED | 14 lines + 1 test importer at line 8 |
| #24  | VERIFIED | 5 lines + 4 prod importers + 6 doc cites at the asserted lines |
| #25  | VERIFIED | duplicate present in due_soon/overdue/breaches; helper extraction sound |
| #26  | VERIFIED | 2-line shim + 1 prod + 4 test sites + ESLint at `:146` |
| #50  | VERIFIED | 21 lines (recipe says 22 — off-by-one trailing-newline); lock at `:998` correct |
| #51  | VERIFIED | atomic with #24; whole-file alias; 3 prod importers correct |
| #52  | VERIFIED | 14 lines; 0 prod consumers; lock-test seam at `:962` |
| #62  | VERIFIED | PER-ROW events confirmed — direct-mutation lines + canonical surface verified |
| #73  | VERIFIED with caveat | SSOT direction correct; ADR-012 draft text Phase-4-corrected; **add `_monitoring_status/kris.py` to period_algebra_consumers allowlist** |
| #45a | VERIFIED | 8-function shape + 33/68 asymmetry; test-only PR; sound gate for #45b |
