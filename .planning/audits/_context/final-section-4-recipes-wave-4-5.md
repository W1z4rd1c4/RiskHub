# Final Section 4 — Per-Item Recipes (Items 27-55, Waves 4-5)

Phase: **7 (production-write)**. Build commit ref: `1ee872a4` on `main`.
Source: Phase 5 recipes (`recipe-01-issues.md`, `recipe-02-risks-and-endpoints.md`, `recipe-03-approvals.md`, `recipe-04-kris.md`, `recipe-05-vendor-migration.md`, `recipe-06-frontend-deadcode.md`, `recipe-07-frontend-authz.md`, `recipe-08-crosscut-adrs.md`, `plan-loop-3-06-adr-drafts.md`).
Phase 6 corrections applied: see verify-recipe-01..08 reports.
Master sequence: `plan-loop-3-07-integration-v2.md:343-422` (79 items).

This section documents items in v2 master-sequence slots 30-58 — Wave 4 (P2 dead-code B + Doc-Contract Cluster, 15 items in slots 30-44) and Wave 5 (P2 chains + ADR-007 amendment text, 15 items in slots 45-58 plus the #43 / #44 cross-domain pair previously considered Wave 5 partners).

All recipes assume single sequential developer; TDD red→green; new architecture
tests carry `pytestmark = pytest.mark.contract`; backend integration tests use
`client_factory` from `tests/backend/pytest/conftest.py`. Quote rule: ≤15 words.

---

## Wave 4 — P2 Dead-code B + Doc-Contract Cluster (Items 27-41 in this section, v2 Seq 28-45)

The v2 master sequence places 15 items into Wave 4 (per `final-section-2-sequence.md:190-208`). Section 3 already covered Seq 28 (#21) as the wave's first slot under Wave 3 P2 dead-code A overflow; this section continues from Seq 29 (#25) and follows the user-supplied Wave 4 ordering (#29, #33, #36, #35, #48, #64, #47, #22, #23, #55, #24+#51 atomic, #56+#61 atomic, #25, #26).

> **Author note**: the user specified the Wave-4 listing in
> traversal order rather than v2-Seq order. Each recipe below
> records both `Wave: 4` and the v2 `Slot: …` so readers can
> reconcile against `final-section-2-sequence.md` and
> `plan-loop-3-07-integration-v2.md:344-422`.

---

### Item #27 — #25 — Extract KRI department-scope helper

**Wave**: 4  | **Slot**: v2 Seq 29  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none (lands cleanly after #24+#51 settle)
**Atomic with**: none
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/kris/access.py:20-32` and `backend/app/services/_register_listings/kris.py:58-69` both carry the `dept_ids = get_user_department_ids(...) → filter` pattern, plus the `due_soon.py`, `overdue.py`, `breaches.py` triplicate inline at `backend/app/api/v1/endpoints/kris/crud/`. The recipe extracts a single `apply_kri_department_scope(query, *, current_user, department_id)` helper into `kris/access.py`. Audit ID = #25 (S3.7); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 29 (`plan-loop-3-07-integration-v2.md:372`).
- [ ] Confirm prerequisites complete: #24+#51 atomic cluster (Wave 4) settled — fresh import tree on `_kri_history.direct_application`.
- [ ] Read latest state of `backend/app/api/v1/endpoints/kris/access.py:20-32`, `backend/app/services/_register_listings/kris.py:58-69`, `backend/app/api/v1/endpoints/kris/crud/{due_soon,overdue,breaches}.py`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (behavioural, new): `tests/backend/pytest/test_kris_department_scope_helper_red.py`

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

(Repeat for `/overdue`, `/breaches` and the matching-department case; also for the privileged-user path with `dept_ids=None` and the no-`department_id` query path.)

**Test file 2** (structural lock): append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

```python
def test_kri_endpoint_dept_scope_is_extracted() -> None:
    inline_offenders: list[str] = []
    for fname in ("due_soon.py", "overdue.py", "breaches.py"):
        path = REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud" / fname
        if "get_user_department_ids" in path.read_text(encoding="utf-8"):
            inline_offenders.append(fname)
    assert inline_offenders == []
```

**Expected**: RED. All three files contain `get_user_department_ids` today.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/kris/access.py` — append `apply_kri_department_scope(query, *, current_user, department_id)` returning the query with department-scope filters applied (mirroring the existing inline triplicated logic).
- `backend/app/api/v1/endpoints/kris/crud/due_soon.py`, `.../overdue.py`, `.../breaches.py` — replace inline `get_user_department_ids` filter blocks with calls to the new helper.
- Optionally collapse the duplicate `can_create_kri_for_any_parent_risk` body (`access.py:20-32` and `_register_listings/kris.py:58-69`) by routing one through the other; out of scope for #25's narrow extraction unless trivial.

**Files to create**:
- `tests/backend/pytest/test_kris_department_scope_helper_red.py`.
- New structural lock appended to `test_w4_bc_g_kri_history_boundaries_red.py`.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock IS the contract.
- No capability-contract change (helper preserves capability semantics — pure-Python filter consolidation).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- None (no doc citation pins this duplicate pattern).

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_kris_history_listing_api.py -q` — must pass.
3. `rg "get_user_department_ids" backend/app/api/v1/endpoints/kris/` — only `access.py` (helper) plus its imports in the three crud files.
4. `ruff check backend/app/api/v1/endpoints/kris backend/app/services/_register_listings` — clean.
5. `mypy backend/app/api/v1/endpoints/kris backend/app/services/_register_listings` — clean.

#### Commit boundary

Single commit titled: `S3.7: extract apply_kri_department_scope; collapse triplicated due_soon/overdue/breaches filter`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores the inline triplicated blocks.
  2. Drop the new test files.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 3h (helper + 3 crud rewrites + 2 tests + verification).
- Risk: LOW — pure-Python filter consolidation; capability semantics preserved.
- Mitigations: behavioural parity test pins endpoint shape; structural lock catches re-introduction.

---

### Item #28 — #26 — Delete `KRIForm.tsx` shim and ESLint pin

**Wave**: 4  | **Slot**: v2 Seq 30  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend (kris)

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/components/KRIForm.tsx` is a 2-line shim re-exporting `KRIFormContainer` from `@/components/kri-form/KRIFormContainer`. Sole production importer is `KRINewPage.tsx:5`; 4 test sites also reference it. `frontend/eslint.config.js:145-158` carries a file-targeted rule block pinning the shim. Audit ID = #26 (S3.9); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 30 (`plan-loop-3-07-integration-v2.md:373`).
- [ ] Confirm prerequisites: none. Verify `KRIEditPage.tsx` does NOT exist; `KRINewPage.tsx` is the sole production importer.
- [ ] Read latest state of `frontend/src/components/KRIForm.tsx`, `frontend/src/pages/KRINewPage.tsx:5`, `frontend/eslint.config.js:145-158`, the 4 test sites.
- [ ] Run `rg "@/components/KRIForm'|vi.mock(\"@/components/KRIForm\"" frontend/ tests/frontend/` — produce expected match set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

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

**Expected**: RED. All three assertions fail today.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `frontend/src/components/KRIForm.tsx` (2-line shim).

**Files to edit**:
- `frontend/src/pages/KRINewPage.tsx:5` — change `import { KRIForm } from '@/components/KRIForm';` to `import { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`. If `KRIFormProps`/`KRIFormVendorContext` are referenced, add `import type { KRIFormProps, KRIFormVendorContext } from '@/components/kri-form/kriForm.types';`.
- `tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx:5` — repoint import to `@/components/kri-form/KRIFormContainer`.
- `tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx:4` — repoint.
- `tests/frontend/unit/src/pages/__tests__/DirectFormCapabilityGates.test.tsx:66` — update `vi.mock` target string.
- `tests/frontend/unit/src/pages/__tests__/KRIForms.vendor-context.test.tsx:32` — update `vi.mock` target string.
- `frontend/eslint.config.js:145-158` — remove the `files: ["src/components/KRIForm.tsx"]` rule block.
- `frontend/src/components/kri-form/README.md:5` — replace any mention of public facade `KRIForm.tsx` with reference to `KRIFormContainer`.

**Files to create**: the new structural lock additions above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k kri_form
cd frontend && pnpm test -- KRIForm
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock additions above.
- Capability contract `md:117` mentions "KRI form/list components" without pinning the shim file; no edit required.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `frontend/src/components/kri-form/README.md:5` — remove "public facade `KRIForm.tsx`" prose.

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `cd frontend && pnpm lint` — clean.
3. `cd frontend && pnpm test -- KRIForm` — must pass.
4. `rg "@/components/KRIForm'" frontend tests` — zero hits.
5. `cd frontend && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled: `S3.9: delete KRIForm.tsx shim; rewrite 5 importers; drop eslint.config pin`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores the 2-line shim, 1 page import, 4 test sites, ESLint rule block, README prose.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (file delete + 5 importer rewrites + ESLint rule drop + README + 3 lock tests).
- Risk: LOW — sole production importer is one page; 4 test sites verified.
- Mitigations: typecheck catches missed imports; ESLint pin removal verified by lock test.

---

### Item #29 — #29 — Source-type vocabulary canonicalization

**Wave**: 4  | **Slot**: v2 Seq 31  | **Effort**: S (3h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none (independent; cleanest after #28 but landing earlier is fine)
**Atomic with**: none
**Validator?**: no

#### Why this work

Three near-duplicate definitions exist:
- `_source_type_value` at `backend/app/services/_issue_register/source_mutation.py:24`.
- `source_type_value` at `backend/app/services/_issue_workflow/update_plans.py:19`.
- `source_type_value` at `backend/app/services/_issue_register/linked_context.py:103`.

The recipe extracts a single canonical helper `source_type_value` into `_issue_register/constants.py` with `None`-handling (returns `""`) and Enum coercion. Audit ID = #29 (S4.6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 31 (`plan-loop-3-07-integration-v2.md:374`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/_issue_register/constants.py`, `_issue_register/source_mutation.py:24`, `_issue_workflow/update_plans.py:19`, `_issue_register/linked_context.py:103`.
- [ ] Confirm three definitions exist at the cited lines.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (architecture lock, new): `tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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

**Test file 2** (unit test, new): `tests/backend/pytest/test_issue_source_type_value.py` (NOT under `architecture/`).

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

**Expected**: RED. Both fail (helper not defined yet, three definitions remain).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_register/constants.py` — append the canonical helper:
  ```python
  from enum import Enum
  from app.models.issue import IssueSourceType

  def source_type_value(source_type: IssueSourceType | Enum | str | None) -> str:
      if source_type is None:
          return ""
      if isinstance(source_type, Enum):
          return source_type.value
      return str(source_type)
  ```
- `backend/app/services/_issue_workflow/update_plans.py:19-20` — delete local `def source_type_value`; add `from app.services._issue_register.constants import source_type_value` at top.
- `backend/app/services/_issue_register/source_mutation.py:24-25` — delete local `def _source_type_value`; add `from .constants import source_type_value` at top. At `:162`, rename local `source_type_value = _source_type_value(source_type)` to `value = source_type_value(source_type)` (avoid shadowing). Update references at `:162,164,175,192` to `value`.
- `backend/app/services/_issue_register/linked_context.py:103-104` — delete local `def source_type_value`; add `from .constants import source_type_value` at top. Call at `:110` works unchanged.

**Files to create**: the two new test files above.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py tests/backend/pytest/test_issue_source_type_value.py -q
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- Architecture lock from Step 1.
- No capability-contract change.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_issue_register/README.md` — append Contents bullet: `- constants.py - UNKNOWN_*_LABEL strings and source_type_value coercer (canonical)`.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_issue_source_type_value.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_source_type_value_has_one_canonical_definition_red.py -q` — must pass.
3. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py -q` — domain suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.6: extract canonical source_type_value into _issue_register/constants`.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:341`).
- Procedure:
  1. `git revert <SHA>` to restore the three local definitions and remove the constants helper.
  2. Drop both new test files.
  3. Restore `_issue_register/README.md` Contents bullet edit.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 3h (helper + 3 import repoints + variable shadow rename + 2 tests).
- Risk: LOW — bodies are functionally equivalent (Loop B verified `IssueSourceType` is `str, Enum`).
- Mitigations: parametrized unit test covers Enum, str, foreign-Enum, None paths; structural lock catches duplicate re-introduction.

---

### Item #30 — #33 — Unify frontend approval-queued banners

**Wave**: 4  | **Slot**: v2 Seq 32  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: approvals (frontend)

**Dependencies**: none. Frontend-only.
**Atomic with**: none
**Validator?**: no

#### Why this work

Two distinct banner components exist: `frontend/src/components/forms/ApprovalQueuedBanner.tsx` (prop-driven, used by Risk and Control forms via i18n hoist at `RiskFormContainer.tsx:111-119` and `ControlFormContainer.tsx:180-188`) and `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` (KRI-specific variant with one extra wrapper `<div>` and class-order drift). Loop B confirmed the KRI variant has no semantic difference; recipe unifies under the canonical `ApprovalQueuedBanner` and hoists the KRI i18n into `KRIFormContainer`. Audit ID = #33 (S6.4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 32 (`plan-loop-3-07-integration-v2.md:375`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/components/kri-form/KRIFormContainer.tsx:7,158-163`, `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`, `frontend/src/components/forms/ApprovalQueuedBanner.tsx`, `frontend/src/components/risk-form/RiskFormContainer.tsx:111-119` (for the canonical i18n hoist pattern).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (component, augment): `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx`. Render `<KRIFormContainer>` with `state.approvalQueued` set; assert exactly one `ApprovalQueuedBanner` (matched by `data-testid="approval-queued-banner"`) renders with resolved `title`, translated `message` (with `errorKeys.*` prefix routing), and `viewApprovalsLabel`. **Expected**: RED at HEAD because the container imports the dedicated `KriApprovalQueuedBanner`.

**Test file 2** (absence, new): `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts`:

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

Plus a grep-style assertion (e.g. via `import.meta.glob`) that no `frontend/src/**/*.{ts,tsx}` file imports `KriApprovalQueuedBanner`.

**Expected**: RED. File still exists.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/components/kri-form/KRIFormContainer.tsx:7` — replace `import { KriApprovalQueuedBanner } from './KriApprovalQueuedBanner';` with `import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';`.
- Same file, lines 158-163 — replace the `<KriApprovalQueuedBanner ... />` block with the prop-driven version. Compute `closeLabel`, `title`, `viewApprovalsLabel`, `message` (with `errorKeys.`-prefix routing) inside the container, mirroring `RiskFormContainer.tsx:111-119`.

**Files to delete**:
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`.

**Files to create**: the two new tests above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form tests/frontend/unit/src/components/forms
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None (backend-side untouched).
- Frontend invariant test home `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` is unaffected.

#### README / doc updates (same commit)

- `frontend/src/components/forms/README.md` — if it enumerates banner siblings, note KRI form uses the canonical component.
- `frontend/src/components/kri-form/README.md` — remove any reference to `KriApprovalQueuedBanner`.

#### Verification commands (run all in order)

1. `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form tests/frontend/unit/src/components/forms` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend/kri): unify approval queued banner via KRIFormContainer i18n hoist`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores local KRI banner + container import.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 3h (container rewrite + i18n hoist + 2 tests + verification).
- Risk: LOW — Behavior is i18n-equivalent; one extra wrapper `<div>` and class-order drift disappear on consolidation.
- Mitigations: component test pins data-testid contract; absence test pins file removal.

---

### Item #31 — #36 — Refactor `BusinessRouteGuards.tsx` to typed factory

**Wave**: 4  | **Slot**: v2 Seq 34  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none. Can run in parallel with #35.
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/authz/BusinessRouteGuards.tsx:18-36` carries 4 identical guards (`GovernanceRouteGuard`, `ActivityLogRouteGuard`, `UsersRouteGuard`, `UserLifecycleRouteGuard`) each wrapping the same `useAuthz` boolean-key check pattern. The recipe replaces the four hand-rolled functions with a typed factory `createBusinessRouteGuard<K extends BoolKeys>(key: K)`. Loop B confirmed all 4 capability keys are boolean fields on `Authz` (`policy.ts:13-39`). Audit ID = #36 (S7.4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 34 (`plan-loop-3-07-integration-v2.md:377`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/authz/BusinessRouteGuards.tsx:18-36`, `frontend/src/authz/policy.ts:13-39`, existing `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (factory contract, new): `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx`. For each `(name, key)` in `[(GovernanceRouteGuard, canViewGovernance), (ActivityLogRouteGuard, canViewActivityLog), (UsersRouteGuard, canViewUsersRoute), (UserLifecycleRouteGuard, isPlatformAdmin)]`: render with stubbed `useAuthz()` returning `{ [key]: true }` / `{ [key]: false }` and assert children rendered / `<Navigate to="/" replace />` rendered.

```ts
import { createBusinessRouteGuard } from '@/authz/BusinessRouteGuards';
// (the import resolves only after refactor lands)
```

**Test file 2** (structural, new): `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts`. Read `frontend/src/authz/BusinessRouteGuards.tsx` source via `fs.readFileSync`. Assert:
- Exactly 1 `function createBusinessRouteGuard<` declaration.
- `(source.match(/function\s+\w+RouteGuard\s*\(/g) ?? []).length === 0` (no hand-rolled function declarations besides the factory).
- 4 `export const` named guards bound to `createBusinessRouteGuard(...)` calls.

**Test file 3**: existing `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` continues to pass — pin route semantics during the refactor.

**Expected**: RED on Tests 1 + 2.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/authz/BusinessRouteGuards.tsx`:
  ```ts
  import type { ReactNode } from 'react';
  import { Navigate } from 'react-router-dom';
  import { useAuthz } from '@/authz/useAuthz';
  import type { Authz } from '@/authz/policy';

  type GuardProps = { children: ReactNode };
  type BoolKeys = { [K in keyof Authz]: Authz[K] extends boolean ? K : never }[keyof Authz];

  export function createBusinessRouteGuard<K extends BoolKeys>(key: K) {
      return function BusinessRouteGuard({ children }: GuardProps) {
          const authz = useAuthz();
          if (!authz[key]) return <Navigate to="/" replace />;
          return <>{children}</>;
      };
  }

  export const GovernanceRouteGuard = createBusinessRouteGuard('canViewGovernance');
  export const ActivityLogRouteGuard = createBusinessRouteGuard('canViewActivityLog');
  export const UsersRouteGuard = createBusinessRouteGuard('canViewUsersRoute');
  export const UserLifecycleRouteGuard = createBusinessRouteGuard('isPlatformAdmin');
  ```

No changes to consumers (routing files import the same names).

**Files to create**: the two new test files above.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None. `useAuthz.invariant.test.ts:46-48` enumerates `authz.can(action, resource)` capability tuples — unrelated to top-level boolean keys.

#### README / doc updates (same commit)

- `frontend/src/authz/README.md` — describe the factory contract and the `BoolKeys` type.

#### Verification commands (run all in order)

1. `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` — must pass.
2. `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.structural.test.ts` — must pass.
3. `cd frontend && pnpm vitest run tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` — must pass.
4. `cd frontend && pnpm tsc --noEmit` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend/authz): replace 4 BusinessRouteGuards with typed factory`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 4 explicit guards.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 2h (factory + 2 new tests + README + verification).
- Risk: LOW — `BoolKeys` type is the only new concept; no other callers depend on it.
- Mitigations: existing route-semantics test pinned during refactor; structural test pins single-factory invariant.

---

### Item #32 — #35 — Delete `usePermissions` hook

**Wave**: 4  | **Slot**: v2 Seq 33  | **Effort**: S (~3h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none structural. Should land BEFORE #66 (AuthContext split, Wave 6b) to avoid double-rewriting the 18 mock files.
**Atomic with**: none — soft pair-with #66 (per `final-section-2-sequence.md:380` mock-file double-rewrite avoidance)
**Validator?**: no

#### Why this work

`frontend/src/hooks/usePermissions.ts` is a pure passthrough to `useAuth().hasPermission` plus 8 `useAuthz()` accessors. Loop B confirmed only `hasPermission` is consumed in production (`Sidebar.tsx:25`); all 18 test sites are `vi.mock('@/hooks/usePermissions', ...)` calls. Audit ID = #35 (S7.3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 33 (`plan-loop-3-07-integration-v2.md:376`).
- [ ] Confirm prerequisites: none. Verify #66 has NOT yet landed (else #35 lands second cycle, the mock files are rewritten twice).
- [ ] Read latest state of `frontend/src/hooks/usePermissions.ts:4-20`, `frontend/src/components/layout/Sidebar.tsx:12,25`, the 18 test mock sites listed below.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (structural, new): `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts`. Three assertions:
- `expect(fs.existsSync(usePermissionsPath)).toBe(false);`
- Walk `frontend/src/**/*.{ts,tsx}` via `fast-glob` (already in dev deps); assert no file source contains `from '@/hooks/usePermissions'`.
- Walk `tests/frontend/**/*.{ts,tsx}` similarly; assert zero matches.

**Test file 2** (Sidebar regression, new): `tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx`. Render `<Sidebar />` inside `MemoryRouter` + `QueryClientProvider`; mock `@/contexts/AuthContext` with `vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: stubUser, hasPermission: vi.fn().mockReturnValue(true), logout: vi.fn(), logoutPending: false, logoutErrorKey: null }) }));` and `vi.mock('@/authz/useAuthz', () => ({ useAuthz: () => stubAuthz }));`. Assert sidebar links toggle on permission.

**Expected**: RED on both. File exists; 1 prod import (Sidebar) + 18 test imports.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `frontend/src/hooks/usePermissions.ts`.

**Files to edit**:
- `frontend/src/components/layout/Sidebar.tsx` — remove line 12 (`import { usePermissions } from '@/hooks/usePermissions';`); replace line 25 with destructure from existing `useAuth()` line 24: `const { user, logout, logoutPending, logoutErrorKey, hasPermission } = useAuth();`.
- The 18 test mock files (per Loop B verified):
  - `tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx`
  - `tests/frontend/unit/src/components/kri/KRIValueModal.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.url-params.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/RiskDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.grouped-views.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/UserNewPage.sso.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/VendorsPage.grouped-views.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueDetailPage.tabs.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/DashboardPage.overview.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.table-navigation.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.cancel.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.naming.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssueNewPage.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/IssuesPage.layout-parity.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/ControlDetailPage.issue-entry.test.tsx`
  - `tests/frontend/unit/src/pages/__tests__/KRIDetailPage.issue-entry.test.tsx`

  Pattern (each file currently has `vi.mock('@/hooks/usePermissions', ...)`):
  ```ts
  // BEFORE:
  vi.mock('@/hooks/usePermissions', () => ({
      usePermissions: () => ({ hasPermission: (r, a) => /*...*/, canViewUsers: /*...*/ }),
  }));

  // AFTER:
  vi.mock('@/contexts/AuthContext', async (orig) => ({
      ...(await orig() as object),
      useAuth: () => ({ user: stubUser, hasPermission: (r, a) => /*...*/ }),
  }));
  ```
  For files that consumed `canViewUsers`/`canManageAccess`/etc., add a parallel `vi.mock('@/authz/useAuthz', ...)`.

**Files to create**: the two new test files above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && pnpm vitest run tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx
cd frontend && pnpm vitest run
```

Full FE unit suite green; 18 mock-rewrites pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — verify no entry references `usePermissions` (none expected).
- `_naming_allowlist.toml` — drop `usePermissions` if currently listed (most likely not; hook lives in `frontend/src/hooks/`).

#### README / doc updates (same commit)

- `frontend/src/hooks/README.md` — remove the entry for `usePermissions`.
- `.planning/audits/_context/03-frontend-architecture.md` — note the hook is gone.

#### Verification commands (run all in order)

1. `cd frontend && pnpm vitest run tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.structural.test.ts` — must pass.
2. `cd frontend && pnpm vitest run tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx` — must pass.
3. `cd frontend && pnpm vitest run tests/frontend/unit/src/components/layout/__tests__/SidebarPolling.test.tsx` — regression green.
4. `cd frontend && pnpm vitest run` — full FE unit suite, all 18 mock-rewrites pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend): remove usePermissions passthrough, route Sidebar via useAuth`.

#### Rollback

- Class: **CROSS-DOMAIN** (18 test files).
- Procedure:
  1. `git revert <SHA>` — restores the 20-line hook + 18 mock files.
- Risk vector: mismatched mock shapes across the 18 rewrites — keep new mocks minimal (only the keys each test consumes) so revert is mechanical.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 3h (delete + Sidebar destructure + 18 mock rewrites + 2 new tests + verification).
- Risk: MEDIUM — 18-file change radius; mismatched mock shapes can cascade.
- Mitigations: structural test pins file absence; per-file mock rewrites are mechanical; #35 lands before #66 to avoid double-rewrite.

---

### Item #33 — #48 — Merge `getErrorMessageKey.ts` + `errorCodeMap.ts`

**Wave**: 4  | **Slot**: v2 Seq 35  | **Effort**: S (~1.5h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none
**Atomic with**: none
**Validator?**: no

#### Why this work

Two i18n files split across `frontend/src/i18n/getErrorMessageKey.ts:1-19` (function importing the map) and `frontend/src/i18n/errorCodeMap.ts:1-14` (the `ERROR_CODE_TO_KEY` const). The recipe merges them into a single `frontend/src/i18n/errorMessageKey.ts` (camelCase to keep neighborhood convention). No re-export shim — both legacy paths have grep-known importers that migrate atomically. Audit ID = #48 (FE-N6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 35 (`plan-loop-3-07-integration-v2.md:378`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/i18n/getErrorMessageKey.ts:1-19`, `frontend/src/i18n/errorCodeMap.ts:1-14`.
- [ ] Pre-flight grep: `rg "from '@/i18n/getErrorMessageKey'" frontend/ tests/frontend/` and `rg "from '@/i18n/errorCodeMap'" frontend/ tests/frontend/` — record exact importer set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (combined behavior, new): `tests/frontend/unit/src/i18n/errorMessageKey.test.ts` — pure-function unit tests for `getErrorMessageKey` and `ERROR_CODE_TO_KEY`.

```ts
import { describe, it, expect } from 'vitest';
import { ERROR_CODE_TO_KEY, getErrorMessageKey } from '@/i18n/errorMessageKey';

describe('getErrorMessageKey', () => {
    it('maps known codes via the table', () => {
        expect(getErrorMessageKey('UNAUTHORIZED')).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('validation_error')).toBe('errorKeys.validation');
    });
    it('falls back to status-based mapping when no code matches', () => {
        expect(getErrorMessageKey(undefined, 401)).toBe('errorKeys.unauthorized');
        expect(getErrorMessageKey('UNKNOWN_X', 500)).toBe('errorKeys.server');
    });
    it('returns errorKeys.unknown when nothing matches', () => {
        expect(getErrorMessageKey()).toBe('errorKeys.unknown');
    });
});

describe('ERROR_CODE_TO_KEY', () => {
    it('has 10 entries covering all UiErrorCode variants', () => {
        expect(Object.keys(ERROR_CODE_TO_KEY)).toHaveLength(10);
    });
});
```

**Test file 2** (absence, new): `tests/frontend/unit/src/i18n/errorMessageKey.absence.test.ts` — asserts the two old files are gone.

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const I18N = path.resolve(__dirname, '../../../../../frontend/src/i18n');

describe('legacy split error files are deleted', () => {
    it('getErrorMessageKey.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'getErrorMessageKey.ts'))).toBe(false);
    });
    it('errorCodeMap.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'errorCodeMap.ts'))).toBe(false);
    });
});
```

**Expected**: RED on absence test.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/i18n/errorMessageKey.ts` — combined module:
  ```ts
  import type { ErrorMessageKey, UiErrorCode } from '@/types/i18n';

  export const ERROR_CODE_TO_KEY: Record<UiErrorCode, ErrorMessageKey> = {
      UNAUTHORIZED: 'errorKeys.unauthorized',
      FORBIDDEN: 'errorKeys.forbidden',
      NOT_FOUND: 'errorKeys.not_found',
      VALIDATION_ERROR: 'errorKeys.validation',
      NETWORK_ERROR: 'errorKeys.network',
      REQUEST_TIMEOUT: 'errorKeys.request_timeout',
      SERVER_ERROR: 'errorKeys.server',
      REQUEST_FAILED: 'errorKeys.request_failed',
      DEMO_LOGIN_FAILED: 'errorKeys.demo_login_failed',
      UNKNOWN_ERROR: 'errorKeys.unknown',
  };

  export function getErrorMessageKey(code?: string | null, status?: number): ErrorMessageKey {
      if (code) {
          const normalized = code.toUpperCase() as UiErrorCode;
          if (normalized in ERROR_CODE_TO_KEY) return ERROR_CODE_TO_KEY[normalized];
      }
      if (status === 401) return 'errorKeys.unauthorized';
      if (status === 403) return 'errorKeys.forbidden';
      if (status === 404) return 'errorKeys.not_found';
      if (status === 422) return 'errorKeys.validation';
      if (status && status >= 500) return 'errorKeys.server';
      return 'errorKeys.unknown';
  }
  ```

**Files to edit**: every importer of either path (collected via pre-flight grep). Migration:
```diff
- import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';
+ import { getErrorMessageKey } from '@/i18n/errorMessageKey';
```
```diff
- import { ERROR_CODE_TO_KEY } from '@/i18n/errorCodeMap';
+ import { ERROR_CODE_TO_KEY } from '@/i18n/errorMessageKey';
```

**Files to delete**:
- `frontend/src/i18n/getErrorMessageKey.ts`.
- `frontend/src/i18n/errorCodeMap.ts`.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- errorMessageKey
cd frontend && npm run -w tests/frontend/unit lint typecheck
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- Integration log notes "i18n error mapping consolidated to `@/i18n/errorMessageKey`."

#### Verification commands (run all in order)

1. `npm run -w tests/frontend/unit lint typecheck` — clean.
2. `npm run -w tests/frontend/unit test -- errorMessageKey` — must pass.
3. `npm run -w tests/frontend/unit test` — full vitest green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic) titled: `chore(i18n): merge getErrorMessageKey + errorCodeMap into errorMessageKey`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores both legacy files and importer paths.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1.5h (combined module + importer migration + 2 tests).
- Risk: LOW — mechanical import rewrite; pure-function bodies are equivalent.
- Mitigations: behavior test pins map size and status fallbacks; absence test pins file deletion.

---

### Item #34 — #64 — Extract QueryClient defaults from `App.tsx`

**Wave**: 4  | **Slot**: v2 Seq 36  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none
**Atomic with**: none — lightly related to #46 (both centralize React Query infra), but **independent**
**Validator?**: no

#### Why this work

`frontend/src/App.tsx:11-18` carries an inline `new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } } })`. The recipe extracts to `frontend/src/lib/queryClient.ts` with `APP_QUERY_CLIENT_DEFAULTS` const + `createAppQueryClient()` factory. Audit ID = #64 (FE-N2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 36 (`plan-loop-3-07-integration-v2.md:379`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/App.tsx:3,11-18`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/lib/queryClient.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { APP_QUERY_CLIENT_DEFAULTS, createAppQueryClient } from '@/lib/queryClient';

describe('app QueryClient defaults', () => {
    it('exposes a 60s staleTime and retry=1', () => {
        const queries = APP_QUERY_CLIENT_DEFAULTS.defaultOptions?.queries;
        expect(queries?.staleTime).toBe(60_000);
        expect(queries?.retry).toBe(1);
    });

    it('createAppQueryClient builds a QueryClient with those defaults', () => {
        const qc = createAppQueryClient();
        const opts = qc.getDefaultOptions();
        expect(opts.queries?.staleTime).toBe(60_000);
        expect(opts.queries?.retry).toBe(1);
    });
});
```

**Expected**: RED — module does not exist yet.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/lib/queryClient.ts`:
  ```ts
  import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

  export const APP_QUERY_CLIENT_DEFAULTS: QueryClientConfig = {
      defaultOptions: {
          queries: {
              staleTime: 1000 * 60, // 1 minute
              retry: 1,
          },
      },
  };

  export function createAppQueryClient(): QueryClient {
      return new QueryClient(APP_QUERY_CLIENT_DEFAULTS);
  }
  ```
- The new test file above.

**Files to edit**:
- `frontend/src/App.tsx`:
  ```diff
  - import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  + import { QueryClientProvider } from '@tanstack/react-query';
  + import { createAppQueryClient } from '@/lib/queryClient';
    ...
  - const queryClient = new QueryClient({
  -   defaultOptions: {
  -     queries: {
  -       staleTime: 1000 * 60, // 1 minute
  -       retry: 1,
  -     },
  -   },
  - });
  + const queryClient = createAppQueryClient();
  ```

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- queryClient
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.
2. `cd frontend && npm run -w tests/frontend/unit test -- queryClient` — must pass.
3. `cd frontend && npm run -w tests/frontend/unit test` — spot check that `App` still mounts.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(frontend): extract App QueryClient defaults to lib/queryClient`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores inline `App.tsx:11-18` block.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1h (factory + 1 unit test + App.tsx edit + verification).
- Risk: LOW — provider tree unchanged; existing `App.tsx` smoke test continues to pass.
- Mitigations: pure-config extract; defaults pinned by 60_000 / retry=1 unit test.

---

### Item #35 — #47 — Extract session-refresh retry policy

**Wave**: 4  | **Slot**: v2 Seq 37  | **Effort**: S (~3h)  | **Priority**: P3  | **Domain**: frontend

**Dependencies**: none — independent
**Atomic with**: none. Hub-wave soft prereq for #71 (services/session merge).
**Validator?**: no

#### Why this work

`frontend/src/services/api/ApiClientCore.ts:25-72` carries the silent-session-refresh decision plus inline 401 retry/refresh/clear logic. Phase 4 verified target lines: 25-30 hold `shouldAttemptSilentSessionRefresh`; 61-73 hold the inline 401 retry/refresh/clear block inside `executeRequest`. The recipe extracts a pure-policy module deciding: (a) whether to attempt a silent refresh given `(pathname, attempt, isExplicitLogoutSuppressed)`, (b) compose the retry — accept a `refreshFn` and `clearSessionFn`, return either "refreshed, retry now" or "give up, throw 401". Audit ID = #47 (FE-N4); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 37 (`plan-loop-3-07-integration-v2.md:380`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/services/api/ApiClientCore.ts:25-30,61-73`.
- [ ] Verify existing `tests/frontend/unit/src/services/api/__tests__/` integration tests.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/services/api/sessionRefreshPolicy.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import {
    shouldAttemptSilentSessionRefresh,
    applySessionRefreshPolicy,
} from '@/services/api/sessionRefreshPolicy';
import { ApiClientError } from '@/services/api/apiErrors';

vi.mock('@/services/session/logoutSuppression', () => ({
    isExplicitLogoutSuppressed: vi.fn(() => false),
}));

describe('shouldAttemptSilentSessionRefresh', () => {
    it('returns false when attempt > 0', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 1 })).toBe(false);
    });
    it('returns false for /api/v1/auth/* paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/auth/login', attempt: 0 })).toBe(false);
    });
    it('returns true on first attempt for non-auth paths', () => {
        expect(shouldAttemptSilentSessionRefresh({ pathname: '/api/v1/risks', attempt: 0 })).toBe(true);
    });
});

describe('applySessionRefreshPolicy', () => {
    it('returns retry when refresh succeeds', async () => {
        const out = await applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => 'new-token', clearSession: () => {} },
        );
        expect(out).toEqual({ kind: 'retry' });
    });

    it('clears session and throws 401 when refresh fails', async () => {
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/risks', attempt: 0 },
            { tryRefresh: async () => null, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(clear).toHaveBeenCalledOnce();
    });

    it('skips refresh and clears immediately when policy says no', async () => {
        const tryRefresh = vi.fn();
        const clear = vi.fn();
        await expect(applySessionRefreshPolicy(
            { pathname: '/api/v1/auth/login', attempt: 0 },
            { tryRefresh, clearSession: clear },
        )).rejects.toBeInstanceOf(ApiClientError);
        expect(tryRefresh).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledOnce();
    });
});
```

**Expected**: RED — module does not exist.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/services/api/sessionRefreshPolicy.ts`:
  ```ts
  import { isExplicitLogoutSuppressed } from '@/services/session/logoutSuppression';
  import { clearAuthenticatedSession } from '@/services/session/manager';
  import { trySilentSessionRefresh } from '@/services/session/sso';
  import { ApiClientError } from './apiErrors';
  import { getErrorMessageKey } from '@/i18n/getErrorMessageKey';

  export interface SessionRefreshContext { pathname: string; attempt: number }

  export function shouldAttemptSilentSessionRefresh({ pathname, attempt }: SessionRefreshContext): boolean {
      if (isExplicitLogoutSuppressed()) return false;
      if (attempt > 0) return false;
      if (pathname.startsWith('/api/v1/auth/')) return false;
      return true;
  }

  export type RefreshOutcome =
      | { kind: 'retry' }
      | { kind: 'unauthorized' };

  export async function applySessionRefreshPolicy(
      ctx: SessionRefreshContext,
      deps: {
          tryRefresh?: () => Promise<string | null | undefined>;
          clearSession?: () => void;
      } = {},
  ): Promise<RefreshOutcome> {
      const tryRefresh = deps.tryRefresh ?? trySilentSessionRefresh;
      const clearSession = deps.clearSession ?? (() => clearAuthenticatedSession({ clearBootstrap: true }));

      if (shouldAttemptSilentSessionRefresh(ctx)) {
          const refreshed = await tryRefresh();
          if (refreshed) return { kind: 'retry' };
      }
      clearSession();
      throw new ApiClientError({
          status: 401,
          code: 'UNAUTHORIZED',
          messageKey: getErrorMessageKey('UNAUTHORIZED', 401),
          rawMessage: 'Unauthorized',
      });
  }
  ```
- The new test file above.

**Files to edit**:
- `frontend/src/services/api/ApiClientCore.ts:25-72` — `executeRequest` collapses to:
  ```diff
    if (response.status === 401) {
  -     if (this.shouldAttemptSilentSessionRefresh(prepared.pathname, attempt)) {
  -         const refreshedToken = await trySilentSessionRefresh();
  -         if (refreshedToken) {
  -             return this.executeRequest({
  -                 endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
  -             });
  -         }
  -     }
  -     clearAuthenticatedSession({ clearBootstrap: true });
  -     throw new ApiClientError({ ... });
  +     const outcome = await applySessionRefreshPolicy(
  +         { pathname: prepared.pathname, attempt },
  +     );
  +     if (outcome.kind === 'retry') {
  +         return this.executeRequest({
  +             endpoint, options, attempt: attempt + 1, parseSuccess, parseError,
  +         });
  +     }
    }
  ```
- Delete the now-unused private `shouldAttemptSilentSessionRefresh` method on `ApiClient`; remove the now-redundant imports (`trySilentSessionRefresh`, `clearAuthenticatedSession`, `isExplicitLogoutSuppressed`).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- sessionRefreshPolicy
cd frontend && npm run -w tests/frontend/unit test -- ApiClientCore
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None (independent).

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit lint typecheck` — clean.
2. `cd frontend && npm run -w tests/frontend/unit test -- sessionRefreshPolicy` — must pass.
3. `cd frontend && npm run -w tests/frontend/unit test -- ApiClientCore` — must pass.
4. Verify `ApiClientCore.ts` shrinks by ≥30 lines.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(api-client): extract session-refresh policy module`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores inline `executeRequest` block.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 3h (policy module + tests + ApiClientCore rewrite + verification).
- Risk: LOW — pure functions with injected deps; `getBlob` inherits the policy automatically through `executeRequest`.
- Mitigations: per-branch unit tests cover refresh-success, refresh-fail, and policy-says-no paths; existing integration tests pin behavior.

---

### Item #36 — #22 — Delete `ControlForm.tsx` 1-line shim

**Wave**: 4  | **Slot**: v2 Seq 38  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none. Strict prerequisite for #23.
**Atomic with**: none — but #22 must complete before #23 (same `control-form/` tree)
**Validator?**: no

#### Why this work

`frontend/src/components/ControlForm.tsx` is a 1-line shim: `export { ControlForm } from './control-form/ControlFormContainer';`. **Phase 4 correction**: 3 prod importers verified — `frontend/src/pages/ControlEditPage.tsx:6`, `frontend/src/pages/ControlNewPage.tsx:6`, `frontend/src/components/ControlCreateDialog.tsx:5`. **Phase 6 correction**: 4 test importers verified, including `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`. Audit ID = #22 (S2.8); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 38 (`plan-loop-3-07-integration-v2.md:381`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `frontend/src/components/ControlForm.tsx`, the 3 production importers, and the 4 test importers (including `tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`).
- [ ] Run `rg "from '@/components/ControlForm'|from './ControlForm'" frontend/ tests/frontend/` — verify import set.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/frontend/unit/src/components/ControlForm.shim-absence.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ControlForm.tsx 1-line shim is deleted', () => {
    it('shim file does not exist', () => {
        const shim = path.resolve(__dirname, '../../../../../frontend/src/components/ControlForm.tsx');
        expect(fs.existsSync(shim)).toBe(false);
    });

    it('canonical ControlFormContainer exports ControlForm', async () => {
        const mod = await import('@/components/control-form/ControlFormContainer');
        expect(typeof mod.ControlForm).toBe('function');
    });
});
```

**Expected**: RED on first assertion. The typecheck gate (`tsc --noEmit`) implicitly enforces that all 3 prod importers + 4 test importers still type-check post-migration.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/pages/ControlEditPage.tsx:6`:
  ```diff
  - import { ControlForm } from '@/components/ControlForm';
  + import { ControlForm } from '@/components/control-form/ControlFormContainer';
  ```
- `frontend/src/pages/ControlNewPage.tsx:6` — same diff.
- `frontend/src/components/ControlCreateDialog.tsx:5`:
  ```diff
  - import { ControlForm } from './ControlForm';
  + import { ControlForm } from './control-form/ControlFormContainer';
  ```
- The 4 test importers, including **`tests/frontend/unit/src/__tests__/approval_ui_rendering.spec.tsx:14`** (Phase 6 correction). Each migrates to the canonical container path.

**Files to delete**:
- `frontend/src/components/ControlForm.tsx`.

**Files to create**: the new test above.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit typecheck
cd frontend && npm run -w tests/frontend/unit test -- ControlForm
```

Both pass.

#### Lock/TOML/Contract updates (same commit)

- None. The deleted file is not a public component documented in any registry.

#### README / doc updates (same commit)

- Integration log: "ControlForm shim removed; canonical = `@/components/control-form/ControlFormContainer`."

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit lint` — clean.
2. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
3. `cd frontend && npm run -w tests/frontend/unit test -- ControlForm` — must pass.
4. `rg "from '@/components/ControlForm'" frontend/ tests/frontend/` — 0 matches.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic — 3 importer edits + 4 test edits + shim delete) titled: `chore(control-form): delete ControlForm 1-line shim`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 1-line shim and 7 importer edits.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1h (3 prod importer rewrites + 4 test importer rewrites + shim delete + 1 absence test).
- Risk: LOW — typecheck catches any missed importer; Phase 6 caught the 4th test importer at `approval_ui_rendering.spec.tsx:14`.
- Mitigations: typecheck gate + absence test + integration log entry.

---

### Item #37 — #23 — Inline `controlFormUtils` helpers

**Wave**: 4  | **Slot**: v2 Seq 39  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: **#22 (Seq 38)** — strict order; both touch `control-form/` tree.
**Atomic with**: none
**Validator?**: no

#### Why this work

`frontend/src/components/control-form/controlFormUtils.ts` is 12 lines with 2 exports — `formatFrequencyLabel`, `getControlFormErrorKey`. Verified consumers (3 references):
- `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5` imports `formatFrequencyLabel`.
- `frontend/src/components/control-form/useControlFormLookups.ts:9` imports `getControlFormErrorKey` (used at `:31, :44`).
- `frontend/src/components/control-form/useControlFormWorkflow.ts:14` imports `getControlFormErrorKey` (used at `:129`).

The recipe inlines each helper at the consumer top-of-file. Phase 4 explicitly authorized inlining despite duplication. Audit ID = #23 (S2.9); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 39 (`plan-loop-3-07-integration-v2.md:382`).
- [ ] Confirm prerequisites complete: #22 lock GREEN (ControlForm shim deleted).
- [ ] Read latest state of `frontend/src/components/control-form/controlFormUtils.ts`, the 3 consumer files.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (absence, new): `tests/frontend/unit/src/components/control-form/controlFormUtils.absence.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('controlFormUtils.ts is inlined into consumers', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormUtils.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

**Test file 2** (inlined-helper behavior pin, new): `tests/frontend/unit/src/components/control-form/inlined-helpers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ApiClientError } from '@/services/apiClient';

describe('inlined formatFrequencyLabel (in ControlFormExecutionStep)', () => {
    it('replaces underscores and title-cases', async () => {
        const mod = await import('@/components/control-form/ControlFormExecutionStep');
        expect(mod).toBeDefined();
    });
});

describe('inlined getControlFormErrorKey (in useControlFormWorkflow & useControlFormLookups)', () => {
    it('returns ApiClientError messageKey when present', () => {
        const err = new ApiClientError({
            status: 422,
            code: 'VALIDATION_ERROR',
            messageKey: 'errorKeys.validation',
            rawMessage: '...',
        });
        // Behavior verified through hook-level tests at
        // tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx
    });
});
```

**Expected**: RED on absence test.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `frontend/src/components/control-form/ControlFormExecutionStep.tsx`:
  ```diff
  - import { formatFrequencyLabel } from './controlFormUtils';
  + // Inlined from former controlFormUtils.ts (deleted in #23).
  + const formatFrequencyLabel = (value: string): string =>
  +     value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  ```
- `frontend/src/components/control-form/useControlFormLookups.ts`:
  ```diff
  - import { getControlFormErrorKey } from './controlFormUtils';
  + import { ApiClientError } from '@/services/apiClient';
  + // Inlined from former controlFormUtils.ts (deleted in #23).
  + const getControlFormErrorKey = (error: unknown, fallback = 'errorKeys.unknown'): string => {
  +     if (error instanceof ApiClientError) return error.messageKey;
  +     return fallback;
  + };
  ```
  (Skip the `ApiClientError` import line if already present.)
- `frontend/src/components/control-form/useControlFormWorkflow.ts` — same diff as `useControlFormLookups.ts`.

**Files to delete**:
- `frontend/src/components/control-form/controlFormUtils.ts`.

**Files to create**: the two new tests above.

> **Refactor note**: the duplication of `getControlFormErrorKey` across `useControlFormLookups.ts` and `useControlFormWorkflow.ts` is intentional — Phase 4 explicit authorization. The helper is too small to warrant a shared module.

#### TDD Step 3 — Confirm GREEN

```
cd frontend && npm run -w tests/frontend/unit test -- control-form
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- Integration log: "controlFormUtils inlined; helpers live at consumer top-of-file."

#### Verification commands (run all in order)

1. `cd frontend && npm run -w tests/frontend/unit lint` — clean.
2. `cd frontend && npm run -w tests/frontend/unit typecheck` — clean.
3. `cd frontend && npm run -w tests/frontend/unit test -- control-form` — must pass.
4. Existing hook-level test at `tests/frontend/unit/src/components/control-form/__tests__/useControlFormWorkflow.test.tsx` (if present — verify before commit) must continue to pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit (atomic — 3 import edits + helper inlines + file delete) titled: `chore(control-form): inline controlFormUtils helpers; delete utility module`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores file and 3 import edits.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (3 inlines + delete + 2 tests + verification).
- Risk: LOW — pure-function helpers; consumer count verified.
- Mitigations: typecheck catches missed inlines; hook-level tests cover behavior; #22 lands first to settle the canonical import path.

---

### Item #38 — #55 — Delete `access_user_service.py` facade

**Wave**: 4  | **Slot**: v2 Seq 40  | **Effort**: S (1-2h)  | **Priority**: P2  | **Domain**: crosscut

**Dependencies**: none. First commit in the doc-contract validator-reentry cluster (Wave 4 Seq 40-45 per `final-section-2-sequence.md:201-208`).
**Atomic with**: none — soft sequence-only cluster #55 → #24+#51 → #56+#61 (validator runs after each commit; partial-removal states are valid intermediate states per Correction C).
**Validator?**: **yes** — `python3 scripts/security/validate_authz_capability_contract.py` MUST exit 0 after stripping path entry from validator test.

#### Why this work

`backend/app/services/access_user_service.py` is a 26-line name-only wrapper with single inlined call site at `backend/app/api/v1/endpoints/access.py:19`. Wrapper signature is identical to canonical `update_access_profile` per `access_user_service.py:18-24`. ADR-007 §Decision context #2 names `_identity_access_lifecycle` as the canonical write-side context for access profile mutation; the facade was redundant. Audit ID = #55 (S7.5); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 40 (`plan-loop-3-07-integration-v2.md:383`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/services/access_user_service.py:10-24`, `backend/app/api/v1/endpoints/access.py:19`, `tests/backend/pytest/test_authz_capability_contract_validator.py:502`, `tests/backend/pytest/test_architecture_deepening_contracts.py:246`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
FACADE = REPO_ROOT / "backend/app/services/access_user_service.py"


def test_access_user_service_facade_deleted() -> None:
    assert not FACADE.exists(), (
        "S7.5: access_user_service.py facade must be deleted"
    )


def test_no_production_module_imports_facade() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "from app.services.access_user_service" in text or "import app.services.access_user_service" in text:
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Expected**: RED — file still exists; 1 production importer.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/services/access_user_service.py` (26 lines).

**Files to edit**:
- `backend/app/api/v1/endpoints/access.py:19` — change `from app.services.access_user_service import update_access_user_settings` to `from app.services._identity_access_lifecycle import update_access_profile as update_access_user_settings`.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502` — remove the `Path("backend/app/services/access_user_service.py")` entry from the path-list assertion.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246` — remove the line `from app.services import access_user_service` (or repoint per local import strategy).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New `test_w13_access_user_service_facade_removed_red.py`.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502` — path entry removed.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246` — import line removed.
- **Capability contract**: `docs/security/authorization-capability-contract.md` and `.json` — strip any reference to `access_user_service.py` (the validator-reentry runs and must remain green).

#### README / doc updates (same commit)

- `backend/app/services/_identity_access_lifecycle/README.md` — confirm Contents lists `update_access_profile` as the canonical mutation entry (no edit if already accurate).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest -q -k "access"` — broader access suite green via `client_factory`.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services backend/app/api/v1/endpoints/access.py` — clean.
6. `mypy backend/app` — clean.

#### Commit boundary

Single commit titled: `S7.5: delete access_user_service facade; access endpoint uses _identity_access_lifecycle`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract).
- Procedure:
  1. `git revert <SHA>` — restores 26-line facade + 3 test edits + contract entries.
  2. Re-run validator; must exit 0.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 1-2h (delete + rewrite import + 2 lock-test edits + contract validator).
- Risk: LOW — single inlined call site; signature parity verified.
- Mitigations: aliasing at import time (`as update_access_user_settings`) keeps endpoint signature stable; lock test catches re-introduction.

---

### Items #39 + #40 — #24 + #51 — Atomic Cluster A: Delete `kris/linked_vendors.py` barrel and `_kri_history/value_application.py` alias

**Wave**: 4  | **Slots**: v2 Seq 41 + 42  | **Effort**: combined S/M (~3h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none. Second cluster in the doc-contract validator-reentry chain (after #55, before #56+#61).
**Atomic with**: **YES — single-commit cluster** (per `plan-loop-2-08-master-sequence.md:283`: *"ATOMIC with #51"*). Both touch the same import line `kris/linked_vendors.py:3` and share 6 doc citations across `docs/security/authorization-capability-contract.{md,json}`.
**Validator?**: **yes** — validator must exit 0 in the same commit.

#### Why this work

Both items must commit contiguously because they share:
- 1 import line: `backend/app/api/v1/endpoints/kris/linked_vendors.py:3` reads `from app.services._kri_history.value_application import visible_linked_vendors`.
- 6 doc citations across `docs/security/authorization-capability-contract.md:116,117,118` and `docs/security/authorization-capability-contract.json:368,388,410`.
- 4 lock-test lines at `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980, 999-1000`.

The 3 remaining production importers of `_kri_history/value_application.py` (`_register_listings/kris.py:31`, `_entity_mutation_lifecycle/direct_apply.py:21`, `kris/linked_vendors.py:3`) must be repointed at `_kri_history.direct_application` in the SAME COMMIT — otherwise either step alone leaves dangling imports.

Audit IDs = #24 (S3.4) + #51 (S3.3); developer verdict = ACCEPT (atomic).

#### Pre-flight checklist

- [ ] Verify slots in master sequence: v2 Seq 41 + 42 (`plan-loop-3-07-integration-v2.md:384-385`).
- [ ] Confirm prerequisites complete: #55 lock GREEN (validator exit 0 between commits).
- [ ] Read latest state of `backend/app/api/v1/endpoints/kris/linked_vendors.py`, `backend/app/services/_kri_history/value_application.py`, `backend/app/services/_register_listings/kris.py:31`, `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21`.
- [ ] Read `docs/security/authorization-capability-contract.md:116-118,161` and `.json:368,388,389,410,411`.
- [ ] Read lock test lines `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980, 999-1000`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

Append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`:

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

**Expected**: RED — both files present; offending imports exist.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/api/v1/endpoints/kris/linked_vendors.py` (5 lines).
- `backend/app/services/_kri_history/value_application.py` (8 lines).

**Files to edit**:
- `backend/app/services/_register_listings/kris.py:31` — repoint:
  ```diff
  - from app.services._kri_history.value_application import visible_linked_vendors
  + from app.services._kri_history.direct_application import visible_linked_vendors
  ```
- `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` — same diff (the third importer was `kris/linked_vendors.py:3` itself, deleted).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980` — DELETE the line `value_application_path = "backend/app/services/_kri_history/value_application.py"` and the two `_source(value_application_path)` assertions at `:979,980`. Otherwise `_source(...)` raises `FileNotFoundError`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:999-1000` — drop the dead negative-assertion strings:
  - `"from app.services._kri_history.value_application import _apply_kri_value_directly"`.
  - `"from app.services._kri_history.value_application import ("`.

**Doc updates (must land in this commit)**:
- `docs/security/authorization-capability-contract.md:116` — strip `kris/linked_vendors.py` from the `backend_authority` cell.
- `docs/security/authorization-capability-contract.md:117` — strip both `kris/linked_vendors.py` from `backend_authority` AND `_kri_history/value_application.py` from `service_policy`.
- `docs/security/authorization-capability-contract.md:118` — strip both `kris/linked_vendors.py` AND `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.md:161` — strip `value_application.py` from the inventory cell.
- `docs/security/authorization-capability-contract.json:368` — strip `kris/linked_vendors.py` from `backend_authority`.
- `docs/security/authorization-capability-contract.json:388` — strip `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:389` — strip `_kri_history/value_application.py`.
- `docs/security/authorization-capability-contract.json:410` — strip `kris/linked_vendors.py`.
- `docs/security/authorization-capability-contract.json:411` — strip `_kri_history/value_application.py`.

**Files to create**: the new structural locks above (appended to `test_w4_bc_g_kri_history_boundaries_red.py`).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "linked_vendors or value_application"
python3 scripts/security/validate_authz_capability_contract.py
```

All pass; validator exit 0.

#### Lock/TOML/Contract updates (same commit)

- New structural lock IS the contract.
- 4 lock-test line edits at `:976-980, 999-1000`.
- 9 doc-citation edits across `.md` and `.json`.

#### README / doc updates (same commit)

- All doc-citation edits enumerated above.

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green.
2. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. `pytest tests/backend/pytest/test_kri_history_intake_workflow.py tests/backend/pytest/test_kris_value_submission_api.py tests/backend/pytest/test_kris_history_listing_api.py -q` — domain suites green.
4. `rg "kris/linked_vendors|_kri_history.value_application|_kri_history/value_application" backend/ tests/backend/pytest/` — only test entries remain; no production-code hits.
5. `ruff check backend/app/services backend/app/api/v1/endpoints/kris` — clean.
6. `mypy backend/app/services backend/app/api/v1/endpoints/kris` — clean.

#### Commit boundary

**SINGLE atomic commit** titled: `S3.3 + S3.4: delete kris/linked_vendors.py barrel and _kri_history/value_application.py alias (atomic)`.

The commit covers:
- 2 file deletes.
- 2 import repoints.
- 4 lock-test line edits at `:976-980,999-1000`.
- 9 doc-citation edits across `.md` and `.json`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract validator).
- Procedure:
  1. `git revert <SHA>` — restores barrel + alias + 6 doc citations + 4 lock lines as one unit.
  2. Re-run validator; exit 0 required.
- Estimated revert time: 20 min.

#### Effort & Risk

- Estimated time: ~3h (2 deletes + 2 repoints + 4 lock-test edits + 9 doc edits + validator + cross-suite verification).
- Risk: MEDIUM — capability contract atomic edit; partial commit leaves either dangling imports or contract drift.
- Mitigations: validator runs in-commit; lock test catches re-introduction; documentation-surface domain coordinates with this recipe (no parallel rewrite on the same MD/JSON cells).

#### Cross-domain handoff

Documentation-surface domain has visibility into the same 6 lines. This recipe absorbs them. Coordinate with docs-domain Phase 5 recipe to ensure no parallel rewrite collides on the same MD/JSON cells.

---

### Items #41 + #42 — #56 + #61 — Atomic Cluster B: Delete `directory_identity_service.py` shim and move `graph_directory_*` modules into `_graph_directory/` package

**Wave**: 4  | **Slots**: v2 Seq 43 + 44  | **Effort**: combined M (~7-9h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: none upstream. Last cluster in Wave 4 doc-contract validator-reentry chain.
**Atomic with**: **YES — paired wave** (per `plan-loop-2-08-master-sequence.md:327`: *"ATOMIC with #61"*). Cross-import dependency between `directory_identity_service.py` and `graph_directory_*` modules.
**Validator?**: **yes** — validator must exit 0 in the same commit (or back-to-back commits if split).

#### Why this work

Two coupled changes:
1. **#56 (S7.6)** — Delete 35-line `backend/app/services/directory_identity_service.py` shim. **Phase 6 correction**: re-exports **13** names (NOT 15). 8 prod importers + 1 script.
2. **#61 (S7.7)** — Move 4 modules `backend/app/services/graph_directory_{auth,errors,service,transport}.py` into `backend/app/services/_graph_directory/` package.

The cross-import is at `graph_directory_service.py:8 from app.services.directory_identity_service import normalize_business_role`. After #61, that file becomes `_graph_directory/service.py` and the import becomes `from app.services._directory_identity import normalize_business_role` — only resolvable in the post-#56 world. **Phase 6 correction**: pair as #61 first (package move), then #56 (shim delete) if split — but single-commit is preferred.

Audit IDs = #56 (S7.6) + #61 (S7.7); developer verdict = ACCEPT (atomic).

#### Pre-flight checklist

- [ ] Verify slots in master sequence: v2 Seq 43 + 44 (`plan-loop-3-07-integration-v2.md:386-387`).
- [ ] Confirm prerequisites complete: #24+#51 atomic cluster GREEN (validator exit 0).
- [ ] Read latest state of `backend/app/services/directory_identity_service.py` (35 lines, 13 re-exports), the 8 prod importers below + `backend/scripts/bootstrap_sso_user.py:17`, the 4 `graph_directory_*.py` modules.
- [ ] Verify the **13** re-exports at `directory_identity_service.py:3-15` (11 names → `_directory_identity`) and `:16-19` (2 names → `_directory_identity.lifecycle`).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1** (new, for #56): `tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/services/directory_identity_service.py"


def test_directory_identity_shim_deleted() -> None:
    assert not SHIM.exists(), "S7.6: directory_identity_service.py shim must be deleted"


def test_no_production_imports_shim() -> None:
    offenders: list[str] = []
    for root in (REPO_ROOT / "backend/app", REPO_ROOT / "backend/scripts"):
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "from app.services.directory_identity_service" in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

**Test file 2** (new, for #61): `tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PKG_INIT = REPO_ROOT / "backend/app/services/_graph_directory/__init__.py"
LEGACY_FILES = (
    REPO_ROOT / "backend/app/services/graph_directory_auth.py",
    REPO_ROOT / "backend/app/services/graph_directory_errors.py",
    REPO_ROOT / "backend/app/services/graph_directory_service.py",
    REPO_ROOT / "backend/app/services/graph_directory_transport.py",
)


def test_graph_directory_package_exists() -> None:
    assert PKG_INIT.is_file(), "S7.7: _graph_directory/__init__.py must exist"


def test_legacy_graph_directory_files_removed() -> None:
    for path in LEGACY_FILES:
        assert not path.exists(), f"S7.7: legacy file {path.name} must be moved into the package"


def test_no_production_imports_legacy_modules() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for stem in ("graph_directory_auth", "graph_directory_errors", "graph_directory_service", "graph_directory_transport"):
            if f"from app.services.{stem}" in text:
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{stem}")
    assert offenders == []
```

**Expected**: RED — both files/packages missing or wrong layout.

#### TDD Step 2 — Implement Change

**Files to move (`#61`)**:
- `backend/app/services/graph_directory_auth.py` (188 lines) → `backend/app/services/_graph_directory/auth.py`.
- `backend/app/services/graph_directory_errors.py` (29 lines) → `backend/app/services/_graph_directory/errors.py`.
- `backend/app/services/graph_directory_service.py` (141 lines) → `backend/app/services/_graph_directory/service.py`.
- `backend/app/services/graph_directory_transport.py` (75 lines) → `backend/app/services/_graph_directory/transport.py`.

Update internal imports inside the four moved files (e.g., `graph_directory_transport.py:14 from app.services.graph_directory_auth import …` becomes `from app.services._graph_directory.auth import …`).

**Files to create (`#61`)**:
- `backend/app/services/_graph_directory/__init__.py` — re-exports public surface; docstring + `__all__`.
- `backend/app/services/_graph_directory/README.md` — per ADR-007 amendment Adapter category.
- `tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py` (above).

**Files to delete (`#56`)**:
- `backend/app/services/directory_identity_service.py` (35 lines, 13 re-exports).

**Files to edit (`#56`)** — rewrite each importer (8 prod + 1 script):
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16` — repoint to `app.services._directory_identity`.
- `backend/app/services/directory_provider_service.py:17` — repoint.
- `backend/app/services/_graph_directory/service.py:8` (after #61 move) — repoint cross-import to `from app.services._directory_identity import normalize_business_role`.
- `backend/app/services/ad_deprovision_service.py:14` — repoint.
- `backend/app/services/_access_workflow/policy.py:11` — repoint.
- `backend/app/services/_identity_access_lifecycle/policy.py:11` — repoint.
- `backend/app/services/_auth_session/jit.py:13` — repoint.
- `backend/app/services/_identity_access_lifecycle/directory_import.py:15` — repoint.
- `backend/scripts/bootstrap_sso_user.py:17` — repoint.

**Mapping for the 13 re-exports**:
- `normalize_business_role`, `apply_directory_profile`, `has_auto_deprovision_reason`, `requires_break_glass_for_reenable`, `resolve_directory_email`, `resolve_or_create_department`, `DirectoryIdentityConflictError`, `DirectoryImportOutcome`, `DirectoryProfileUpdateOutcome`, `DirectoryReenableOutcome`, `DirectorySyncOutcome` → `app.services._directory_identity`.
- `apply_directory_profile_outcome`, `directory_reenable_outcome` → `app.services._directory_identity.lifecycle`.

**Files to edit (`#61` cross-cut)**:
- `backend/app/services/directory_provider_service.py:18` — also touched by #56's repoint; rewrite import to `_graph_directory`.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py -q
python3 scripts/security/validate_authz_capability_contract.py
```

All pass; validator exit 0.

#### Lock/TOML/Contract updates (same commit)

- New 2 architecture locks above.
- ADR-007 amendment lists `_directory_identity` and `_graph_directory` as adapters; the adapter TOML (`_bounded_context_adapters.toml`) created by #74a/#74b lists them — no edit here unless the amendment land has slipped past this commit.
- ADR-009 — no `_reserved_modules.toml` entry needed (forward-only delete; no public API alias).

#### README / doc updates (same commit)

- New `backend/app/services/_graph_directory/README.md` — per ADR-007 amendment Adapter category.
- `backend/app/services/_directory_identity/README.md` — confirm Contents lists all 13 names that #56 just consolidated; no edit if accurate.
- Capability contract docs — verify no `directory_identity_service.py` citation remains; strip if found.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py -x` — must pass.
3. `pytest tests/backend/pytest -q -k "directory or graph_directory or sso"` — broad suite green via `client_factory`.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services` — clean.
7. `mypy backend/app` — clean.

#### Commit boundary

**Recommended**: SINGLE atomic commit titled: `S7.6 + S7.7: delete directory_identity_service shim and move graph_directory_* into _graph_directory/ package (atomic)`.

**Alternative split** (if review pressure favors smaller diffs): 2 back-to-back commits in order **#61 first** (package move), **then #56** (shim delete). The cross-import in `graph_directory_service.py:8` resolves only after #61 lands; #56 then rewrites the cross-import inside the moved file.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract validator + package layout).
- Procedure:
  1. `git revert <SHA>` (or revert both commits in reverse order #56 → #61 if split).
  2. Restore the 4 legacy `graph_directory_*.py` files; restore `directory_identity_service.py`.
  3. Re-run validator; exit 0 required.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: ~7-9h (S+M = #56 1-2h + #61 5-7h; combined cluster cost ~7h with shared verification).
- Risk: MEDIUM — package layout change + 13 import repoints + cross-package import; partial revert leaves dangling imports.
- Mitigations: 2 lock tests pin file/package layout; ADR-007 amendment + adapter TOML enforce category; validator runs in-commit; `_graph_directory/__init__.py` re-exports the public surface so external callers stay stable.

---

## Wave 5 — P2 Chains + ADR-007 Amendment Text (Items 43-57 in this section, v2 Seq 45-58 plus #43/#44 cross-domain pair)

The v2 master sequence places 16 items into Wave 5 (per `final-section-2-sequence.md:209-223`). This section continues with the user-supplied ordering: #74b, #17, #49, #59, #9, #34, #27, #8, #28, #30, #16, #38, #31, #43, #44.

> **Validator runs in Wave 5**: 0. The doc-contract validator-reentry chain
> closed in Wave 4. Wave 5 may still touch contract docs for vocabulary
> additions (#34, #60), but no validator-gating commit is the gate-of-the-day.

> **Critical chain reminder** (per `final-section-2-sequence.md:274-283`):
> the issues critical path `#2 → #8 → #28 → #30` runs entirely through this
> wave (#8 at Seq 52, #28 at Seq 53, #30 at Seq 54).

---

### Item #43 — #74b — ADR-007 amendment text

**Wave**: 5  | **Slot**: v2 Seq 45  | **Effort**: M (4-6h)  | **Priority**: P3  | **Domain**: crosscut (ADR)

**Dependencies**: **#74a (Seq 3, Wave 1)** for the 5 TOML allowlists; **#61 (Seq 44, Wave 4)** must have landed so the new `_graph_directory` package exists for the adapter TOML to cite.
**Atomic with**: none — but the disjointness lock referenced here was created in #74a; #74b only appends the amendment text.
**Validator?**: no

#### Why this work

ADR-007 named seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts, and a small set of cross-cutting policy modules. Without a documented secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages. #74b documents the secondary taxonomy and binds it to the disjointness lock created in #74a.

> **Per Phase 6 corrections**: the **full amendment text** lives in the
> Section 6 ADR drafts file (`final-section-6-adrs.md`); this recipe only
> references and locks it. The disjointness semantics are: every
> underscore-prefixed package is in EXACTLY ONE primary allowlist
> (with `_register_listings` dual-classed write-side AND read-shape, and
> workflow-pair right-halves additionally appearing in the workflow-pair
> allowlist as many-to-one — that exemption is the only departure from
> strict disjointness).

Audit ID = #74b (ADR-007 amendment); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 45 (`plan-loop-3-07-integration-v2.md:388`).
- [ ] Confirm prerequisites: #74a 5 TOMLs landed (`_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`); #61 `_graph_directory/` package created.
- [ ] Read latest state of `docs/adr/ADR-007-bounded-context-taxonomy.md`.
- [ ] Read `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (created by #74a).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

No new test in #74b itself; the disjointness lock and the 5 TOML allowlists were authored in #74a. The doc update is the deliverable.

If the disjointness lock authored in #74a does not yet recognize `_graph_directory` as adapter, append/extend an assertion:

```python
def test_amendment_recognizes_graph_directory_adapter() -> None:
    """#74b: ADR-007 amendment binding to TOML adapter list includes _graph_directory."""
    import tomllib
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    adapters = tomllib.loads((REPO / "tests/backend/pytest/architecture/_bounded_context_adapters.toml").read_text())
    names = {entry["context"] for entry in adapters.get("contexts", [])}
    assert "_graph_directory" in names, "#74b amendment must list _graph_directory in adapter TOML"
```

**Expected**: GREEN already if #61 + #74a fully landed; RED otherwise.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — append the **Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts** text. Full text in `final-section-6-adrs.md`.

**Files to create**: none (TOMLs and disjointness lock created in #74a).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- The 5 TOMLs were authored under #74a; #74b only references them.
- Disjointness lock recognizes the renamed `_bounded_context_cross_cutting.toml`.

#### README / doc updates (same commit)

- ADR-007 amendment text appended (per `final-section-6-adrs.md`).
- Cross-references — ADR-001 (`_authorization_capabilities` SSOT), ADR-008 (`_config` SSOT), ADR-003 (adapter exception translation).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — must pass.
2. `make -f scripts/Makefile test-architecture-locks` — locks green.
3. (Doc-only build sanity check if any.)

#### Commit boundary

Single commit titled: `docs(adr): append ADR-007 Amendment 1 (read-shape, workflow-paired, adapter, cross-cutting)`.

#### Rollback

- Class: **DOC-ONLY**.
- Procedure:
  1. `git revert <SHA>` to remove the appended amendment text.
  2. The 5 TOMLs and disjointness lock survive (created in #74a; not removed by this revert).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 4-6h (verify amendment text against current TOML state + 11 workflow pairs + 6 adapters + 2 cross-cutting + ADR-007 cross-references).
- Risk: LOW — doc-only.
- Mitigations: disjointness lock catches misclassification; the amendment text in `final-section-6-adrs.md` was Phase 4-corrected against the current 31-package count.

---

### Item #44 — #17 — Inline `_monitoring_response` endpoint shim

**Wave**: 5  | **Slot**: v2 Seq 46  | **Effort**: S (~45 min)  | **Priority**: P2  | **Domain**: vendor (endpoints)

**Dependencies**: none. Independent leaf; pure import-rewrite + file delete. First item in the **monitoring hub-wave** `#17 → #49 → #59`.
**Atomic with**: none. Hub-wave additive ordering.
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/_monitoring_response.py:1-26` is a 26-line compatibility adapter re-exporting 9 names from `app.services._monitoring_response`. **Phase 6 verified**: 14 importers across `endpoints/{controls,risks,kris}/crud/*.py`, `endpoints/{controls,risks}/linking.py|control_links.py`, `endpoints/risks/control_links.py`, and `endpoints/departments/{controls,kris}.py`. The recipe rewrites all 14 importers and deletes the shim. Audit ID = #17 (S2.1); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 46 (`plan-loop-3-07-integration-v2.md:389`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/_monitoring_response.py:1-26` and the 14 importers:
  - `backend/app/api/v1/endpoints/departments/controls.py:10`
  - `backend/app/api/v1/endpoints/departments/kris.py:8`
  - `backend/app/api/v1/endpoints/controls/crud/create.py:6`
  - `backend/app/api/v1/endpoints/controls/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/controls/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/controls/linking.py:4`
  - `backend/app/api/v1/endpoints/risks/control_links.py:4`
  - `backend/app/api/v1/endpoints/risks/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/risks/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/risks/crud/create.py:7`
  - `backend/app/api/v1/endpoints/kris/crud/detail.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/create.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/restore.py:6`
  - `backend/app/api/v1/endpoints/kris/crud/breaches.py:8`
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""RED: _monitoring_response endpoints shim deleted; canonical service path used."""
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract


def test_endpoint_shim_file_deleted() -> None:
    assert not Path("backend/app/api/v1/endpoints/_monitoring_response.py").exists()


def test_no_endpoint_imports_shim() -> None:
    import subprocess
    out = subprocess.run(
        ["grep", "-rn", "from app.api.v1.endpoints._monitoring_response", "backend", "--include=*.py"],
        capture_output=True, text=True,
    )
    assert out.stdout == "", f"Unexpected importers:\n{out.stdout}"


def test_canonical_service_module_exposes_surface() -> None:
    from app.services import _monitoring_response as svc
    for name in (
        "MonitoringResponseContext", "build_control_monitoring_fields",
        "build_kri_monitoring_fields", "load_monitoring_response_context",
        "serialize_control_brief_for_link", "serialize_control_read",
        "serialize_control_risk_link", "serialize_kri_response",
        "serialize_risk_read",
    ):
        assert hasattr(svc, name), name
```

**Expected**: RED — shim file exists; 14 importers reference it.

#### TDD Step 2 — Implement Change

For each of the 14 importers, rewrite the import line:
```diff
- from app.api.v1.endpoints._monitoring_response import (...)
+ from app.services._monitoring_response import (...)
```
(Imported names unchanged; only module path swaps.)

After all 14 are rewritten, **delete** `backend/app/api/v1/endpoints/_monitoring_response.py` (26 lines).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- Deepening contract test does NOT pin this shim; no edit required.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(monitoring): inline endpoint shim; 14 importers repointed to service`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 26-line file + 14 import lines.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ~45 min (14 import rewrites in lockstep + file delete + RED test + verification).
- Risk: LOW — pure import-graph rewrite; no DB / schema change.
- Mitigations: lock test pins shim absence; surface check pins canonical names exposed by service module.

---

### Item #45 — #49 — Inline `_control_execution/monitoring.py` wrapper

**Wave**: 5  | **Slot**: v2 Seq 47  | **Effort**: S (~45 min)  | **Priority**: P2  | **Domain**: endpoints (control execution)

**Dependencies**: **#17 (Seq 46)** — same monitoring hub-wave. Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`.
**Atomic with**: none. Hub-wave additive.
**Validator?**: no

#### Why this work

`backend/app/services/_control_execution/monitoring.py:1-11` is an 11-line passthrough:
```python
async def load_control_execution_monitoring_context(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())
```

4 callers, all in `backend/app/services/_control_execution/link_governance.py:25,62,91,141,170`. Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`. Audit ID = #49 (S2.2); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 47 (`plan-loop-3-07-integration-v2.md:390`).
- [ ] Confirm prerequisites complete: #17 lock GREEN.
- [ ] Read latest state of `backend/app/services/_control_execution/monitoring.py:1-11` and `_control_execution/link_governance.py:25,62,91,141,170`.
- [ ] Read existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:183-194`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""RED: monitoring.py wrapper deleted; inlined into link_governance."""
import inspect
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract


def test_monitoring_wrapper_module_removed() -> None:
    assert not Path("backend/app/services/_control_execution/monitoring.py").exists()


def test_link_governance_inlines_load_call() -> None:
    from app.services._control_execution import link_governance
    src = inspect.getsource(link_governance)
    assert "from app.services._monitoring_response import" in src
    assert "load_control_execution_monitoring_context" not in src
    assert "load_monitoring_response_context" in src
```

**Expected**: RED — wrapper module exists; link_governance still imports the wrapper.

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/services/_control_execution/monitoring.py` (11 lines).

**Files to edit**:
- `backend/app/services/_control_execution/link_governance.py:25` — change:
  ```diff
  - from app.services._control_execution.monitoring import load_control_execution_monitoring_context
  + from app.services._monitoring_response import load_monitoring_response_context
  + from app.core.datetime_utils import utc_now
  ```
  Recommended: keep one local helper at the top of `link_governance.py`:
  ```python
  async def _ctx(db: AsyncSession) -> MonitoringResponseContext:
      now = utc_now()
      return await load_monitoring_response_context(db, now=now, today=now.date())
  ```
  Call `_ctx(db)` 4 times at `:62,91,141,170`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:183-194` — REWRITE:
  - `:184` — drop `monitoring` from the imports tuple.
  - `:188` — change `assert hasattr(monitoring, "load_control_execution_monitoring_context")` to test for `_ctx` helper or remove this assertion entirely.
  - `:192` — change `assert "from app.services._control_execution.monitoring" in governance_source` to `assert "from app.services._monitoring_response import" in governance_source`.

  New body:
  ```python
  def test_control_execution_governance_uses_split_modules() -> None:
      from app.services._control_execution import access, link_governance, link_policy, projection

      assert hasattr(access, "ControlRiskAccessDecision")
      assert hasattr(projection, "ControlExecutionProjection")
      assert hasattr(link_policy, "ControlRiskLinkPlan")

      governance_source = inspect.getsource(link_governance)
      assert "from app.services._monitoring_response import" in governance_source
      assert "app.api.v1.endpoints" not in governance_source
  ```

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py tests/backend/pytest/test_architecture_deepening_contracts.py::test_control_execution_governance_uses_split_modules -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192` — rewritten as above.
- New lock test above.

#### README / doc updates (same commit)

- `backend/app/services/_control_execution/README.md` (if exists) — strike `monitoring.py` from inventory; note inlining.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_control_execution_governance_uses_split_modules -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(control-execution): inline monitoring wrapper into link_governance`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 11-line wrapper + 4 import sites + lock-test edits.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: ~45 min (delete + 4 inlines or `_ctx` helper + 2 lock-test rewrites + verification).
- Risk: LOW — pure passthrough; behavior preserved.
- Mitigations: lock-test rewrite is atomic with the inline; existing deepening lock retained.

---

### Item #46 — #59 — Consolidate `_monitoring_*` packages (docs+lock)

**Wave**: 5  | **Slot**: v2 Seq 48  | **Effort**: M (4-6h)  | **Priority**: P3  | **Domain**: endpoints (monitoring)

**Dependencies**: **#17 (Seq 46), #49 (Seq 47)** — terminal of monitoring hub-wave.
**Atomic with**: none.
**Validator?**: no

#### Why this work

**Phase 4/6 CRITICAL correction**: `_monitoring_response` IS A SINGLE FILE (`backend/app/services/_monitoring_response.py`, 278 lines), NOT a package. The recipe takes path **(b)**: drop the `_monitoring_response/README.md` requirement and use **docstring + `_monitoring_status/README.md` only**. Path (a) (split single file into package first) requires moving 278 lines into N submodules with no functional change and is out of scope for #59.

The deliverable: extend the module docstring at `backend/app/services/_monitoring_response.py:1` to describe role + dependency on `_monitoring_status`, and append a sentence to `backend/app/services/_monitoring_status/README.md` Notes section describing `_monitoring_response.py`. Audit ID = #59 (S2.10); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 48 (`plan-loop-3-07-integration-v2.md:391`).
- [ ] Confirm prerequisites complete: #17 + #49 locks GREEN.
- [ ] Read latest state of `backend/app/services/_monitoring_response.py:1-15` (docstring), `backend/app/services/_monitoring_status/README.md`.
- [ ] Confirm `_monitoring_response.py` is a single file, NOT a package (Phase 6 CRITICAL).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
RESPONSE_FILE = REPO_ROOT / "backend/app/services/_monitoring_response.py"
STATUS_README = REPO_ROOT / "backend/app/services/_monitoring_status/README.md"
PACKAGE_INIT = REPO_ROOT / "backend/app/services/_monitoring_response/__init__.py"


def test_monitoring_response_docstring_mentions_monitoring_status() -> None:
    text = RESPONSE_FILE.read_text(encoding="utf-8")
    # docstring is at top of module
    assert "monitoring_status" in text[:600], "docstring must reference _monitoring_status"


def test_monitoring_status_readme_mentions_monitoring_response() -> None:
    text = STATUS_README.read_text(encoding="utf-8")
    assert "_monitoring_response.py" in text


def test_monitoring_response_remains_single_file() -> None:
    # Phase 6 CRITICAL: _monitoring_response is a single file; no package layout.
    assert not PACKAGE_INIT.exists(), (
        "S2.10: _monitoring_response must remain a single file, not a package"
    )
```

**Expected**: RED on docstring/README substring expectations.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_monitoring_response.py:1-15` — extend module docstring to:
  ```python
  """Read-shape projection for monitoring responses. Pairs with _monitoring_status (see services/_monitoring_status/README.md). File-level entry per ADR-007 amendment."""
  ```
- `backend/app/services/_monitoring_status/README.md` — append a sentence to Notes section describing `_monitoring_response.py` is the file-level read-shape complement.

**Files to create**: the new lock test above.

**Files to delete**: none.

> **DO NOT create** `backend/app/services/_monitoring_response/__init__.py` — Phase 6 CRITICAL: `_monitoring_response` is a single file. The README requirement was dropped.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py -x
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- `_bounded_context_read_shape.toml` (created by #74b/#74a) holds `_monitoring_response.py` as a file entry — this recipe does NOT populate that TOML; #74b/#74a does.

#### README / doc updates (same commit)

- `backend/app/services/_monitoring_response.py:1` — docstring extended.
- `backend/app/services/_monitoring_status/README.md` — Notes append.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py -x` — must pass.
2. `pytest tests/backend/pytest -q -k "monitoring"` — broad monitoring suite green.
3. `ruff check backend/app/services/_monitoring_response.py backend/app/services/_monitoring_status` — clean.
4. `mypy backend/app/services/_monitoring_response.py backend/app/services/_monitoring_status` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `docs(monitoring): consolidate _monitoring_response/_monitoring_status taxonomy via docstring + README cross-link`.

#### Rollback

- Class: **DOC-ONLY** (per Phase 6 path-(b) decision).
- Procedure:
  1. `git revert <SHA>` — restores docstring + README + drops the lock test.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 4-6h (research + docstring + README + lock test + verification; the upper bound covers reviewer alignment on Phase 4 path-b decision).
- Risk: LOW — doc-only.
- Mitigations: lock test pins single-file invariant; ADR-007 amendment treats `_monitoring_response.py` as a file entry; no production imports change.

---

### Item #47 — #9 — Delete-and-redirect duplicate `can_user_view_approval_resource`

**Wave**: 5  | **Slot**: v2 Seq 49  | **Effort**: S (~2h)  | **Priority**: P2  | **Domain**: approvals

**Dependencies**: none. **First commit in `#9 → #34 → #60` approval_scenario_policy hub-wave**.
**Atomic with**: none.
**Validator?**: no — no TOML allowlist anchors `can_user_view_approval_resource`.

#### Why this work

`backend/app/services/_notification_approval_helpers.py:72-79` carries a duplicate `can_user_view_approval_resource` body. Bodies are identical to the canonical `approval_scenario_policy.can_view_approval_resource` at `backend/app/services/approval_scenario_policy.py:134`; only the canonical version carries a docstring. The single internal caller is at `:98` of `_notification_approval_helpers.py`. Audit ID = #9 (S6.5); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 49 (`plan-loop-3-07-integration-v2.md:392`).
- [ ] Confirm prerequisites: none. (Hub-wave additive surgery.)
- [ ] Read latest state of `backend/app/services/_notification_approval_helpers.py:9,72-79,98`, `backend/app/services/approval_scenario_policy.py:134`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (append to existing): `tests/backend/pytest/test_architecture_deepening_contracts.py`

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

Behavioral regression: extend `tests/backend/pytest/test_approval_workflow.py` (already imports `can_view_approval_resource` at `:26`) with a parametric test asserting `eligible_approval_notification_recipients` skips a candidate without read access on each `ApprovalResourceType` (RISK, CONTROL, KRI), incrementing `skipped["hidden_resource"]`. Use `client_factory` for any HTTP-level assertion.

**Expected**: RED — duplicate body still exists.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_notification_approval_helpers.py:72-79` — DELETE the duplicate body.
- Same file, line 98 — rewrite the call site: `if not await can_view_approval_resource(db, candidate, approval):`.
- Same file, line 9 — extend the existing `from app.services.approval_scenario_policy import (...)` import to include `can_view_approval_resource` (which already imports `RISK_OWNER_APPROVER_ROLE, scenario_roles_for_approval`).

**Files to create**: none.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py -x
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New structural assertion above.
- No TOML allowlist anchors `can_user_view_approval_resource`.

#### README / doc updates (same commit)

- None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `approval_scenario_policy.py`.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py -x` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k notification_approval` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `refactor(approvals): consolidate can_view_approval_resource on approval_scenario_policy`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores duplicate body.
  2. No serialization, schema, or wire-format change.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 2h (delete + import update + call-site rewrite + structural assertion + behavioral regression).
- Risk: LOW — bodies are byte-identical (Loop B).
- Mitigations: structural lock catches re-introduction; behavioral regression pins recipient eligibility behavior.

---

### Item #48 — #34 — Extract `resolve_approval_privilege_tier` helper

**Wave**: 5  | **Slot**: v2 Seq 50  | **Effort**: **XL** (28-32h, Phase 4 corrected from M)  | **Priority**: P3  | **Domain**: approvals

**Dependencies**: **#9 (Seq 49)** — additive hub-wave; **2-week separation** between #34 (Wave 5) and #60 (Wave 7) so the migration soaks before layering FastAPI Depends on top. Lands AFTER #37 + #12 per Correction A.
**Atomic with**: none.
**Validator?**: no — but capability-contract vocabulary edits at `md:43-54` require validator green check.

#### Why this work

Extract a single canonical helper into `backend/app/services/approval_scenario_policy.py` returning a frozen dataclass (`ApprovalPrivilegeTier`) plus async `resolve_approval_privilege_tier(db, user, approval) -> ApprovalPrivilegeTier`. Migrate **25 call sites across 16 files** (Phase 4 verification — Loop 1's "22+" was a hedge; AST scan confirms 25). **Phase 6 verification: 25 sites in 16 files matches Phase 5 P5-A3 exactly**.

This recipe is the **single owner** of the `can_resolve_approvals(current_user)` migration. Other domain recipes must NOT double-migrate the same predicate. Cross-domain prerequisites affect shared files in Risks/Controls/KRIs domains:
- `_authorization_capabilities/{risks,controls,kris}.py` (3 files shared with R/C/K plans).
- `_entity_mutation_lifecycle/{approval_plans,archive_plans}.py` (mutation flow).
- `_kri_history/{governance,intake}.py` (KRI domain).

Audit ID = #34 (S6.6); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 50 (`plan-loop-3-07-integration-v2.md:393`).
- [ ] Confirm prerequisites complete: #9 lock GREEN; #37 (Seq 6) and #12 (Seq 7) landed.
- [ ] Read latest state of `backend/app/services/approval_scenario_policy.py:142` (insertion point) and the 16 files / 25 lines listed below.
- [ ] AST-scan to confirm 25 call sites: `python3 -c "..."` (helper provided in production edits).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test A** (behavioral parametric tier consistency, new): `tests/backend/pytest/test_approval_privilege_tier.py`

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

**Test B** (AST-based structural lock, append to `tests/backend/pytest/test_architecture_deepening_contracts.py`):

> **Phase 6 correction**: AST-scan code snippet from `recipe-03-approvals.md:1218-1259` must be **inline in this recipe** (not paraphrased). The 25-site count + AST-scan are verified together.

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


def test_resolve_approval_privilege_tier_canonical() -> None:
    """S6.6: helper exported from approval_scenario_policy."""
    import importlib
    policy = importlib.import_module("app.services.approval_scenario_policy")
    assert hasattr(policy, "resolve_approval_privilege_tier")
    assert hasattr(policy, "ApprovalPrivilegeTier")
```

**Expected**: RED — current code has 25 offending sites; helper does not exist.

#### TDD Step 2 — Implement Change

**Helper introduction** at `backend/app/services/approval_scenario_policy.py` (append after line `:142`, after `can_view_approval_resource`):

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

**Call-site migration (25 sites in 16 files)** — verified via AST scan; matches Phase 5 P5-A3:

| File | Line(s) | Notes |
|---|---|---|
| `backend/app/api/v1/endpoints/approvals/detail.py` | :47 | replace 4 hand-rolled booleans with single tier lookup |
| `backend/app/api/v1/endpoints/notifications.py` | :127 | bare `is_privileged` read |
| `backend/app/api/v1/endpoints/users/summary.py` | :26 | bare `is_privileged` read |
| `backend/app/services/_approval_execution/authorization.py` | :30 | replace 5 booleans |
| `backend/app/services/_approval_queue/counts.py` | :12 | same |
| `backend/app/services/_approval_queue/queries.py` | :28, :33 | adjust f-string log line at `:28` to read `tier.is_privileged` |
| `backend/app/services/_authorization_capabilities/approvals.py` | :15 | same |
| `backend/app/services/_authorization_capabilities/controls.py` | :54 | cross-domain — Risks/Controls owner |
| `backend/app/services/_authorization_capabilities/kris.py` | :74 | cross-domain — KRIs owner |
| `backend/app/services/_authorization_capabilities/risks.py` | :54 | cross-domain — Risks owner |
| `backend/app/services/_entity_mutation_lifecycle/approval_plans.py` | :69, :162, :267 | cross-domain — mutation flow |
| `backend/app/services/_entity_mutation_lifecycle/archive_plans.py` | :110, :186, :255 | cross-domain — mutation flow |
| `backend/app/services/_kri_history/governance.py` | :238 | cross-domain — KRI |
| `backend/app/services/_kri_history/intake.py` | :42 | cross-domain — KRI |
| `backend/app/services/approval_execution_service.py` | :116, :222, :235, :237 | collapse 4 predicate calls into one helper invocation per function |
| `backend/app/services/notification_visibility.py` | :78, :207 | same |

Total: **25 sites in 16 files**.

Each site replaces `can_resolve_approvals(current_user)` (or `can_resolve_approvals(user)`) with reading `tier.is_privileged` from a single `tier = await resolve_approval_privilege_tier(db, current_user, approval)` invocation per scope. Drop `from app.core.permissions import can_resolve_approvals` from each migrated file (keep only in `approval_scenario_policy.py` and `core.permissions`).

`backend/app/core/permissions.py` and `backend/app/core/_permissions/evaluation.py:65` keep `can_resolve_approvals` exports — the helper still uses it internally.

**Files to create**: 1 new behavioral test + 2 lock-test additions to existing file.

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_privilege_tier.py
cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k "resolve_approval_privilege_tier or can_resolve_approvals_only"
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New AST-based deepening contract (Test B above).
- **§Vocabulary edit at `docs/security/authorization-capability-contract.md:43-54`** (Phase 4 correction — NOT line `:119`). Append a table row:
  ```markdown
  | Privilege tier | Resolved per-approval boolean fivefold (`is_privileged`, `is_primary_approver`, `is_requester`, `scenario_match`, `privileged_scenario_match`) returned by `approval_scenario_policy.resolve_approval_privilege_tier`. |
  ```
- Re-emit `docs/security/authorization-capability-contract.json` so `python3 scripts/security/validate_authz_capability_contract.py` passes.
- AUTHZ-APPROVALS row at `:119` — extend `Service policy` cell to cite `resolve_approval_privilege_tier` alongside the existing `approval_scenario_policy.py` reference.
- No `_endpoint_commit_allowlist.toml` ratchet (no new `db.commit`).
- No `_capabilities_all_allowlist.toml` change (no new resource/action pair).
- No `_naming_allowlist.toml` change.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md:43-54` — vocabulary row above.
- `docs/security/authorization-capability-contract.md:119` — Service-policy cell extended.
- `backend/app/services/_approval_execution/README.md`, `backend/app/services/_approval_queue/README.md`, `backend/app/services/_entity_mutation_lifecycle/README.md`, `backend/app/services/_kri_history/README.md` — if they enumerate authorization predicates, cross-reference helper.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_privilege_tier.py` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_w1_privileged_escalation_red.py -x` — must pass.
3. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/test_architecture_deepening_contracts.py -k "resolve_approval_privilege_tier or can_resolve_approvals_only"` — must pass.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE migration commit titled: `refactor(approvals): centralize privilege-tier resolution via resolve_approval_privilege_tier`. RED tests + helper introduction + 25-site migration + doc updates in same commit.

#### Rollback

- Class: **CROSS-DOMAIN** (largest in-domain diff: 16 files × 25 sites).
- Procedure:
  1. `git revert <SHA>` — restores per-site predicates verbatim.
  2. Drop the new test file + 2 lock-test additions.
  3. Restore `md:43-54` vocabulary row + `:119` service-policy cell.
  4. Re-run validator; exit 0 required.
- No schema, capability surface, or wire-format change.
- Estimated revert time: 60 min (16 files; manual review per-file).

#### Effort & Risk

- Estimated time: **XL (28-32h)** (Phase 4 correction; Loop 1 said M). 25 sites × ~30min decision time + dataclass design + parametric matrix + AST-scan test + 2 review rounds + doc/json round-trip.
- Risk: HIGH — broad cross-domain surface; 25 call-site behaviors must remain identical; partial commit leaves half-migrated codebase.
- Mitigations: parametric tier-consistency test pins behavior across role × scenario matrix; AST-scan lock catches re-introduction (future-proof against new files); single-commit migration guards against partial state; 2-week soak gates #60.

---

### Item #49 — #27 — Issue-loading duplicate deletion

**Wave**: 5  | **Slot**: v2 Seq 51  | **Effort**: M (~5h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none. Strict prerequisite for #30.
**Atomic with**: none.
**Validator?**: no — no entry references `_shared/loading.py`.

#### Why this work

`backend/app/api/v1/endpoints/issues/_shared/loading.py:22-65` is byte-identical to `backend/app/services/_issue_workflow/loading.py` (Loop B verified). Recipe deletes the endpoint duplicate, repoints 4 endpoint consumer files (`crud/{contextual,create,detail}.py`, `links.py`) to the service module. Audit ID = #27 (S4.2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 51 (`plan-loop-3-07-integration-v2.md:394`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/loading.py`, `backend/app/services/_issue_workflow/loading.py`, the 4 endpoint consumers (`crud/contextual.py`, `crud/create.py`, `crud/detail.py`, `links.py`).
- [ ] Confirm endpoint `_shared/loading.py:22-65` is byte-identical to service module.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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

**Expected**: RED — `_shared/loading.py:29` literally contains the fragment.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:20,95` — replace `_get_issue_with_relations` import with `from app.services._issue_workflow.loading import get_issue_with_relations`; rename call site.
- `backend/app/api/v1/endpoints/issues/crud/create.py:21,107` — same pattern.
- `backend/app/api/v1/endpoints/issues/crud/detail.py:10,21` — replace `_get_readable_issue_or_404` with `from app.services._issue_workflow.loading import get_readable_issue_or_404`; rename call site.
- `backend/app/api/v1/endpoints/issues/links.py:14,80,128` — replace `_get_writable_issue_or_404` with `from app.services._issue_workflow.loading import get_writable_issue_or_404`; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:11,54-56` — drop the three `_get_*` imports and their `__all__` entries (overlaps with #30; in-scope edit here is purely the import drop).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` (entire file `:1-65`).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- Existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206` already asserts service-side `loading.get_issue_with_relations`, `loading.get_writable_issue_or_404` — confirm still GREEN.
- New structural lock above.
- No TOML allowlist edits (no entry references `_shared/loading.py`).
- No capability-contract change (file not cited).

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md:13` — strike `loading.py` from Contents list.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_endpoint_issues_loading_is_thin_or_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"` — locks green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.
6. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.2: delete endpoint issues/_shared/loading.py; service loader is canonical`.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:317`).
- Procedure:
  1. `git revert <SHA>` — restores duplicate loader.
  2. Drop new lock test.
  3. Restore line `:13` in README.
- Coordination: chain into #30. If #30 landed, revert sequence is `#30 → #28 → #27`.
- Estimated revert time: 25 min.

#### Effort & Risk

- Estimated time: 5h (4 endpoint files repointed + 1 file deleted + barrel + README + lock).
- Risk: LOW — service loader is canonical body; underscore copy was dead duplication.
- Mitigations: existing deepening lock at `:1192-1206` asserts service-side presence; new lock pins endpoint-side absence.

---

### Item #50 — #8 — Source-validation split + canonical link helpers consolidation

**Wave**: 5  | **Slot**: v2 Seq 52  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#2 (Seq 14, Wave 3)**. Critical chain `#2 → #8 → #28 → #30`.
**Atomic with**: none (sequential prerequisite for #28).
**Validator?**: yes — capability contract `md:128` and `.json:629` add `_issue_workflow/assignment.py`.

#### Why this work

`backend/app/services/_issue_workflow/source_validation.py:16-21,24-42` carries owner-validation helpers `validate_user_exists` and `ensure_owner_assignable` that conceptually belong in `_issue_workflow/assignment.py`. Recipe promotes the bodies (byte-identical move), repoints `update_plans.py` and `execution.py` callers, and updates the endpoint barrel re-export. **Phase 6 critical correction**: must edit `tests/backend/pytest/test_architecture_deepening_contracts.py:1199` AND `:1203` (not just `:1193`). Audit ID = #8 (B-N2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 52 (`plan-loop-3-07-integration-v2.md:395`).
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` (must pass — proves #2 landed).
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py`, `_issue_workflow/assignment.py`, `_issue_register/source_mutation.py`, `backend/app/api/v1/endpoints/issues/_shared/validation.py`, `_shared/links.py`.
- [ ] Confirm `_issue_workflow/assignment.py` exists and does NOT yet expose `validate_user_exists` / `ensure_owner_assignable`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**File**: append to `tests/backend/pytest/test_architecture_deepening_contracts.py` (existing file already has `pytestmark = pytest.mark.contract` at module scope per Loop 1 plan `:54`).

```python
def test_issue_workflow_owner_validation_lives_in_dedicated_module() -> None:
    from app.services._issue_workflow import assignment

    source = _source("backend/app/services/_issue_workflow/source_validation.py")
    assert "async def validate_user_exists" not in source
    assert "async def ensure_owner_assignable" not in source

    assert hasattr(assignment, "validate_user_exists")
    assert hasattr(assignment, "ensure_owner_assignable")
```

Add behavior pin in `tests/backend/pytest/api/v1/test_issue_workflow.py` (use `client_factory`). Verify existing 400 (`User {id} not found`), 403 (department mismatch), 409 (archived vendor) cases still pass after the move.

**Expected**: RED.

#### TDD Step 2 — Implement Change

**Commit (a)**: move owner-validation into `assignment.py`, repoint workflow callers, repoint endpoint validation.

**Files to edit**:
- `backend/app/services/_issue_workflow/assignment.py` — append two public coroutines `validate_user_exists` and `ensure_owner_assignable`. Bodies are byte-identical to current `source_validation.py:16-21,24-42`. Preserve imports.
- `backend/app/services/_issue_workflow/source_validation.py:16-21,24-42` — delete the bodies. Update `__all__` at `:122-130` — remove the names.
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change `from app.services._issue_workflow.source_validation import (validate_user_exists, ensure_owner_assignable, ...)` to import these two names from `_issue_workflow.assignment`. Keep other names in source_validation until #28 lands.
- `backend/app/services/_issue_workflow/execution.py:41-47` — same repoint for `validate_user_exists` and `ensure_owner_assignable`. Other names stay until #28.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py:11-37` — replace local `_validate_user_exists` and `_ensure_owner_assignable` bodies with thin re-imports:
  ```python
  from app.services._issue_workflow.assignment import (
      ensure_owner_assignable as _public_ensure_owner_assignable,
      validate_user_exists as _public_validate_user_exists,
  )

  _validate_user_exists = _public_validate_user_exists
  _ensure_owner_assignable = _public_ensure_owner_assignable
  ```
  Final removal of these underscored bindings happens in #30.

**Commit (b)**: shrink/delete `source_validation.py` link/vendor bodies.

**Files to edit (commit b)**:
- `backend/app/services/_issue_workflow/source_validation.py:45-114` — delete `issue_link_department_ids` and `resolve_vendor_department_and_access` bodies. Update `__all__` to drop these names. Recommended end-state: `git rm backend/app/services/_issue_workflow/source_validation.py`.
- `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80` — keep until #28 (commit b deletes only the workflow-side bodies).
- **`tests/backend/pytest/test_architecture_deepening_contracts.py:1193`** — update import tuple if `source_validation` is removed: `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization` (drop `source_validation`).
- **Phase 6 critical**: also edit **`tests/backend/pytest/test_architecture_deepening_contracts.py:1199`** AND **`:1203`** — drop any remaining `source_validation` references in the parallel assertions / hasattr checks. Without these edits, the test file imports a deleted symbol and the entire deepening contract module errors at collection time.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q
```

Pass after commit (a).

#### Lock/TOML/Contract updates (same commit)

- New architecture-lock assertion (Step 1).
- `docs/security/authorization-capability-contract.md:128` and `.json:629` — append `backend/app/services/_issue_workflow/assignment.py` to the `service_policy` enumeration (between `_shared/source.py` and `_issue_register/`). Atomic edit in commit (a).
- 3 lock-test edits at `:1193, :1199, :1203` (commit b).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_issue_workflow/README.md:11` — add `assignment.py - owner-assignment validation (user existence, owner-to-department eligibility)` to Contents (commit a).
- If commit (b) deletes `source_validation.py`, update README to remove the file reference.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.
6. `mypy backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues` — clean.

#### Commit boundary

**2 atomic commits** (per Loop 1 plan):
- Commit (a) title: `B-N2(a): move owner-validation helpers to _issue_workflow/assignment`
- Commit (b) title: `B-N2(b): shrink _issue_workflow/source_validation to source_mutation re-export`

#### Rollback

- Class: **CROSS-DOMAIN** (per `plan-loop-3-03-rollback-register.md:97`).
- Procedure:
  1. **Revert commit (b) FIRST, then commit (a)** if both are merged.
  2. `git revert <commit-b-SHA>` then `git revert <commit-a-SHA>`.
  3. Restore `:1193, :1199, :1203` import lines in `test_architecture_deepening_contracts.py` (re-add `source_validation`).
  4. Drop the new `test_issue_workflow_owner_validation_lives_in_dedicated_module` assertion.
  5. If #28 / #30 already landed downstream, **defer revert** until those are also reverted (per chain `#2 → #8 → #28 → #30`).
- Estimated revert time: 30 min (60 min if #28/#30 landed).

#### Effort & Risk

- Estimated time: 6h (test + 2 commits' implementation + verification).
- Risk: MEDIUM — chain head; partial commit leaves stale imports. Loop 3 risk register flags this as part of the critical-path stall risk (`plan-loop-3-04-risk-register.md:542-554`).
- Mitigations: 2-commit boundary so each step lands GREEN; tests cover all owner-assignment HTTP paths; capability contract updated atomically with code; **Phase 6 correction at `:1199, :1203`** prevents collection-time errors.

---

### Item #51 — #28 — Issue source-mutation triplicate collapse

**Wave**: 5  | **Slot**: v2 Seq 53  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#8 (Seq 52)**. Critical chain link.
**Atomic with**: none (sequential prerequisite for #30).
**Validator?**: yes — capability contract `md:128` and `.json:629` drop `_shared/links.py`.

#### Why this work

Three near-duplicate bodies of `issue_link_department_ids` and `resolve_vendor_department_and_access`:
- canonical at `backend/app/services/_issue_register/source_mutation.py:28-53,56-97`.
- workflow copy at `backend/app/services/_issue_workflow/source_validation.py` (after #8 commit b).
- endpoint copy at `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80`.

Recipe deletes the workflow + endpoint copies, repoints callers at the canonical `_issue_register/source_mutation.py` bodies, deletes endpoint `_shared/links.py`. Audit ID = #28 (S4.3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 53 (`plan-loop-3-07-integration-v2.md:396`).
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_issue_workflow_owner_validation_lives_in_dedicated_module -q` (#8 lock test must pass).
- [ ] Read latest state of `backend/app/services/_issue_register/source_mutation.py`, `_issue_workflow/source_validation.py` (after #8), `_issue_workflow/update_plans.py`, `backend/app/api/v1/endpoints/issues/_shared/links.py`, `_shared/__init__.py`, `endpoints/issues/links.py`.
- [ ] Confirm canonical bodies in `_issue_register/source_mutation.py:28-53` (`resolve_vendor_department_and_access`) and `:56-97` (`issue_link_department_ids`) intact.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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

**Expected**: RED on Tests 1-2.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_workflow/update_plans.py:9-14` — change imports so `issue_link_department_ids` is imported from `app.services._issue_register.source_mutation` (alongside the three names already imported there). Drop the `_issue_workflow.source_validation` import for `issue_link_department_ids`.
- `backend/app/api/v1/endpoints/issues/links.py:13-19` — replace `_resolve_vendor_department_and_access` with `from app.services._issue_register.source_mutation import resolve_vendor_department_and_access` (drop underscore prefix); rename call site at `:68`.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:10,57,66` — drop `_issue_link_department_ids` and `_resolve_vendor_department_and_access` from import block and `__all__` (overlaps with #30; in-scope edit here is just the link-helper rows).

**Files to delete**:
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (entire file `:1-81`).
- If `backend/app/services/_issue_workflow/source_validation.py` is empty after removing `issue_link_department_ids` and `resolve_vendor_department_and_access`, `git rm` it (commit b of #8 may already do this; coordinate to avoid double-edit).

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- New structural lock from Step 1.
- Capability contract `docs/security/authorization-capability-contract.md:128` and `.json:629` — drop `backend/app/api/v1/endpoints/issues/_shared/links.py` from `service_policy` enumeration. Confirm `backend/app/services/_issue_register/` token remains. Atomic edit.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md:12` — strike `links.py` from Contents list.
- `backend/app/services/_issue_register/README.md` — append a Contents bullet: `- source_mutation.py - canonical owner of vendor/department resolution and IssueLink department aggregation`.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_link_helpers_have_one_canonical_home_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues backend/app/services` — clean.
7. `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_register backend/app/services/_issue_workflow` — clean.

#### Commit boundary

Single commit titled: `S4.3: collapse triplicate source-mutation helpers into _issue_register/source_mutation`.

#### Rollback

- Class: **CROSS-DOMAIN** (#8 prereq, #30 dependent) per `plan-loop-3-03-rollback-register.md:329`.
- Procedure:
  1. **Revert #30 first** if it landed.
  2. `git revert <SHA>` to restore the triplicate.
  3. Drop the new lock test.
  4. Restore `_issue_register/README.md` Contents bullet.
  5. Restore capability contract `_shared/links.py` token at `.md:128` and `.json:629`.
  6. Run validator — exit 0 required.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (chain-coordination, contract atomic edit, file delete, repoint).
- Risk: MEDIUM — chain item; partial revert leaves duplicate helpers + stale lock. Per `plan-loop-3-04-risk-register.md:542-554`, the `#2 → #8 → #28 → #30` chain is the longest critical path.
- Mitigations: structural lock catches re-introduction; capability validator pins service_policy enumeration; #30 follows in next slot to clean the now-dead barrel entries.

---

### Item #52 — #30 — `issues/_shared/__init__.py` underscore re-export pruning

**Wave**: 5  | **Slot**: v2 Seq 54  | **Effort**: M (~6h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: **#14 (Seq 12, Wave 2), #27 (Seq 51, Wave 5), #28 (Seq 53, Wave 5)**. Terminal node of `#2 → #8 → #28 → #30` chain.
**Atomic with**: none.
**Validator?**: yes — capability contract may need updates if `_shared/serialization.py` is deleted.

#### Why this work

`backend/app/api/v1/endpoints/issues/_shared/__init__.py` carries 36 entries / 13 public / 23 underscored. Phase 4 corrected counts: **14 prunable + 9 to re-point**. The 2 `_notify_*` test imports go through SUBMODULE (`from ...notifications import ...`), NOT through the barrel — so #30 alone does not break the test, but #14 must have already removed the underlying functions. Audit ID = #30 (S4.10); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 54 (`plan-loop-3-07-integration-v2.md:397`).
- [ ] Confirm prerequisites complete: #14, #27, #28 architecture locks all GREEN.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/__init__.py`, all 5 endpoint consumer files (`crud/{contextual,create,detail}.py`, `links.py`, plus `crud/list.py` if any underscore imports remain).
- [ ] Run grep for the 23 underscored names against `backend/app/api/v1/endpoints/issues/` — confirm only 5 remaining files import them.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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

**Expected**: RED — `__all__` currently lists 23 underscored names (`:51-73`).

#### TDD Step 2 — Implement Change

**Per-name disposition** (Phase 4 corrected ledger of 36 = 13 public + 23 underscored = 14 prunable + 9 to re-point):

**Drop (14 underscored, no live external consumer after #14/#27/#28)** — remove from `__all__` and import block:
1. `_active_exception` (`:19, :51`).
2. `_get_active_user_with_permissions` (`:13, :53`) — drop unless `notifications.py` retains it.
3. `_issue_link_department_ids` (`:10, :57`) — body deleted by #28.
4. `_label_or_fallback` (`:21, :59`).
5. `_link_display` (`:22, :60`).
6. `_notify_exception_approved` (`:14, :62`) — body deleted by #14.
7. `_notify_exception_requested` (`:15, :63`) — body deleted by #14.
8. `_notify_issue_assigned` (`:16, :64`) — body deleted by #14.
9. `_resolve_user_name` (`:24, :65`).
10. `_serialize_exception` (`:25, :67`).
11. `_serialize_exception_with_user_names` (`:26, :68`).
12. `_serialize_issue_read` (`:28, :70`).
13. `_serialize_issue_summary` (`:29, :71`).
14. `_serialize_remediation` (`:30, :72`).

**Re-point (9 with live external consumers)** — repoint consumers, then remove from barrel:
15. `_ensure_owner_assignable` — consumers `crud/create.py:20,51`, `crud/contextual.py:19,41`. Repoint to `from app.services._issue_workflow.assignment import ensure_owner_assignable`; rename call sites.
16. `_validate_user_exists` — consumers `crud/create.py:22,50`, `crud/contextual.py:21,40`. Repoint to `from app.services._issue_workflow.assignment import validate_user_exists`; rename call sites.
17. `_get_issue_with_relations` — already deleted by #27; consumers already repointed.
18. `_get_readable_issue_or_404` — already deleted by #27; consumers already repointed.
19. `_get_writable_issue_or_404` — already deleted by #27; consumers already repointed.
20. `_resolve_vendor_department_and_access` — already deleted by #28; consumers already repointed.
21. `_issue_source_link` — consumer `links.py:15,134`. Recommended: `from app.services._issue_register.linked_context import issue_source_link` and rename call site.
22. `_link_matches_issue_source` — consumer `links.py:16,135`. Same pattern.
23. `_serialize_issue_link` — consumer `links.py:18,101,118`. Promote `_serialize_issue_link` to public `serialize_issue_link` in `_issue_register/serialization.py` and import the public name.

**Keep public (13)** — leave intact in `__all__`: `UNKNOWN_CONTROL_LABEL`, `UNKNOWN_DEPARTMENT_LABEL`, `UNKNOWN_EXECUTION_LABEL`, `UNKNOWN_KRI_LABEL`, `UNKNOWN_RISK_LABEL`, `UNKNOWN_USER_LABEL`, `UNKNOWN_VENDOR_LABEL`, `ResolvedIssueSource`, `build_issue_linked_visibility`, `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_contextual_issue_source`, `resolve_issue_source_metadata`.

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py` — full rewrite per the disposition table above. Final `__all__` = 13 items.
- `backend/app/api/v1/endpoints/issues/crud/create.py:20-22,50-51` — repoint to `_issue_workflow.assignment`; drop underscores at call sites.
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:19-21,40-41` — same pattern.
- `backend/app/api/v1/endpoints/issues/links.py:13-19,68,80,101,118,128,134-135` — repoint each remaining underscore name; rename call sites.
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` — delete the file if all consumers now import directly from `_issue_workflow.assignment` (recommended).
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` — drop underscored re-exports; if all consumers reach `_issue_register` directly, the file shrinks or is deleted.

**Files to delete (recommended)**:
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` (now empty after #8 + #30).
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` (if no surviving consumers).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q
```

Pass.

#### Lock/TOML/Contract updates (same commit)

- Structural lock from Step 1.
- Capability contract `md:128` and `.json:629` — confirm `_shared/source.py` and `_shared/serialization.py` still exist; if deleted, drop the citation atomically.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md` — refresh Contents.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_shared_barrel_has_no_underscored_reexports_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/issues` — clean.
7. `mypy backend/app/api/v1/endpoints/issues` — clean.

#### Commit boundary

Single commit titled: `S4.10: prune issues/_shared barrel underscored re-exports; rename survivors to public`.

#### Rollback

- Class: **CROSS-DOMAIN** (multi-prereq) per `plan-loop-3-03-rollback-register.md:352`.
- Procedure:
  1. `git revert <SHA>` to restore pruned underscored re-exports.
  2. Drop the new lock test.
  3. Restore `_shared/README.md` Contents block.
  4. Restore deleted `_shared/{validation,serialization}.py` if their bodies were removed.
  5. Allowlist update if applicable.
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (5 endpoint files × repoint + barrel + lock + README + capability contract).
- Risk: MEDIUM — broad consumer surface; partial revert breaks imports across issue endpoints.
- Mitigations: structural lock + per-name guard list catches re-introduction; consumer count verified via grep before commit.

---

### Item #53 — #16 — Remove reports legacy-excel tombstones (410s)

**Wave**: 5  | **Slot**: v2 Seq 55  | **Effort**: M (~2h)  | **Priority**: P2  | **Domain**: vendor (reports)

**Dependencies**: none.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

Four tombstone routes in `backend/app/api/v1/endpoints/reports/`:
- `legacy_excel.py:14` `@router.get("/controls/excel")`.
- `legacy_excel.py:23` `@router.get("/risks/excel")`.
- `summary_excel.py:97` `@router.get("/summary/excel")`.
- `audit_trail_excel.py:133` `@router.get("/audit-trail/excel")`.

KEEP LIVE the `xlsx`-rejection at:
- `audit_trail_excel.py:142` `@router.get("/audit-trail/export")` — calls `resolve_export_format(format, ...)` which raises `excel_export_removed` if `format == "xlsx"`.
- `summary_excel.py:106` `@router.get("/summary/export")` — same shape.

Audit ID = #16 (S8.10); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 55 (`plan-loop-3-07-integration-v2.md:398`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/reports/legacy_excel.py`, `summary_excel.py:97-103`, `audit_trail_excel.py:133-139`, `__init__.py:11,16`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py`

```python
"""RED: 4 legacy /excel tombstones removed; /export?format=xlsx rejection preserved."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_excel_tombstones_return_404(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/controls/excel",
            "/api/v1/reports/risks/excel",
            "/api/v1/reports/summary/excel",
            "/api/v1/reports/audit-trail/excel",
        ):
            response = await client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_export_xlsx_format_still_rejected(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/audit-trail/export?format=xlsx",
            "/api/v1/reports/summary/export?format=xlsx",
        ):
            response = await client.get(path)
            assert response.status_code == 410
            assert response.json()["detail"]["code"] == "excel_export_removed"
```

**Expected**: RED — tombstone routes still return 410 (or whatever they return today).

#### TDD Step 2 — Implement Change

**Files to delete**:
- `backend/app/api/v1/endpoints/reports/legacy_excel.py` (entire file: 30 lines).

**Files to edit**:
- `backend/app/api/v1/endpoints/reports/__init__.py:11,16` — DELETE `legacy_router` import + `include_router` line.
- `backend/app/api/v1/endpoints/reports/summary_excel.py:97-103` — DELETE the `download_summary_excel` function (7 lines incl. decorator).
- `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133-139` — DELETE the `download_audit_trail_excel` function.
- `tests/backend/pytest/test_protocol_contract_probe.py:26,108` — drop `/api/v1/reports/controls/excel` from probe path list; response excerpt expectation moves to `/api/v1/reports/controls/export?format=xlsx`.
- `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — drop the four `/excel` paths from OpenAPI parity list (keep `/export` paths).
- `tests/backend/pytest/test_reports_rbac.py:193,369,379,391` — repoint each `/api/v1/reports/<x>/excel` GET to `/api/v1/reports/<x>/export?format=xlsx`. Status code stays 410, `detail.code` stays `excel_export_removed`.
- `tests/backend/pytest/api/v1/test_reports_audit.py:274` — repoint `/api/v1/reports/audit-trail/excel` to `/api/v1/reports/audit-trail/export?format=xlsx`.
- `tests/backend/pytest/test_vendor_reports.py:53,57` — already exercises `/vendor-reports/<x>?format=xlsx`; no edit (different routes).

**Files to create**: the new RED test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py -x
```

Pass (404 for tombstones, 410 for `/export?format=xlsx`).

#### Lock/TOML/Contract updates (same commit)

- `backend/app/api/v1/endpoints/reports/__init__.py` — `legacy_router` removed (1 import + 1 include_router).
- No allowlist toml entries.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/reports/README.md` — strike `legacy_excel.py` row from route inventory.
- `docs/BUSINESS_LOGIC.md:758` — verify "format = csv (xlsx returns 410 excel_export_removed)" remains accurate.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py -x` — must pass.
2. `pytest tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/test_openapi_contract_parity.py tests/backend/pytest/test_reports_rbac.py tests/backend/pytest/api/v1/test_reports_audit.py -x` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `refactor(reports): remove 4 excel tombstones; preserve xlsx rejection on /export`.

#### Rollback

- Class: **TRIVIAL** (no data, no schema; FE never called these — they 410'd anyway).
- Procedure:
  1. `git revert <SHA>` — restores routes.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (test repointing is the bulk).
- Risk: LOW — no consumer surface (routes 410'd already).
- Mitigations: behavioural test pins both 404 (tombstones) and 410 (`/export?format=xlsx`); existing OpenAPI/RBAC suites updated atomically.

---

### Item #54 — #38 — Move 8 inline endpoint Pydantic models to schemas

**Wave**: 5  | **Slot**: v2 Seq 56  | **Effort**: M (~4h)  | **Priority**: P2  | **Domain**: endpoints

**Dependencies**: **#10 (Seq 4, Wave 1)** — presence-lock guarantees `riskhub_questionnaires.py` isn't deleted; FE Zod mirror bundled per Correction G.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

8 inline models confirmed at:
- `health.py:16` `class LivenessResponse(BaseModel):`.
- `health.py:22` `class ReadinessResponse(BaseModel):`.
- `health.py:32` `class HealthResponse(ReadinessResponse):`.
- `preferences.py:15` `class PreferencesUpdate(BaseModel):`.
- `preferences.py:36` `class PreferencesResponse(BaseModel):`.
- `riskhub_questionnaires.py:17` `class RiskFilters(BaseModel):`.
- `riskhub_questionnaires.py:24` `class BatchSendRequest(BaseModel):`.
- `riskhub_questionnaires.py:30` `class BatchSendResponse(BaseModel):`.

**Phase 4 correction**: rename `RiskFilters` → `BatchSendRiskFilters` to avoid future collision (per `verify-loop-b-07-endpoints.md:42-49,156-157`). Audit ID = #38 (S8.6); developer verdict = ACCEPT (P2).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 56 (`plan-loop-3-07-integration-v2.md:399`).
- [ ] Confirm prerequisites complete: #10 lock GREEN.
- [ ] Read latest state of the 3 endpoint files: `health.py:16-35`, `preferences.py:15-40`, `riskhub_questionnaires.py:17-34,37-42`.
- [ ] Verify no `from app.api.v1.endpoints.riskhub_questionnaires import RiskFilters` consumer exists in repo.
- [ ] Verify FE Zod mirrors at `frontend/src/services/api/schemas/riskHub.ts` field names unchanged.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`

```python
"""Lock that endpoint modules import schemas, not define them inline."""
from __future__ import annotations
import ast
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

EVICTED_FROM_HEALTH = {
    "LivenessResponse",
    "ReadinessResponse",
    "HealthResponse",
}
EVICTED_FROM_PREFERENCES = {
    "PreferencesUpdate",
    "PreferencesResponse",
}
EVICTED_FROM_RISKHUB_Q = {
    "BatchSendRiskFilters",
    "BatchSendRequest",
    "BatchSendResponse",
}


def _module_classnames(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef)
    }


def test_health_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/health.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_HEALTH)


def test_preferences_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/preferences.py"
    assert _module_classnames(path).isdisjoint(EVICTED_FROM_PREFERENCES)


def test_riskhub_questionnaires_endpoint_does_not_define_evicted_classes() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
    assert _module_classnames(path).isdisjoint(
        EVICTED_FROM_RISKHUB_Q | {"RiskFilters"}
    )


def test_schema_modules_export_evicted_classes() -> None:
    health_schema = importlib.import_module("app.schemas.health")
    preferences_schema = importlib.import_module("app.schemas.preferences")
    riskhub_schema = importlib.import_module("app.schemas.riskhub")
    for name in EVICTED_FROM_HEALTH:
        assert hasattr(health_schema, name)
    for name in EVICTED_FROM_PREFERENCES:
        assert hasattr(preferences_schema, name)
    for name in EVICTED_FROM_RISKHUB_Q:
        assert hasattr(riskhub_schema, name)
```

**Expected**: RED on all four assertions (classes still inline; new schema modules don't exist; `RiskFilters` not yet renamed).

#### TDD Step 2 — Implement Change

**Files to create**:
1. `backend/app/schemas/health.py`:
   ```python
   """Health/readiness/liveness response schemas."""
   from __future__ import annotations
   from typing import Literal
   from pydantic import BaseModel


   class LivenessResponse(BaseModel):
       status: Literal["alive"]


   class ReadinessResponse(BaseModel):
       ready: bool
       database: Literal["connected", "disconnected"]
       redis: Literal["connected", "disconnected", "disabled"]
       scheduler_role: Literal["disabled", "leader", "follower"]
       scheduler_status: Literal["disabled", "leader_running", "follower_ready", "error"]


   class HealthResponse(ReadinessResponse):
       status: Literal["healthy", "degraded"]
   ```

2. `backend/app/schemas/preferences.py`:
   ```python
   """User preferences request/response schemas."""
   from __future__ import annotations
   from pydantic import BaseModel, field_validator


   class PreferencesUpdate(BaseModel):
       theme: str | None = None
       language: str | None = None

       @field_validator("theme")
       @classmethod
       def validate_theme(cls, v: str | None) -> str | None:
           if v is not None and v not in ("light", "dark", "riskhub"):
               raise ValueError("Invalid theme. Must be one of: light, dark, riskhub")
           return v

       @field_validator("language")
       @classmethod
       def validate_language(cls, v: str | None) -> str | None:
           if v is not None and v not in ("en", "cs"):
               raise ValueError("Invalid language. Must be one of: en, cs")
           return v


   class PreferencesResponse(BaseModel):
       theme: str
       language: str
   ```

3. Append to `backend/app/schemas/riskhub.py`:
   ```python
   # ============================================================================
   # Risk Hub Questionnaire Batch-Send Schemas
   # ============================================================================


   class BatchSendRiskFilters(BaseModel):
       """Filter criteria for batch questionnaire send (renamed from RiskFilters)."""
       department_id: int | None = None
       process: str | None = None
       category: str | None = None
       status: str | None = None


   class BatchSendRequest(BaseModel):
       select_all: bool
       risk_ids: list[int] | None = None
       filters: BatchSendRiskFilters | None = None


   class BatchSendResponse(BaseModel):
       created_count: int
       skipped_no_owner: list[int]
       skipped_open_exists: list[int]
       errors: list[str]
   ```

**Files to edit**:
- `backend/app/api/v1/endpoints/health.py:16-35` — delete inline classes; add `from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse`. Drop unused `pydantic.BaseModel` and `Literal` imports.
- `backend/app/api/v1/endpoints/preferences.py:15-40` — delete inline classes; add `from app.schemas.preferences import PreferencesResponse, PreferencesUpdate`. Drop unused imports.
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:17-34` — delete inline classes; add `from app.schemas.riskhub import BatchSendRequest, BatchSendResponse, BatchSendRiskFilters`. Drop `from pydantic import BaseModel` import. Internal references at `:39, :42` (`payload: BatchSendRequest`, `response_model=BatchSendResponse`) already use the names; ensure import resolves.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q
pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py tests/backend/pytest/test_health.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- Frontend Zod mirrors at `frontend/src/services/api/schemas/riskHub.ts` (e.g. `batchSendQuestionnairesResponseSchema`) — verify field names unchanged (only the class identifier moves; wire payload identical).
- No TOML edits.

#### README / doc updates (same commit)

- None required (mechanical move).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q` — behavioral parity.
3. `pytest tests/backend/pytest/test_health.py -q` — must pass.
4. `cd frontend && npx tsc --noEmit` — Zod mirror sanity.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `S8.6: move 8 inline endpoint Pydantic models to schemas (rename RiskFilters → BatchSendRiskFilters)`. (Optional 3-commit split per endpoint module if review pressure favors smaller diffs.)

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores inline classes; schemas can stay as orphan files (harmless) or full revert.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 4h (3 schema files + 3 endpoint edits + test + verification).
- Risk: LOW — pure mechanical move; FE Zod mirrors verify field-name parity.
- Mitigations: structural lock catches re-introduction; OpenAPI parity preserved (only class moved); rename collision resolved.

---

### Item #55 — #31 — Extract vendor reporting row formatters

**Wave**: 5  | **Slot**: v2 Seq 57  | **Effort**: M (~1.5h)  | **Priority**: P3  | **Domain**: vendor

**Dependencies**: none.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

`backend/app/api/v1/endpoints/vendor_reports.py:36-119` carries `_annual_report_rows` (`:36-73`) and `_dora_register_rows` (`:76-119`) — pure pure-data row formatters with no FastAPI/DB coupling. Recipe moves them into `backend/app/services/_vendor_governance/reports.py:7` (stub already exists at the destination; `VendorReportDefinition` lives there). The endpoint then imports `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows` (rename drops leading underscore — they become public package-internal names since used by sibling endpoint module). Audit ID = #31 (S5.5); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 57 (`plan-loop-3-07-integration-v2.md:400`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/vendor_reports.py:36-119, :146, :170`, `backend/app/services/_vendor_governance/reports.py:1-12` (stub).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py`

```python
"""RED: row formatters live in _vendor_governance.reports, not in the endpoint."""
import inspect
import pytest

pytestmark = pytest.mark.contract


def test_annual_report_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    assert callable(annual_report_rows)


def test_dora_register_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import dora_register_rows
    assert callable(dora_register_rows)


def test_endpoint_does_not_redefine_row_formatters() -> None:
    from app.api.v1.endpoints import vendor_reports as ep
    src = inspect.getsource(ep)
    assert "def _annual_report_rows" not in src
    assert "def _dora_register_rows" not in src
    assert "from app.services._vendor_governance.reports import" in src


def test_annual_headers_preserved() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    sig = inspect.signature(annual_report_rows)
    assert list(sig.parameters) == ["report"]
```

**Expected**: RED — formatters still in endpoint.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_vendor_governance/reports.py` — append after the existing `VendorReportDefinition`:
  ```python
  def annual_report_rows(report) -> tuple[list[str], list[list[object]]]:
      headers = [
          "Vendor ID", "Name", "Legal Name", "Vendor Type", "Department",
          "Owner", "Process", "Subprocess", "Supports Core Function",
          "DORA Relevant", "Significant Vendor", "Risk Score (1-5)",
          "Report Year", "Generated At",
      ]
      rows: list[list[object]] = []
      for vendor in report.vendors:
          rows.append(
              [
                  vendor.vendor_id, vendor.name, vendor.legal_name or "",
                  vendor.vendor_type, vendor.department_name or "",
                  vendor.outsourcing_owner_name or "", vendor.process,
                  vendor.subprocess or "",
                  bool(vendor.supports_important_core_insurance_function),
                  bool(vendor.dora_relevant), bool(vendor.is_significant_vendor),
                  vendor.risk_score_1_5, report.process_evaluation.year,
                  report.generated_at.isoformat(),
              ]
          )
      return headers, rows


  def dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:
      headers = [
          "vendor_id", "name", "legal_name", "registration_id", "vendor_type",
          "dora_relevant", "is_significant_vendor",
          "supports_important_core_insurance_function", "risk_score_1_5",
          "outsourcing_owner_user_id", "outsourcing_owner_name",
          "department_id", "department_name", "process", "subprocess",
          "replaceability", "has_alternative_providers",
      ]
      data_rows: list[list[object]] = []
      for row in rows:
          data_rows.append(
              [
                  row.vendor_id, row.name, row.legal_name or "",
                  row.registration_id or "", row.vendor_type,
                  bool(row.dora_relevant), bool(row.is_significant_vendor),
                  bool(row.supports_important_core_insurance_function),
                  row.risk_score_1_5, row.outsourcing_owner_user_id or "",
                  row.outsourcing_owner_name or "", row.department_id or "",
                  row.department_name or "", row.process, row.subprocess or "",
                  row.replaceability or "", bool(row.has_alternative_providers),
              ]
          )
      return headers, data_rows
  ```
- `backend/app/api/v1/endpoints/vendor_reports.py`:
  - `:36-119` — DELETE both `_annual_report_rows` and `_dora_register_rows` definitions.
  - After `:26` imports add: `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows`.
  - `:146` — change `_annual_report_rows(report)` to `annual_report_rows(report)`.
  - `:170` — change `_dora_register_rows(rows)` to `dora_register_rows(rows)`.

**Files to create**: the new lock test above.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py -q
pytest tests/backend/pytest/test_vendor_reports.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New lock test above.
- No TOML edits.

#### README / doc updates (same commit)

- `backend/app/services/_vendor_governance/__init__.py` — if file currently re-exports `VendorReportDefinition` only, add the two new function names. Verify by reading file.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_vendor_reports.py -q` — must pass.
3. `ruff check backend tests` — clean.
4. `mypy backend/app` — clean.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `refactor(vendor-reports): extract row formatters to _vendor_governance.reports`.

#### Rollback

- Class: **LOCK-RATCHET** (code-shape-only).
- Procedure:
  1. `git revert <SHA>` — restores endpoint definitions and reverts service-side appends.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 1.5h (move + rename + endpoint edits + test).
- Risk: LOW — pure pure-data formatters; no FastAPI/DB coupling.
- Mitigations: lock test pins canonical home + signature; behavior pinned by existing `test_vendor_reports.py`.

---

### Item #56 — #43 — Audit adapter-emitter helper (additive)

**Wave**: 5  | **Slot**: v2 Seq 59  | **Effort**: M (~6h)  | **Priority**: P3  | **Domain**: endpoints (audit)

**Dependencies**: none.
**Atomic with**: none. Cross-domain item (audit adapter — used by 6 audit modules).
**Validator?**: no.

#### Why this work

`backend/app/core/audit/_audit_matrix.toml` declares **37 adapter rows** (Phase 4 verified count). Each row maps a `(module, function)` pair to one of the 6 audit modules: `risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`. Recipe adds an additive `emit_adapter(...)` helper at `backend/app/core/audit/_emit.py` that wraps the existing `log_activity` call boilerplate. **Phase 6 corrections**:
- The new RED test must AST-parse `emit_adapter` calls and assert `safe_entity_label` keyword present.
- The lock cite is `test_w7_audit_adapter_completeness_red.py:33-39` (lines 33-39, NOT just `:13`).

Helper MUST be additive: every named function (`control_created`, `issue_assigned`, etc.) MUST remain at module scope. Helper is invoked INSIDE each existing `def`, never as a replacement for it. Audit ID = #43 (BE-N4); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 59 (`plan-loop-3-07-integration-v2.md:402`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/core/audit/_audit_matrix.toml`, `backend/app/core/audit/{risk,control,kri,issue,approval,vendor}.py`.
- [ ] Run `python3 -c "import tomllib; print(len(tomllib.load(open('backend/app/core/audit/_audit_matrix.toml','rb'))['adapter']))"` — confirm 37.
- [ ] Read `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:33-39` and `test_w7_audit_safe_entity_label_red.py` (the two existing locks).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

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


def test_emit_adapter_calls_carry_safe_entity_label_kwarg() -> None:
    """Phase 6 critical: AST-parse each emit_adapter call; assert safe_entity_label kw is present."""
    offenders: list[str] = []
    for entry in _load_matrix():
        module_path = AUDIT_ROOT / f"{entry['module']}.py"
        if not module_path.exists():
            continue
        tree = ast.parse(module_path.read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "emit_adapter"
            ):
                kw_names = {kw.arg for kw in (node.keywords or []) if kw.arg}
                if "safe_entity_label" not in kw_names:
                    offenders.append(
                        f"{entry['module']}:{node.lineno} (missing safe_entity_label kw)"
                    )
    assert offenders == [], f"emit_adapter call without safe_entity_label: {offenders}"
```

> **Phase 6 correction**: cite `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:33-39` as the lines that require a `def` per row at module level — those lines are the upstream invariant the new helper MUST preserve.

Add a behavior pin in `tests/backend/pytest/test_w7_audit_*` family for one canonical adapter (e.g. `control_created`).

**Expected**: RED — helper does not exist; no row uses `emit_adapter`.

#### TDD Step 2 — Implement Change

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
- For each of the 37 `(module, function)` rows, replace the `await log_activity_func(db, entity_type=..., ...)` body with `await emit_adapter(db, entity_type=..., ...)`.
- Add `from app.core.audit._emit import emit_adapter` at the top of each module.
- **CRITICAL**: each `def`/`async def` MUST stay at module scope with name and signature unchanged. The helper invocation lives INSIDE the function body. Example:
  ```python
  # BEFORE (lines 23-39 in audit/control.py):
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

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q
pytest tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py tests/backend/pytest/architecture/test_w7_audit_safe_entity_label_red.py -q
```

All pass; existing locks remain GREEN (no regression).

#### Lock/TOML/Contract updates (same commit)

- New `test_audit_adapter_emitter_helper_red.py`.
- `_audit_matrix.toml` rows do NOT change.
- Existing locks `test_w7_audit_adapter_completeness_red.py:33-39` and `test_w7_audit_safe_entity_label_red.py` MUST remain GREEN — verify after each module edit.
- No capability-contract change.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- Optional: add a line in `backend/app/core/audit/__init__.py` docstring or create a small `backend/app/core/audit/README.md` noting that `_emit.py` owns the adapter-emit boilerplate.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py tests/backend/pytest/architecture/test_w7_audit_safe_entity_label_red.py -q` — must remain GREEN.
3. `pytest tests/backend/pytest -q -k "audit or test_w7"` — broad audit suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/core/audit` — clean.
6. `mypy backend/app/core/audit` — clean.

#### Commit boundary

ONE commit titled: `BE-N4: extract audit adapter emit helper (additive)`. Alternative: 2-3 commits split by adapter module if individual diffs exceed ~150 LOC.

#### Rollback

- Class: **LOCK-RATCHET** (per `plan-loop-3-03-rollback-register.md:508`).
- Procedure:
  1. `git revert <SHA>` to inline helper invocations back into the 6 audit modules.
  2. Delete `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`.
  3. Verify W7 audit-adapter completeness lock still GREEN (matrix rows untouched).
- Estimated revert time: 30 min.

#### Effort & Risk

- Estimated time: 6h (helper module + 37 row rewrites + 1 architecture test + 1 behavior test + verification).
- Risk: MEDIUM — broad surface (37 rows × 6 modules); per-module diff can be large.
- Mitigations: helper preserves all keyword args including `safe_entity_label`; AST-parse RED test enforces `safe_entity_label=` kwarg presence; existing W7 locks remain in force; if per-row diff exceeds ~150 LOC, split into 2-3 commits by module family.

---

### Item #57 — #44 — Centralize guarded path-prefix registry

**Wave**: 5  | **Slot**: v2 Seq 60  | **Effort**: M (~5h)  | **Priority**: P3  | **Domain**: endpoints (router)

**Dependencies**: none. Must not weaken `tests/backend/pytest/architecture/test_w3_gate_snapshot.py`.
**Atomic with**: none.
**Validator?**: no.

#### Why this work

**Phase 4 verified count: 27 `include_router` calls** at `backend/app/api/v1/router.py:34-60`. **`risk_questionnaires` is registered TWICE** at `:44` (`.risk_router` under `/questionnaires` tag) and `:60` (`.router` under `/questionnaires` tag) — registry **must support `dual_router = true`** for that module. Phase 5 ships **registry + lock first**; refactor of `router.py` to read the registry and emit `include_router` calls in a loop is deferred to a follow-up commit.

**Phase 6 minor prose fix**: at recipe-03 line 926, the prior text said "`/risks tag`" — the corrected text is "`/questionnaires tag`" for both registrations. Audit ID = #44 (BE-N6); developer verdict = ACCEPT (P3).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 60 (`plan-loop-3-07-integration-v2.md:403`).
- [ ] Confirm prerequisites: none.
- [ ] Read latest state of `backend/app/api/v1/router.py:34-60` — confirm 27 `include_router` calls.
- [ ] Confirm `risk_questionnaires` registered twice at `:44, :60` (both under `/questionnaires` tag per Phase 6 prose fix).
- [ ] Read `tests/backend/pytest/architecture/test_w3_gate_snapshot.py` (must not be weakened).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file** (new): `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`

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
    actual: set[tuple[str, tuple[str, ...]]] = set()
    for route in api_router.routes:
        path = getattr(route, "path", "")
        tags = tuple(sorted(getattr(route, "tags", []) or []))
        prefix = "/" + path.lstrip("/").split("/", 1)[0] if path != "/" else ""
        actual.add((prefix, tags))
    declared: set[tuple[str, tuple[str, ...]]] = set()
    for entry in registry.get("modules", []):
        declared.add((entry["prefix"], tuple(sorted(entry["tags"]))))
        if entry.get("dual_router"):
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

**Expected**: RED — registry file does not exist.

#### TDD Step 2 — Implement Change

**Files to create**:
- `backend/app/api/v1/_router_registry.toml` — **25 logical entries covering all 27 `include_router` calls** (24 single-router + 1 dual = 25 logical, but 27 mounted routers because the dual contributes 2). Each entry declares `module`, `prefix` (or `prefix_owner = "module" | "aggregator"`), `tags`, and optional `dual_router = true` with a `dual_routes` array. **Per Phase 6 prose fix**, both `dual_routes` entries for `risk_questionnaires` declare `tags = ["questionnaires"]`:
  ```toml
  # backend/app/api/v1/_router_registry.toml
  # Lock for BE-N6: enumerates every include_router call in app/api/v1/router.py.

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
  prefix_owner = "module"
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

  # DUAL-ROUTER: risk_questionnaires registers BOTH .risk_router AND .router; both under /questionnaires tag (Phase 6 prose fix).
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
- The new lock test above.

(Refactor `router.py` to a registry-driven loop is a follow-up commit; Phase 5 ships TOML + parity test only — Loop 1 explicit deferral.)

**Files to edit**: none (the registry is additive metadata).

**Files to delete**: none.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_router_prefix_registry_red.py -q
pytest tests/backend/pytest/architecture/test_w3_gate_snapshot.py -q
```

All pass.

#### Lock/TOML/Contract updates (same commit)

- New TOML registry under `backend/app/api/v1/_router_registry.toml` (the lock target).
- New architecture test above.

#### README / doc updates (same commit)

- Add an "Endpoint registry" subsection in `backend/app/api/v1/endpoints/README.md` referencing the new TOML and the lock test.

#### Verification commands (run all in order)

1. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_router_prefix_registry_red.py` — must pass.
2. `cd backend && ./venv/bin/pytest -q tests/backend/pytest/architecture/test_w3_gate_snapshot.py` — must remain GREEN.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

ONE commit titled: `feat(api): centralize guarded path-prefix registry`. RED test + TOML registry + README subsection in same commit.

#### Rollback

- Class: **TRIVIAL** (additive metadata + parity test).
- Procedure:
  1. `git revert <SHA>` — removes both. No production-routing change.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 5h (registry authoring + parity test + verification + reviewer alignment).
- Risk: LOW — additive only; no production-routing change.
- Mitigations: parity test catches drift; refactor of `router.py` to registry-driven loop deferred to a follow-up commit; `test_w3_gate_snapshot.py` (4 `(method, path) → capability` mappings) remains GREEN.

---

End of Section 4 — Per-Item Recipes (Items 27-57, Waves 4-5) — final, Phase 6 corrections applied.
