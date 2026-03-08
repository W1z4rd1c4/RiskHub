# Production Code Quality Review — 2026-03-08

## Scope

Post-implementation review loop for the vendor detail IA consolidation and the
adjacent/shared cleanup required to bring the branch back to a green verified
state.

Reviewed surfaces:

- vendor detail merged IA and page-local modules
- vendor SLA vendor-detail E2E coverage
- vendor user/testing docs
- surfaced frontend type/build blockers
- canonical structure docs used by topology guards

## Findings

### 1. Dead vendor detail component

- `frontend/src/pages/vendors/VendorSummaryCards.tsx` was no longer referenced
  after overview ownership moved into `VendorOverviewTab.tsx`.
- Risk:
  - misleading page-local module inventory
  - unnecessary maintenance surface

Resolution:

- removed the file
- removed it from `frontend/src/pages/vendors/README.md`

### 2. Vendor SLA E2E race across Playwright projects

- `tests/frontend/e2e/permissions/vendor-slas-crud.spec.ts` shared one archived
  SLA fixture across Chromium, Firefox, WebKit, and CI projects.
- The spec mutated archive state in `beforeEach`, so projects raced each other
  and produced false failures.

Resolution:

- switched the spec to project-scoped archived SLA metric names
- added create-if-missing behavior in the helper before toggling archive state
- preserved the same user-facing assertions and vendor-detail coverage

### 3. Vendor docs drift after the 5-tab merge

- `docs/user/vendors.md` and `docs/user-cs/vendors.md` still described the old
  tab taxonomy and old deep-link shape such as `?tab=sla`.

Resolution:

- updated both manuals to describe the 5 merged tabs
- clarified canonical deep links as `tab + section`

### 4. Frontend build blockers surfaced by the review loop

- `frontend/src/pages/KRIsPage.tsx` built an export-filter object that no longer
  satisfied the stricter `KRIExportFilters` union.
- `frontend/src/services/executionApi.ts` and `frontend/src/types/control.ts`
  carried unused type imports that blocked `tsc -b`.

Resolution:

- made KRI export filter construction explicit per valid branch
- removed the unused imports

### 5. Canonical structure docs drift

- `.planning/codebase/STRUCTURE.md` still claimed the old tracked-file count for
  `frontend/src/pages/`.
- This caused `make -f scripts/Makefile docs-topology-consistency` to fail even
  though the vendor docs themselves were valid.

Resolution:

- updated the tracked page-file count from `78` to `82`
- kept the structure doc date aligned to the guard’s UTC expectation

## Fixes Applied

- Removed dead vendor-detail code:
  - `frontend/src/pages/vendors/VendorSummaryCards.tsx`
- Stabilized vendor SLA CRUD E2E coverage:
  - `tests/frontend/e2e/permissions/vendor-slas-crud.spec.ts`
- Reconciled vendor manuals:
  - `docs/user/vendors.md`
  - `docs/user-cs/vendors.md`
- Repaired frontend type/build blockers:
  - `frontend/src/pages/KRIsPage.tsx`
  - `frontend/src/services/executionApi.ts`
  - `frontend/src/types/control.ts`
- Reconciled test guidance and canonical structure docs:
  - `docs/TESTING.md`
  - `.planning/codebase/STRUCTURE.md`

## Verification

- `cd frontend && npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/VendorDetailPage.presentation.test.ts src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`
- `cd backend && pytest -q ../tests/backend/pytest/test_vendors.py ../tests/backend/pytest/test_vendor_slas.py`
- `cd frontend && npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts ../tests/frontend/e2e/permissions/vendor-slas-crud.spec.ts`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`
- `python3 scripts/check_docs_contract.py`
- `make -f scripts/Makefile docs-topology-consistency`

## Residual Risks

- None identified in the reviewed vendor-detail and adjacent cleanup surface.
