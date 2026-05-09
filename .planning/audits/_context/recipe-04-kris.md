# Phase 5 recipes — Domain 4: KRI + ADR-012 + ownership tests

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`

Each recipe is **executable** for a single sequential developer following TDD.
All test additions use `pytestmark = pytest.mark.contract` and (for backend
API tests) `client_factory` from `tests/backend/pytest/conftest.py:875-935`.
Doc/lock-only Reject arguments are INVALID; Defers are addressed in-plan.

Phase 4 corrections incorporated:
- #62: PER-ROW EVENTS for bulk reconciliation (matches canonical at
  `_vendor_links/workflow.py:285,322`).
- #73 ADR-012 voice corrections (see Item #73 below).
- #45a is the prerequisite gate (test-only) for #45b — covered here.

Source-of-truth re-verification (current tree):
- `frontend/src/components/kri-form/kriFormWorkflow.ts:6` — 14 lines, sole
  consumer is the test importer. (Confirmed.)
- `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` — 5-line barrel
  whose only line of code is `from app.services._kri_history.value_application
  import visible_linked_vendors`. (Confirmed.)
- `backend/app/services/_kri_history/submission.py:9` — 22-line wrapper
  around `create_kri_submission_approval`. (Confirmed.)
- `backend/app/services/_kri_history/value_application.py:1` — 8-line
  whole-file alias re-exporting from `direct_application`. (Confirmed.)
- `backend/app/services/_kri_history/correction_plans.py:13` — 14 lines,
  consumed only by the contract test. (Confirmed.)
- `frontend/src/components/KRIForm.tsx:1` — 2-line shim, consumed by 1 prod
  importer + 4 test sites + ESLint pin at `frontend/eslint.config.js:146`.
  (Confirmed.)
- `backend/app/services/kri_vendor_assignment.py:81-119` — `assign_vendors_to_kri`
  mutates `VendorRiskLink`/`VendorKRILink` directly with **0 audit emissions**.
  (Confirmed: no `vendor_link_created`/`vendor_link_deleted` calls in file.)
- `backend/app/services/_vendor_links/workflow.py:285,322` — canonical
  `vendor_link_created` / `vendor_link_deleted` emission inside
  `link_vendor_target` / `unlink_vendor_target`. (Confirmed.)
- `backend/app/services/_kri_history/constants.py:2` — `REPORTING_GRACE_DAYS = 15`
  is the SSOT (consumed by `periods.py:9`). (Confirmed.)
- `backend/app/services/_config/lookup.py:26` — `REPORTING_GRACE_DAYS = 15`
  inside `ConfigDefaults` is the duplicate to collapse. (Confirmed.)
- `backend/app/services/kri_deadline_service.py:52,64,77,78` —
  `ConfigDefaults.REPORTING_GRACE_DAYS` and three `KRIHistoryService.*`
  static-method reaches. (Confirmed.)
- `backend/app/core/_permissions/ownership.py:33,68` — `is_archived.is_(False)`
  asymmetry inside `is_risk_kri_reporting_owner` and
  `get_risk_ids_where_kri_reporting_owner` (the predicate is **absent** from
  `is_kri_reporting_owner:1-13` and `get_kri_ids_where_reporting_owner:40-51`).
  (Confirmed.)

---

## Item #3 — S3.11 — Delete `kriFormWorkflow.ts` shim

### Disposition
DELETE `frontend/src/components/kri-form/kriFormWorkflow.ts` (14 lines). Sole
consumer is the test importer at
`tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8,28-29`.

### Dependencies
- In-domain: none.
- Cross-domain: none. The lock-symbol list in
  `tests/backend/pytest/test_architecture_deepening_contracts.py:1330-1340`
  does NOT pin `buildVendorContextWarning`.

### TDD shape
Structural-absence-first.

### Failing test(s) to write FIRST
Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

def test_kri_form_workflow_shim_is_removed() -> None:
    assert not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()
```

This goes red against the current tree (file present at line 1-14).

### Code/file changes
1. Delete `frontend/src/components/kri-form/kriFormWorkflow.ts`.
2. Delete the test importer line at
   `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8`
   and the two assertions at `:28-29`. If the file becomes empty, delete it
   entirely; otherwise prune those lines only.

### Lock/TOML/contract updates
None.

### Doc updates
None.

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
cd frontend && pnpm test -- EntityFormWorkflow
rg "buildVendorContextWarning|kriFormWorkflow" frontend/ tests/frontend/
```
Last command must return zero hits.

### Commit boundary
Single standalone commit.

### Rollback
`git revert` restores 14-line file plus the test importer.

### Effort
S.

---

## Item #24 + #51 — Atomic cluster A — Delete `kris/linked_vendors.py` barrel and `_kri_history/value_application.py` alias

### Why atomic
Both touch the same import line `kris/linked_vendors.py:3`
(`from app.services._kri_history.value_application import visible_linked_vendors`).
They share 6 doc citations (`docs/security/authorization-capability-contract.md:116,117,118`
and `docs/security/authorization-capability-contract.json:368,388,410`). The
3 remaining production importers of `value_application.py`
(`_register_listings/kris.py:31`, `_entity_mutation_lifecycle/direct_apply.py:21`,
`kris/linked_vendors.py:3`) must be repointed at `direct_application` in the
SAME COMMIT — otherwise either step alone leaves dangling imports.

### Disposition
- DELETE `backend/app/api/v1/endpoints/kris/linked_vendors.py` (5 lines).
- DELETE `backend/app/services/_kri_history/value_application.py` (8 lines).
- REPOINT 2 surviving importers (the 3rd, `kris/linked_vendors.py`, is itself
  deleted) at `_kri_history.direct_application`.
- STRIP 6 doc citations across `.md` and `.json`.

### Dependencies
- In-domain: cluster A — both items in the same commit.
- Cross-domain: docs domain owns the `.md`/`.json` cells but the diff is
  in this commit per Phase 5 plan (single landing cluster).

### TDD shape
Import-graph-failure-first plus structural-absence-first.

### Failing test(s) to write FIRST
Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kris_linked_vendors_barrel_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()


def test_kri_history_value_application_alias_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/value_application.py").exists()


def test_no_module_imports_value_application() -> None:
    backend_root = REPO_ROOT / "backend"
    offenders: list[str] = []
    for path in backend_root.rglob("*.py"):
        if "_kri_history.value_application" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

These all go red on the current tree.

### Code/file changes
1. Delete `backend/app/api/v1/endpoints/kris/linked_vendors.py`.
2. Delete `backend/app/services/_kri_history/value_application.py`.
3. Repoint `backend/app/services/_register_listings/kris.py:31` from
   `from app.services._kri_history.value_application import visible_linked_vendors`
   to
   `from app.services._kri_history.direct_application import visible_linked_vendors`.
4. Repoint `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21`
   identically.

### Lock/TOML/contract updates
- `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980`
  — the line `value_application_path = "backend/app/services/_kri_history/value_application.py"`
  and the two `_source(value_application_path)` assertions at `:979,980` MUST be
  DELETED in the same commit; otherwise `_source(...)` raises `FileNotFoundError`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:999-1000` —
  drop the now-dead negative-assertion strings:
  `"from app.services._kri_history.value_application import _apply_kri_value_directly"`
  and
  `"from app.services._kri_history.value_application import ("`.

### Doc updates (must land in this commit)
- `docs/security/authorization-capability-contract.md:116` — strip
  `kris/linked_vendors.py` from the `backend_authority` cell.
- `docs/security/authorization-capability-contract.md:117` — strip both
  `kris/linked_vendors.py` from `backend_authority` AND
  `_kri_history/value_application.py` from `service_policy`.
- `docs/security/authorization-capability-contract.md:118` — strip both
  `kris/linked_vendors.py` AND `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.md:161` — strip
  `value_application.py` from the inventory cell.
- `docs/security/authorization-capability-contract.json:368` — strip
  `kris/linked_vendors.py` from `backend_authority`.
- `docs/security/authorization-capability-contract.json:388` — strip
  `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:389` — strip
  `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.json:410` — strip
  `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:411` — strip
  `_kri_history/value_application.py`.

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_history_intake_workflow.py \
       tests/backend/pytest/test_kris_value_submission_api.py \
       tests/backend/pytest/test_kris_history_listing_api.py
rg "kris/linked_vendors|_kri_history.value_application|_kri_history/value_application" \
    backend/ tests/backend/pytest/
```
Last command must show no production-code hits.

### Commit boundary
SINGLE COMMIT covering 2 file deletes + 2 import repoints + 4 lock-test edits + 9 doc-citation edits.

### Rollback
`git revert` restores barrel + alias + 6 doc citations + 4 lock lines as one unit.

### Effort
S + S = combined S/M (atomic cluster).

### Cross-domain handoff
Documentation-surface domain has visibility into the same 6 lines (`md:116-118`,
`json:368/388/410`). This recipe absorbs them. Coordinate with docs-domain Phase 5
recipe to ensure no parallel rewrite collides on the same MD/JSON cells.

---

## Item #25 — S3.7 — Extract KRI department-scope helper

### Disposition
EXTRACT the duplicated `dept_ids = get_user_department_ids(...) → filter`
pattern into a single helper in `backend/app/api/v1/endpoints/kris/access.py`.
Also collapse the duplicate `can_create_kri_for_any_parent_risk` body that
appears in both `backend/app/services/_register_listings/kris.py:58-69` and
`backend/app/api/v1/endpoints/kris/access.py:20-32`.

### Dependencies
- In-domain: lands cleanly after #24+#51 settle so the new helper sees a stable
  import tree. Not atomic with #24+#51.
- Cross-domain: none.

### TDD shape
Behavioural test + structural duplication assertion.

### Failing test(s) to write FIRST
1. Behavioural test at
   `tests/backend/pytest/test_kris_department_scope_helper_red.py` (new), using
   `client_factory`. Exercises `GET /kris/due-soon`, `GET /kris/overdue`,
   `GET /kris/breaches` for: (a) privileged user (no dept filter, dept_ids=None);
   (b) non-privileged user with mismatched `department_id`; (c) non-privileged
   user with matching `department_id`; (d) no `department_id` query param.
   Pin the empty-list response on department mismatch (currently produced by
   the inline triplicated blocks). The new helper must produce identical
   responses.

```python
import pytest
pytestmark = pytest.mark.contract

@pytest.mark.asyncio
async def test_kris_due_soon_department_scope_matches_inline_baseline(
    client_factory, db_session, dept_user, other_dept_kri,
) -> None:
    async with client_factory(current_user=dept_user) as ac:
        r = await ac.get("/api/v1/kris/due-soon", params={"department_id": other_dept_kri.department_id})
        assert r.status_code == 200
        assert r.json()["items"] == []
```

(Repeat for overdue/breaches and the matching-department case.)

2. Structural lock added to
`tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_endpoint_dept_scope_is_extracted() -> None:
    inline_offenders: list[str] = []
    for fname in ("due_soon.py", "overdue.py", "breaches.py"):
        path = REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud" / fname
        if "get_user_department_ids" in path.read_text(encoding="utf-8"):
            inline_offenders.append(fname)
    assert inline_offenders == []
```

Currently red — all three files contain `get_user_department_ids`.

### Code/file changes
1. Add `apply_kri_department_scope(query, *, current_user, department_id)`
   helper in `backend/app/api/v1/endpoints/kris/access.py`. It returns the
   query with department-scope filters applied, mirroring the existing
   inline triplicated logic.
2. Replace the duplicated blocks in
   `backend/app/api/v1/endpoints/kris/crud/due_soon.py`,
   `backend/app/api/v1/endpoints/kris/crud/overdue.py`, and
   `backend/app/api/v1/endpoints/kris/crud/breaches.py` with calls to the
   new helper.
3. Optionally collapse the duplicated `can_create_kri_for_any_parent_risk`
   bodies (`access.py:20-32` and `_register_listings/kris.py:58-69`) by
   making one call the other; out of scope of #25's narrow extraction unless
   trivial.

### Lock/TOML/contract updates
None. The helper preserves capability semantics — pure-Python filter
consolidation.

### Doc updates
None (no doc citation pins this duplicate pattern).

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
pytest tests/backend/pytest/test_kris_department_scope_helper_red.py \
       tests/backend/pytest/test_kris_rbac.py \
       tests/backend/pytest/test_kris_history_listing_api.py
rg "get_user_department_ids" backend/app/api/v1/endpoints/kris/
```
Last command should show only `access.py` (the helper) plus its imports in
the three crud files.

### Commit boundary
Standalone single commit.

### Rollback
Revert restores the inline triplicated blocks.

### Effort
S.

---

## Item #26 — S3.9 — Delete `KRIForm.tsx` shim and ESLint pin

### Disposition
- DELETE `frontend/src/components/KRIForm.tsx` (2-line shim).
- REWRITE 1 production importer (`frontend/src/pages/KRINewPage.tsx:5`).
- REWRITE 4 test sites.
- REMOVE the file-targeted ESLint rule block at
  `frontend/eslint.config.js:145-158`.

### Dependencies
- In-domain: none.
- Cross-domain: none. Verified `KRIEditPage.tsx` does not exist.
  `KRINewPage.tsx` is the sole production importer.

### TDD shape
Structural-absence-first.

### Failing test(s) to write FIRST
Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_form_facade_is_removed() -> None:
    assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()


def test_eslint_kri_form_pin_is_removed() -> None:
    eslint = (REPO_ROOT / "frontend/eslint.config.js").read_text(encoding="utf-8")
    assert "src/components/KRIForm.tsx" not in eslint


def test_no_module_imports_kri_form_facade() -> None:
    offenders: list[str] = []
    for root in (REPO_ROOT / "frontend/src", REPO_ROOT / "tests/frontend/unit/src"):
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
                continue
            text = path.read_text(encoding="utf-8")
            if "@/components/KRIForm'" in text or 'vi.mock("@/components/KRIForm"' in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

All three go red on the current tree.

### Code/file changes
1. Delete `frontend/src/components/KRIForm.tsx`.
2. Rewrite `frontend/src/pages/KRINewPage.tsx:5`:
   - From: `import { KRIForm } from '@/components/KRIForm';`
   - To: `import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`
   - If `KRIFormProps`/`KRIFormVendorContext` are referenced, add
     `import type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`.
3. Rewrite test imports to point at `@/components/kri-form/KRIFormContainer`:
   - `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5`
   - `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4`
   - `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66`
     (the `vi.mock` target string)
   - `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32`
     (the `vi.mock` target string)
4. Remove the `files: ["src/components/KRIForm.tsx"]` rule block at
   `frontend/eslint.config.js:145-158`.
5. Update `frontend/src/components/kri-form/README.md:5` — replace any mention
   of the public facade `KRIForm.tsx` with a reference to
   `KRIFormContainer`.

### Lock/TOML/contract updates
None. Capability contract `md:117` mentions "KRI form/list components" without
pinning the shim file; no edit required.

### Doc updates
- `frontend/src/components/kri-form/README.md:5` — remove "public facade
  `KRIForm.tsx`" prose.

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
cd frontend && pnpm lint
cd frontend && pnpm test -- KRIForm
rg "@/components/KRIForm'" frontend tests
```
Last command returns zero hits.

### Commit boundary
Standalone single commit.

### Rollback
Revert restores the 2-line shim, 1 page import, 4 test sites, ESLint rule
block, and README prose.

### Effort
S.

---

## Item #50 — S3.2 — Delete `_kri_history/submission.py` wrapper

### Disposition
DELETE `backend/app/services/_kri_history/submission.py` (22 lines, 0
production importers; the canonical `create_kri_submission_approval` in
`approval_intake.py` already serves all live consumers).

### Dependencies
- In-domain: none.
- Cross-domain: none.

### TDD shape
Structural-absence-first.

### Failing test(s) to write FIRST
Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_history_submission_wrapper_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/submission.py").exists()


def test_no_module_references_create_kri_submission_approval_underscore() -> None:
    history_root = REPO_ROOT / "backend/app/services/_kri_history"
    offenders: list[str] = []
    for path in history_root.rglob("*.py"):
        if "_create_kri_submission_approval" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

Both go red on the current tree.

Also reuse the existing `DEAD_KRI_HISTORY_FACADES` pattern at
`tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py:18-25`
by adding a parallel set:

```python
DEAD_KRI_HISTORY_SERVICE_FILES = {
    "backend/app/services/_kri_history/submission.py",
    "backend/app/services/_kri_history/value_application.py",
    "backend/app/services/_kri_history/correction_plans.py",
}


def test_dead_kri_history_service_files_are_removed() -> None:
    existing = sorted(p for p in DEAD_KRI_HISTORY_SERVICE_FILES if (REPO_ROOT / p).exists())
    assert existing == []
```

This single lock covers items #50, #51, and #52 with one regression net.

### Code/file changes
1. Delete `backend/app/services/_kri_history/submission.py`.

### Lock/TOML/contract updates
- `tests/backend/pytest/test_architecture_deepening_contracts.py:998` — drop
  the now-dead string `"from app.services._kri_history.submission import _create_kri_submission_approval"`
  from the negative-assertion tuple at `:997-1002`. Hygiene cleanup; the
  assertion would still pass post-delete but the string is misleading.

### Doc updates (must land in this commit)
- `backend/app/services/_kri_history/README.md` — remove the `submission.py`
  inventory row.
- `docs/security/authorization-capability-contract.md:117,118,161` — strip
  `submission.py` from the service-policy / inventory cells (3 strings).
- `docs/security/authorization-capability-contract.json:389,411` — strip
  `submission.py` from the JSON `service_policy` strings (2 places).

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_w1_privileged_escalation_red.py \
       tests/backend/pytest/test_kris_submission_rbac_api.py
rg "_kri_history/submission|_create_kri_submission_approval" backend/ tests/backend/
```
Last command returns no hits.

### Commit boundary
Standalone single commit.

### Rollback
Revert restores file + lock-tuple entry + 5 doc-citation strings.

### Effort
S.

---

## Item #51 — covered with Item #24 above (atomic cluster A)

See Item #24 + #51 above for the joint recipe.

Quick reference:
- Failing test: `test_kri_history_value_application_alias_is_removed` and
  `test_no_module_imports_value_application` in
  `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`.
- Repoint targets: `_register_listings/kris.py:31`,
  `_entity_mutation_lifecycle/direct_apply.py:21`.
- Lock-cleanup: `test_architecture_deepening_contracts.py:976-980,999-1000`.
- Doc cleanup: same 6 doc-citation lines as #24.
- Effort: S (in cluster).

---

## Item #52 — S3.5 — Delete `_kri_history/correction_plans.py`

### Disposition
DELETE `backend/app/services/_kri_history/correction_plans.py` (14 lines,
0 production consumers; only the contract test at
`test_architecture_deepening_contracts.py:962` keeps it alive).

### Dependencies
- In-domain: none.
- Cross-domain: none.

### TDD shape
Structural-absence-first.

### Failing test(s) to write FIRST
Add to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_history_correction_plans_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py").exists()


def test_no_module_references_kri_correction_draft() -> None:
    history_root = REPO_ROOT / "backend/app/services/_kri_history"
    offenders: list[str] = []
    for path in history_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for symbol in ("KriCorrectionDraft", "build_kri_correction_plan", "correction_plans"):
            if symbol in text and path.name != "correction_plans.py":
                offenders.append(f"{path.relative_to(REPO_ROOT)}::{symbol}")
    assert offenders == []
```

Both go red on the current tree (file present at `:1-14`).

### Code/file changes
1. Delete `backend/app/services/_kri_history/correction_plans.py`.

### Lock/TOML/contract updates (must land in this commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:956` —
  drop `correction_plans` from the import tuple
  `from app.services._kri_history import approval_intake, correction_plans, ...`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:962` —
  drop the line `assert hasattr(correction_plans, "build_kri_correction_plan")`.
  Both edits MUST land in same commit; otherwise the test raises
  `ImportError` and the lock turns red.

### Doc updates
- `backend/app/services/_kri_history/README.md` — remove the
  `correction_plans.py` inventory row if listed.

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
pytest tests/backend/pytest/test_kris_history_corrections_api.py \
       tests/backend/pytest/test_architecture_deepening_contracts.py::test_kri_history_uses_service_owned_intake_and_projection
rg "correction_plans|build_kri_correction_plan|KriCorrectionDraft" backend/ tests/backend/
```
Last command returns no hits.

### Commit boundary
Standalone single commit.

### Rollback
Revert restores file + 2 lock-test lines.

### Effort
S.

---

## Item #62 — S5.9 — Relocate `kri_vendor_assignment.py` and route through canonical with PER-ROW audit events

### Audit-cardinality decision: PER-ROW EVENTS

Phase 4 confirmed: bulk KRI/vendor reconciliation must emit one
`vendor_link_created` / `vendor_link_deleted` event PER ROW, matching the
existing canonical pattern at
`backend/app/services/_vendor_links/workflow.py:285,322` (inside
`link_vendor_target` / `unlink_vendor_target`).

#### Rationale (record in commit message and ADR-012 cross-reference)

1. **Audit completeness over noise.** Today
   `backend/app/services/kri_vendor_assignment.py:81-119` mutates `VendorRiskLink`
   and `VendorKRILink` directly with **0 audit events**. Canonical
   `_vendor_links/workflow.py:285` emits `vendor_link_created` per row;
   `_vendor_links/workflow.py:322` emits `vendor_link_deleted` per row.
   Switching to per-row matches the existing audit-log shape — downstream
   consumers (notification trigger filters, audit-search UI) already assume
   one event per `(vendor_id, target_id)` mutation.
2. **Idempotency / replay.** Per-row events let outbox replay re-create
   individual rows; rolled-up events would lose the granularity needed for
   partial retries.
3. **Customer-visible diff.** N events instead of 0 events for a bulk
   reconciliation is an additive change; a single rolled-up event for N rows
   would silently re-shape the activity feed (vendor pages would lose per-link
   rows that already exist for non-bulk paths).
4. **Lock alignment.** The architecture lock at
   `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
   pins vendor-governance services to emit through canonical link mutators.
   Per-row events satisfy that without inventing new primitives.

#### Phase 4 prereq: structural independence from #69

Phase 4 verified that #62 is **structurally independent of #69**. The real
prereq is the bulk-reconciliation semantics in `_vendor_links/workflow.py:265-333`
— `link_vendor_target` and `unlink_vendor_target` are table-agnostic over
`(vendor_id, entity_field, entity_id)` and accept `kind="kri"` / `kind="risk"`,
making the per-row rewrite trivial.

### Disposition
- RELOCATE `backend/app/services/kri_vendor_assignment.py` to
  `backend/app/services/_vendor_links/kri_assignment.py`.
- REWRITE `assign_vendors_to_kri` to call `link_vendor_target` /
  `unlink_vendor_target` per row.
- KEEP `normalize_vendor_ids`, `validate_assignable_vendors`,
  `ensure_vendors_exist`, `get_kri_vendor_ids` signatures unchanged
  (non-link-mutating callers depend on them).
- UPDATE 4 production importers to the new path.
- UPDATE the lock at
  `test_w4_bc_c_vendor_governance_boundaries_red.py:16` so it travels with
  the file.

### Dependencies
- In-domain: none.
- Cross-domain (vendor-governance): coordinate so the new path
  `_vendor_links/kri_assignment.py` is recognised in the vendor-governance
  domain's recipe for `VENDOR_SERVICE_FILES`.

### TDD shape
Behavioural-failure-first (audit emission counts) plus structural-failure-first
(relocation + no direct table mutation).

### Failing test(s) to write FIRST

1. **Audit-cardinality behavioural test** at
   `tests/backend/pytest/test_kri_vendor_assignment_audit_red.py` (new), using
   `client_factory`. Scenario: a KRI is assigned 3 vendors, then re-assigned
   to a different set of 2 vendors (1 overlap, 1 removal, 1 addition). Assert
   the activity log contains:
   - 3 `vendor_link_created` events with `link_kind="kri"` (initial assign).
   - 1 `vendor_link_deleted` event with `link_kind="kri"` (the removal).
   - 1 `vendor_link_created` event with `link_kind="kri"` (the addition).
   - All 5 carry the correct `target_id=kri.id`.
   - When `ensure_parent_risk_vendor_ids` includes a vendor not yet linked to
     the parent risk, assert one additional `vendor_link_created` with
     `link_kind="risk"` and `target_id=kri.risk_id`.

   ```python
   import pytest
   pytestmark = pytest.mark.contract

   @pytest.mark.asyncio
   async def test_kri_vendor_assignment_emits_per_row_audit_events(
       client_factory, db_session, kri_with_vendors, current_user,
   ) -> None:
       async with client_factory(current_user=current_user) as ac:
           # initial: 3 vendors
           await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v3]})
           # reassignment: drop v3, add v4
           await ac.post(f"/api/v1/kris/{kri.id}/vendors", json={"vendor_ids": [v1, v2, v4]})

       events = await load_kri_audit_events(db_session, kri.id)
       created = [e for e in events if e.action == "vendor_link_created" and e.link_kind == "kri"]
       deleted = [e for e in events if e.action == "vendor_link_deleted" and e.link_kind == "kri"]
       assert len(created) == 4  # 3 initial + 1 add
       assert len(deleted) == 1   # 1 removal
   ```

   Today: ALL counts are 0. The test goes red against current implementation.

2. **Structural relocation lock** in
   `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py`.
   Replace the `VENDOR_SERVICE_FILES` entry at `:16` from
   `"backend/app/services/kri_vendor_assignment.py"` to
   `"backend/app/services/_vendor_links/kri_assignment.py"`. Add an explicit
   absence assertion:

   ```python
   def test_kri_vendor_assignment_old_path_is_removed() -> None:
       assert not (REPO_ROOT / "backend/app/services/kri_vendor_assignment.py").exists()
   ```

3. **Structural lock that the new module does NOT directly mutate link tables**:

   ```python
   def test_kri_assignment_uses_canonical_link_mutators() -> None:
       path = REPO_ROOT / "backend/app/services/_vendor_links/kri_assignment.py"
       text = path.read_text(encoding="utf-8")
       for forbidden in ("db.add(VendorRiskLink(", "db.add(VendorKRILink(", "await db.delete(link)"):
           assert forbidden not in text, f"direct table mutation {forbidden} in {path}"
   ```

   Currently red because `kri_vendor_assignment.py:102,112,117` contain all three.

### Code/file changes
1. Move `backend/app/services/kri_vendor_assignment.py` →
   `backend/app/services/_vendor_links/kri_assignment.py`.
2. Rewrite `assign_vendors_to_kri` body. Replace the parent-risk
   reconciliation block at the old `:91-102` with per-row
   `await link_vendor_target(db, vendor_id=..., current_user=..., kind="risk", entity_id=kri.risk_id, log_activity_func=log_activity)`
   calls (only for vendors not already linked to the parent risk).
3. Replace the KRI link reconciliation block at the old `:104-117` with
   per-row `await unlink_vendor_target(...)` for removals and
   `await link_vendor_target(..., kind="kri", entity_id=kri.id, ...)` for
   additions.
4. Preserve return type `list[int]` (normalized linked-vendor IDs).
5. Update 4 production importers to the new path:
   - `backend/app/api/v1/endpoints/kris/crud/create.py:16-18` — change
     `from app.services.kri_vendor_assignment import (...)` to
     `from app.services._vendor_links.kri_assignment import (...)`.
   - `backend/app/services/_approval_execution/kri_generic_edit.py:16` —
     same import path change.
   - `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:23` —
     same.
   - `backend/app/services/_entity_mutation_lifecycle/policy.py:22` — same.

Important: `link_vendor_target`/`unlink_vendor_target` each take a
`current_user: User` parameter and call `await db.commit()` on success
(see `_vendor_links/workflow.py:293,329`). Per ADR-002, the rewritten
`assign_vendors_to_kri` must NOT add a redundant outer `db.commit()` — the
per-row mutators own their transaction boundaries. Callers of
`assign_vendors_to_kri` (4 importers above) currently rely on the old
flush-only semantics; they must be checked: if any caller wraps the call in
a transactional block it must be relaxed to allow per-row commits, OR
`assign_vendors_to_kri` must accept an option to defer commit. **Default
choice in this recipe: pass-through per-row commit (matches canonical
behaviour and ADR-002).**

### Lock/TOML/contract updates
- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  — change the `VENDOR_SERVICE_FILES` entry from
  `"backend/app/services/kri_vendor_assignment.py"` to
  `"backend/app/services/_vendor_links/kri_assignment.py"`.

### Doc updates
- `docs/security/authorization-capability-contract.md` — search for
  `kri_vendor_assignment.py`; if present (Loop A noted a perimeter-pass note
  near `:172`), update path to the new location.
- `docs/security/authorization-capability-contract.json` — same; update any
  matching string.
- `backend/app/services/_vendor_links/README.md` — add `kri_assignment.py`
  inventory row.
- `backend/app/services/README.md` — remove old `kri_vendor_assignment.py`
  row if listed.

### Verification commands
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

### Commit boundary
SINGLE COMMIT. Relocation + rewrite + 4 importer rewrites + lock-line update
+ doc updates + the new audit-cardinality test together. Splitting risks
half-routed audit emissions in production.

### Rollback
Revert restores the old file at the old path with 0 audit emissions; the new
behavioural test fires red as a safety net. Document the per-row decision in
the commit message body so a revert preserves intent for re-attempt.

### Effort
M (half-day to one day).

### Cross-domain handoff
- Vendor-governance domain owns the `VENDOR_SERVICE_FILES` lock; this recipe
  carries the path update inline so the move is self-contained. Coordinate
  to ensure the vendor-governance Phase 5 recipe does not concurrently
  rewrite the same lock line.
- ADR-012 (item #73) cross-references this per-row decision (Cross-references
  bullet — see Item #73 below).

---

## Item #73 — ADR-012 — KRI time-series period algebra

### Phase 4 voice corrections (mandatory)

Per Phase 4 Loop 2 review, ADR-012 must:
1. Have `## Status` = `Accepted` (matches all of ADR-001..010).
2. **Drop the top-level `## Cross-References` header** — it's novel; no
   existing ADR uses it. Fold its bullets into `## Invariant Tests` per the
   ADR-008:33 voice (which lists tests as bullets without a separate
   header).
3. **Cite ADR-002** (recorder is the transaction-owning service entrypoint)
   in `## Decision`. Loop 1 finding A12.3 confirmed the omission.
4. **Narrow the ADR-009 alias-deprecation reference** — ADR-009 covers
   reserved enum/role/permission DECLARATIONS, NOT module-surface
   deprecation. Replace any ADR-009 cross-reference that conflates
   `_reserved_modules.toml` with module-level deprecation; ADR-012 does not
   touch that registry.
5. **Replace "reuses the same pattern as ADR-008"** with the precise SSOT
   direction note: ADR-008 makes `_config` the cross-cutting SSOT layer;
   ADR-012 inverts to a bounded-context-local anchor (`_kri_history.constants`).
   Both anchors coexist deliberately because risk thresholds are
   CRO-managed runtime config, while the grace-days constant is
   package-internal period algebra.
6. **Bind `## SSOT enforcement` to a lock test** — the new
   `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
   plus `_kri_state_vocabulary_allowlist.toml` registry.
7. **Match the existing ADR voice** — short, declarative sections matching
   the structure of ADR-001..010: `## Status`, `## Context`, `## Decision`,
   `## Alternatives Rejected`, `## Migration Impact`, `## Rollback Strategy`,
   `## Invariant Tests`, plus an optional ADR-002-style detail section
   (`## Hard Expiration` / `## Outbox Dispatcher Consolidation` only when
   warranted). No new top-level headers.

Also: Phase 2-A used "Behavioural equivalence test"; Phase 4 Probe 4
flagged this misuses ADR-006's snapshot-equivalence vocabulary. Use
"parametric output-equality test" instead.

### Disposition
1. WRITE `docs/adr/ADR-012-kri-time-series-period-algebra.md` declaring
   `_kri_history/periods.py` and `_kri_history/constants.py` as the SSOT
   for KRI time-series period bounds and the reporting-grace constant.
2. ADD lock test
   `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
   plus TOML registry
   `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`.
3. COLLAPSE the three `KRIHistoryService.*` static-method reaches in
   `kri_deadline_service.py:64,77,78` into a single
   `KRIDeadlineService.classify(kri, *, today)` helper that consumes the
   period algebra directly.
4. REMOVE `ConfigDefaults.REPORTING_GRACE_DAYS` from `_config/lookup.py:26`;
   redirect `kri_deadline_service.py:52` and
   `backend/app/services/kri_deadline_support.py:36` to import directly from
   `_kri_history.constants.REPORTING_GRACE_DAYS`.
5. REGISTER ADR-012 in `docs/adr/README.md`.

### Dependencies
- In-domain: standalone. Touches `kri_deadline_service.py` and
  `_config/lookup.py`. Not atomic with other items.
- Cross-domain: none. Removing
  `ConfigDefaults.REPORTING_GRACE_DAYS` reaches outside the KRI domain into
  shared config infrastructure, but Phase 2-B verified that the only
  consumers are `kri_deadline_service.py:52` and
  `kri_deadline_support.py:36`.

### TDD shape
Structural lock (SSOT enforcement) plus parametric output-equality test
(behavioural equivalence of the `classify` helper against the pre-collapse
chain).

### Failing test(s) to write FIRST

1. **Lock test** at
   `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`:

```python
from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ALLOWLIST_PATH = (
    REPO_ROOT / "tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml"
)


def _allowlist() -> dict[str, list[str]]:
    return tomllib.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))


def test_adr_012_exists() -> None:
    assert (REPO_ROOT / "docs/adr/ADR-012-kri-time-series-period-algebra.md").exists()


def test_reporting_grace_days_has_single_definition() -> None:
    pattern = re.compile(r"^REPORTING_GRACE_DAYS\s*=\s*\d+", re.MULTILINE)
    sites: list[str] = []
    for path in (REPO_ROOT / "backend").rglob("*.py"):
        if pattern.search(path.read_text(encoding="utf-8")):
            sites.append(str(path.relative_to(REPO_ROOT)))
    assert sites == ["backend/app/services/_kri_history/constants.py"]


def test_period_algebra_consumers_are_in_allowlist() -> None:
    allow = set(_allowlist()["period_algebra_consumers"]["files"])
    period_symbols = (
        "period_bounds_for_date",
        "latest_closed_period_for_date",
        "is_period_end_boundary",
        "due_date",
        "is_within_reporting_window",
    )
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel in allow or rel.startswith("backend/app/services/_kri_history/"):
            continue
        text = path.read_text(encoding="utf-8")
        if any(symbol in text for symbol in period_symbols):
            offenders.append(rel)
    assert offenders == []


def test_kri_deadline_service_uses_single_classify_call() -> None:
    text = (REPO_ROOT / "backend/app/services/kri_deadline_service.py").read_text(encoding="utf-8")
    static_method_hits = len(re.findall(r"KRIHistoryService\.[A-Za-z_]+", text))
    assert static_method_hits <= 1, (
        f"expected ≤1 KRIHistoryService.* reach after collapse; found {static_method_hits}"
    )


def test_kri_deadline_service_does_not_use_config_defaults_for_grace() -> None:
    text = (REPO_ROOT / "backend/app/services/kri_deadline_service.py").read_text(encoding="utf-8")
    assert "ConfigDefaults.REPORTING_GRACE_DAYS" not in text
```

All five assertions are red on the current tree.

2. **Allowlist registry** at
`tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`
(new). Initial contents:

```toml
[period_algebra_consumers]
files = [
    "backend/app/services/kri_deadline_service.py",
    "backend/app/services/kri_history_service.py",
]

[reporting_grace_days_consumers]
files = [
    "backend/app/services/_kri_history/periods.py",
    "backend/app/services/kri_deadline_service.py",
    "backend/app/services/kri_deadline_support.py",
]

[kri_history_service_static_method_consumers]
files = [
    "backend/app/services/kri_deadline_service.py",  # via the new classify() entrypoint
]
```

3. **Parametric output-equality test** at
`tests/backend/pytest/test_kri_deadline_classify_red.py` (new):

```python
from __future__ import annotations

from datetime import date

import pytest

pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "frequency, last_period_end, today, expected_period_end",
    [
        ("monthly", date(2026, 4, 30), date(2026, 5, 9), date(2026, 5, 31)),
        ("monthly", None, date(2026, 5, 9), date(2026, 4, 30)),
        ("quarterly", date(2026, 3, 31), date(2026, 5, 9), date(2026, 6, 30)),
        ("annual", None, date(2026, 5, 9), date(2025, 12, 31)),
    ],
)
def test_kri_deadline_classify_period_end_matches_legacy_chain(
    frequency, last_period_end, today, expected_period_end,
) -> None:
    from app.services.kri_deadline_service import KRIDeadlineService
    from tests.factories.kri import build_kri_for_period_test

    kri = build_kri_for_period_test(frequency=frequency, last_period_end=last_period_end)
    classification = KRIDeadlineService.classify(kri, today=today)
    assert classification.period_end == expected_period_end
```

The test pins the contract of the new `classify` helper. Pre-collapse it
will need a thin shim factory (`build_kri_for_period_test`) but the
expected values come from running the existing `_resolve_period_end` chain
on the same fixture matrix.

### Code/file changes

#### 4a. Create `docs/adr/ADR-012-kri-time-series-period-algebra.md`

Full text:

```markdown
# ADR-012 KRI Time-Series Period Algebra

## Status

Accepted

## Context

KRI deadline notifications, history corrections, and dashboard summaries all reach the same period-algebra primitives: `period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, and `is_within_reporting_window`. These primitives currently live in `backend/app/services/_kri_history/periods.py` (canonical), but cross-package callers reach them through three `KRIHistoryService` static-method bridges in `backend/app/services/kri_deadline_service.py:64,77,78`. The reporting-grace constant `REPORTING_GRACE_DAYS = 15` is duplicated: the canonical declaration is `backend/app/services/_kri_history/constants.py:2`; a copy lives in `backend/app/services/_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`, reached from `kri_deadline_service.py:52` and `kri_deadline_support.py:36`. The duplicate is silent — the two values agree today — but it can drift and there is no enforcement that the bounded context owns its own constant.

## Decision

`backend/app/services/_kri_history/periods.py` is the SSOT for the period-algebra primitives `(period_bounds_for_date, latest_closed_period_for_date, is_period_end_boundary, due_date, is_within_reporting_window)`. `backend/app/services/_kri_history/constants.py` is the SSOT for `REPORTING_GRACE_DAYS`. Cross-package callers import these directly from the SSOT modules, or from the `KRIHistoryService` re-export when a single named entry point reduces coupling. Per ADR-002, the consuming service (`KRIDeadlineService`) is the transaction-owning entrypoint; classification logic does not commit, but the surrounding notification dispatch does. The `ConfigDefaults.REPORTING_GRACE_DAYS` duplicate is removed; consumers import from `_kri_history.constants` directly. The three `KRIHistoryService.*` static-method reaches in `kri_deadline_service.py` collapse into a single `KRIDeadlineService.classify(kri, *, today)` helper that returns a frozen classification dataclass.

## Alternatives Rejected

- **Promote `ConfigDefaults` to authoritative**: rejected because the grace-days constant is package-internal period algebra, not CRO-managed runtime config. Promoting it would invert the bounded-context-ownership direction.
- **Keep three independent static-method reaches**: rejected because every additional reach broadens the API surface that the lock test must enforce, and changes to period algebra ripple into three call sites instead of one.
- **Delete the `KRIHistoryService` re-export entirely**: rejected because the static-method bridges remain a compatibility seam for the public service-class import; only the cross-package call sites are consolidated.

## Migration Impact

The collapse touches `kri_deadline_service.py` (single file, isolated change) and removes one line from `_config/lookup.py`. Snapshot rebaselines are not required: classifications use the same period algebra before and after. A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006 only if the parametric output-equality test reveals a behavioural drift.

## Rollback Strategy

Rollback restores the `ConfigDefaults.REPORTING_GRACE_DAYS` line and the three static-method reaches. The parametric output-equality test prevents silent regression of the per-call semantics.

## Invariant Tests

- `REPORTING_GRACE_DAYS = 15` may appear in EXACTLY ONE source-of-truth location: `backend/app/services/_kri_history/constants.py`. The lock test `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py::test_reporting_grace_days_has_single_definition` enforces this.
- No module outside `_kri_history/` and the allowlist in `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` may import `period_bounds_for_date`, `latest_closed_period_for_date`, `due_date`, `is_period_end_boundary`, or `is_within_reporting_window`. Enforced by `test_period_algebra_consumers_are_in_allowlist`.
- `kri_deadline_service.py` may contain at most one `KRIHistoryService.*` reference (the collapsed `classify` entrypoint). Enforced by `test_kri_deadline_service_uses_single_classify_call`.
- `kri_deadline_service.py` may not reference `ConfigDefaults.REPORTING_GRACE_DAYS`. Enforced by `test_kri_deadline_service_does_not_use_config_defaults_for_grace`.
- A parametric output-equality test (`tests/backend/pytest/test_kri_deadline_classify_red.py`) pins the `(period_end, due, reporting_owner_id, is_breached)` contract of the new `KRIDeadlineService.classify` helper against representative `(frequency, last_period_end, today)` tuples.
- ADR-001 — capabilities module unification, single public Interface for capabilities; ADR-012 follows the same single-Interface discipline for period algebra.
- ADR-002 — service-owned transactions; `KRIDeadlineService` remains the transaction-owning entrypoint for deadline notifications, ensuring no orphaned audit rows.
- ADR-006 — snapshot equivalence-class testing covers listing/dashboard surfaces. ADR-012 introduces a parametric output-equality test for `classify`, which is a different shape from a snapshot fixture and is not subject to ADR-006 redaction rules.
- ADR-007 — bounded-context taxonomy; the `_kri_history` package owns its own grace-days constant, consistent with the bounded-context-local-SSOT direction.
- ADR-008 — uses `ConfigDefaults` as the cross-cutting SSOT for risk thresholds. ADR-012 applies SSOT discipline to a bounded-context-local anchor (`_kri_history.constants`); the two anchors coexist deliberately because risk thresholds are CRO-managed runtime config, while the grace-days constant is package-internal period algebra.
```

(The `## Invariant Tests` section folds in the cross-references — no separate
`## Cross-References` header per Phase 4 correction #2. Voice matches
ADR-008:33's bulleted list.)

#### 4b. Create `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`

Contents shown above in the failing-test section.

#### 4c. Create `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`

Contents shown above.

#### 4d. Create `tests/backend/pytest/test_kri_deadline_classify_red.py`

Contents shown above.

#### 4e. Edit `backend/app/services/kri_deadline_service.py`

- Line 13: keep `from app.models.global_config import ConfigDefaults` ONLY if
  any non-grace-days symbol is still consumed (`NEAR_BREACH_THRESHOLD`,
  `DUPLICATE_LOOKBACK_DAYS`, `ADVANCE_REMINDER_DAYS`, `OVERDUE_REMINDER_WEEKS`
  at lines `:50,51,53,54`). The audit re-verified these are still in use, so
  keep the import.
- Line 52: REMOVE the line `REPORTING_GRACE_DAYS = ConfigDefaults.REPORTING_GRACE_DAYS`.
- Add at top: `from app.services._kri_history.constants import REPORTING_GRACE_DAYS`.
- Remove `_due_date` (lines 62-64) and `_resolve_period_end` (lines 75-81).
  Replace with a single class-level method:

```python
@dataclass(frozen=True)
class KriDeadlineClassification:
    period_end: date
    due: date
    reporting_owner_id: int | None
    is_breached: bool


@staticmethod
def classify(kri: KeyRiskIndicator, *, today: date) -> KriDeadlineClassification:
    period_end, due = KRIHistoryService.classify_for_today(kri, today)  # NEW SINGLE ENTRYPOINT
    return KriDeadlineClassification(
        period_end=period_end,
        due=due,
        reporting_owner_id=KRIDeadlineService._reporting_owner_id(kri),
        is_breached=KRIDeadlineService._is_breached(kri),
    )
```

- Add a single new entrypoint `KRIHistoryService.classify_for_today` (in
  `backend/app/services/kri_history_service.py`) that wraps the existing
  `period_bounds_for_date` / `latest_closed_period_for_date` / `due_date`
  composition into one call. This is the SINGLE allowed
  `KRIHistoryService.*` reach.
- Update `_process_single_kri` (lines 233-269) to consume `KRIDeadlineService.classify(...)`
  instead of the old `_resolve_period_end` + `_due_date` chain.

#### 4f. Edit `backend/app/services/kri_deadline_support.py:36`

- Drop the `ConfigDefaults.REPORTING_GRACE_DAYS` fallback in
  `load_kri_deadline_config`.
- Replace with `from app.services._kri_history.constants import REPORTING_GRACE_DAYS`
  and use it as the default value.

#### 4g. Edit `backend/app/services/_config/lookup.py:26`

- REMOVE the line `REPORTING_GRACE_DAYS = 15` from `ConfigDefaults`.

#### 4h. Edit `docs/adr/README.md`

- Add row: `- [ADR-012 KRI Time-Series Period Algebra](./ADR-012-kri-time-series-period-algebra.md)`.

#### 4i. Edit `backend/app/services/_kri_history/README.md`

- Add a one-line "see ADR-012" link.

### Lock/TOML/contract updates
- New file: `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`.
- New lock test: `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
  (auto-discovered by `make test-architecture-locks`).
- The TOML registry list in `CLAUDE.md` mentions `_archive_allowlist.toml`,
  `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, and
  `_endpoint_commit_allowlist.toml`. Adding `_kri_state_vocabulary_allowlist.toml`
  is a NEW registry; mention it in `CLAUDE.md` under the Architecture-Locks
  section if the project enforces per-CLAUDE.md registry inventory (verify
  with `rg "_kri_state_vocabulary_allowlist" CLAUDE.md` post-add).

### Doc updates
- `docs/adr/README.md` — add ADR-012 row.
- `docs/security/authorization-capability-contract.md` — no edit required.
  The contract does not pin `REPORTING_GRACE_DAYS`; ADR-012 is the new
  authority.
- `backend/app/services/_kri_history/README.md` — add ADR-012 link.

### Verification commands
```
make -f scripts/Makefile test-architecture-locks
python scripts/security/validate_authz_capability_contract.py
pytest tests/backend/pytest/test_kri_deadline_classify_red.py \
       tests/backend/pytest/test_kri_deadline_service.py \
       tests/backend/pytest/test_kri_history.py \
       tests/backend/pytest/test_kris_history_listing_api.py \
       tests/backend/pytest/test_kris_value_submission_api.py
rg "ConfigDefaults.REPORTING_GRACE_DAYS|REPORTING_GRACE_DAYS = 15" backend/
rg "KRIHistoryService\\.(due_date|period_bounds_for_date|latest_closed_period_for_date)" backend/
```
- Penultimate `rg` returns hits ONLY in `_kri_history/constants.py`.
- Final `rg` returns hits ONLY inside `_kri_history/` (the bridges) plus the
  single new `classify_for_today` consolidation in
  `kri_deadline_service.py`.

### Commit boundary
SINGLE COMMIT. ADR + lock test + TOML + collapse code change +
ConfigDefaults removal must land together; otherwise the lock test goes red
on the next CI run.

### Rollback
Revert restores the `_config/lookup.py:26` duplicate, the three
static-method reaches, and removes the ADR/lock/TOML. The parametric
output-equality test prevents silent regression of the per-call semantics.

### Effort
M (ADR draft + lock test + TOML + code collapse + ConfigDefaults pruning).

### Cross-domain handoff
- Cross-cut domain: removing `ConfigDefaults.REPORTING_GRACE_DAYS` reaches
  shared config infrastructure. Phase 2-B confirmed only two consumers
  (`kri_deadline_service.py:52`, `kri_deadline_support.py:36`); no other
  cross-domain consumer surfaces. If a new consumer appears post-Phase-5,
  escalate to the cross-cut Phase 5 recipe.
- Documentation-surface domain: ADR-012 is a new entry in `docs/adr/README.md`;
  no md/json contract churn.

---

## Item #45a — BE-N8a — Ownership prerequisite characterization tests

### Disposition
ADD three characterization tests against
`backend/app/core/_permissions/ownership.py` (8 async functions across 142
lines). The tests pin the EXISTING ownership behaviour. They serve as the
prerequisite gate for #45b (ownership resolver factory). Production code
is UNTOUCHED in #45a.

### Phase 4 verification
Phase 4 verified the KRI archived-filter asymmetry at
`backend/app/core/_permissions/ownership.py:33,68`:
- Line 33 (inside `is_risk_kri_reporting_owner`): `KeyRiskIndicator.is_archived.is_(False)`.
- Line 68 (inside `get_risk_ids_where_kri_reporting_owner`): same predicate.
- Lines 1-13 (`is_kri_reporting_owner`) and 40-51
  (`get_kri_ids_where_reporting_owner`): predicate ABSENT.

### Dependencies
- In-domain: none. This is the prerequisite gate.
- Cross-domain: none.

### TDD shape
Characterization-tests-first; production code untouched in #45a.

1. Write three failing tests (red against an empty test file or pre-existing
   stub) that pin the existing ownership behaviour.
2. Run them; they turn green against current `ownership.py` because they
   characterize current behaviour.
3. Tests then serve as the lock for #45b's factory equivalence.

### Three test files (per task brief — three separate files for clarity)

**Decision**: write 3 SEPARATE test files. Rationale: each test
characterizes a distinct invariant (KRI archived asymmetry, Control
join semantics, visible-ids resolution). Separate files keep the failure
attribution surface tight and let #45b's factory-equivalence test reuse
each module's fixtures without coupling.

#### File 1: `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`

```python
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

This file pins the asymmetry: per-row checks accept archived; risk-scope
expansions exclude archived.

#### File 2: `tests/backend/pytest/test_ownership_resolver_control_join.py`

```python
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
    """Link present, owner differs → False (the join condition at ownership.py:104-105)."""
    risk_id = control_linked_to_risk_owned_by_other.risk_id
    assert await is_risk_control_owner(db_session, user.id, risk_id) is False


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_owner_match_but_link_absent(
    db_session, control_owned_by_user_unlinked, other_risk, user,
) -> None:
    """Owner matches, no link → False (the inner-join at ownership.py:104)."""
    assert await is_risk_control_owner(db_session, user.id, other_risk.id) is False
```

This file pins the AND-of-two-conditions join at `ownership.py:104-106`.

#### File 3: `tests/backend/pytest/test_visible_ids_via_ownership.py`

```python
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


# Snapshot every BUSINESS_LOGIC §1.1 role.
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
    """Pin `visible_*_ids` returns union(department-scope ids, ownership-scope ids).

    Reads from `backend/app/core/_permissions/visible_ids.py` and the
    `kri_visibility_clause`/`control_visibility_clause`/`risk_visibility_clause`
    composition.
    """
    user = await build_user_for_role(db_session, role=role)
    candidates = fixture_universe.kri_ids + fixture_universe.foreign_dept_kri_ids
    ids = await visible_kri_ids(db_session, user, candidates)
    expected = fixture_universe.expected_visible_kri_ids_for(role)
    assert ids == expected
    # Repeat for risks, controls, vendors.
    risk_ids = await visible_risk_ids(db_session, user, fixture_universe.risk_ids)
    assert risk_ids == fixture_universe.expected_visible_risk_ids_for(role)
    control_ids = await visible_control_ids(db_session, user, fixture_universe.control_ids)
    assert control_ids == fixture_universe.expected_visible_control_ids_for(role)
    vendor_ids = await visible_vendor_ids(db_session, user, fixture_universe.vendor_ids)
    assert vendor_ids == fixture_universe.expected_visible_vendor_ids_for(role)
```

This file pins the contract that #45b's factory must preserve over the full
matrix of 9 roles × 4 entity types.

### Code/file changes
NONE in production. All changes inside `tests/backend/pytest/`.

### Lock/TOML/contract updates
NONE.

### Doc updates
NONE.

### Verification commands
```
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py \
       tests/backend/pytest/test_ownership_resolver_control_join.py \
       tests/backend/pytest/test_visible_ids_via_ownership.py
make -f scripts/Makefile test-architecture-locks
```

After the three test files exist and pass, they form the gate for #45b.

### Commit boundary
ONE PR (tests-only). #45b cannot land until this PR's tests are green.

### Rollback
Test-only addition; no production behaviour affected. Revert removes
characterization coverage but does not introduce regressions.

### Effort
M (~half-day for fixture matrix; the visible-ids test is the long pole).

### Cross-domain handoff
- #45b (cross-cut domain): consumes these three test files as the
  factory-equivalence baseline. Coordinate so the cross-cut Phase 5 recipe
  for #45b cites the three file paths verbatim.

---

## Cross-domain handoff summary

### Atomic cluster A: #24 + #51

- Same commit, same file deletes (`kris/linked_vendors.py`,
  `_kri_history/value_application.py`).
- Shared seam: `kris/linked_vendors.py:3` import line.
- Shared 6 doc citations: `docs/security/authorization-capability-contract.md:116-118`
  and `docs/security/authorization-capability-contract.json:368/388/410`.
- Documentation-surface domain has visibility into the same 6 lines —
  coordinate to absorb them in this commit (no duplicate doc rewrite in
  docs-domain Phase 5 recipe).

### #62 audit-cardinality decision: PER-ROW EVENTS

- Matches canonical `_vendor_links/workflow.py:285,322`.
- Vendor-governance domain owns the
  `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  lock — this recipe carries the line update inline.
- ADR-012 cross-references this decision as orthogonal evidence that
  bounded-context-local SSOT discipline applies (KRI history owns its
  audit shape; vendor-link mutators own their canonical event surface).

### #73 ADR-012

- Adds a NEW TOML registry
  `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`.
  CLAUDE.md mentions `_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`;
  this recipe extends the inventory.
- Removes `ConfigDefaults.REPORTING_GRACE_DAYS` — Phase 2-B confirmed only
  two consumers (`kri_deadline_service.py:52`,
  `kri_deadline_support.py:36`) so the removal is self-contained.

### #45a

- Test-only PR; gates #45b (cross-cut domain) factory rewrite. The
  cross-cut Phase 5 recipe for #45b must cite these three test paths
  verbatim:
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `tests/backend/pytest/test_visible_ids_via_ownership.py`

### Recommended sequential execution order

Following Loop 1's order, refined by the atomic-cluster constraints:

1. **#3** — smallest delete; validates the structural-absence pattern.
2. **#52** — same pattern, single backend file + 2 lock lines.
3. **#50** — same pattern, single backend file + 1 lock-tuple entry + 5 doc citations.
4. **#24 + #51** — atomic cluster A; one commit.
5. **#26** — frontend pattern (file delete + 5 import sites + ESLint pin + README prose).
6. **#25** — endpoint refactor; lands cleanly after #24's import-tree settles.
7. **#62** — relocation + per-row audit rewrite + 4 importers + lock-line update.
8. **#73** — ADR + lock test + TOML + classify collapse + ConfigDefaults pruning.
9. **#45a** — characterization tests (test-only); gates #45b in cross-cut domain.

This order minimises lock-test churn: each step lands its own structural
assertion before the next step runs, and no two steps fight over the same
file or lock line. #45a is appended last so its tests run cleanly against
the post-cleanup tree (otherwise spurious red from intermediate states).

### Effort summary

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
| #45a | M      | (cross-cut gate) | 9 |

Total: 7×S + 3×M ≈ 2 days of focused work for a single sequential developer.
