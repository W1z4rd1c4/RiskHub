# Vendor Route Overhaul Review — 2026-03-08

## Scope

Full overhaul of the individual vendor route family:

- `frontend/src/pages/VendorDetailPage.tsx`
- `frontend/src/pages/vendors/VendorFormView.tsx`
- `frontend/src/components/VendorForm.tsx`
- vendor detail tab surfaces under `frontend/src/components/vendors/`

Out of scope:

- vendor register/list page IA
- backend API/schema changes
- non-vendor design-system rewrites

## Findings

### 1. Vendor detail and form routes had drifted into mixed UI languages

The merged 5-tab IA was functionally correct, but the route family still mixed:

- risk-style orchestration
- old vendor glass cards
- tailwind-only one-off tab surfaces
- a portal modal that did not share the page’s visual system

Risk:

- inconsistent user experience across `view`, `edit`, and `new`
- theme drift in `light` mode
- higher maintenance cost because each tab owned too much presentation

Resolution:

- introduced a vendor-local glass-stack surface system in:
  - `frontend/src/components/vendors/vendorRoute.css`
  - `frontend/src/components/vendors/vendorRouteUi.tsx`
- moved the detail shell, overview, and form routes onto that shared layer
- scoped the SLA portal modal into the same vendor-route theme context

### 2. Several vendor tabs still relied on pre-overhaul color and card patterns

After the shell refactor, the most visible lagging surfaces were:

- assessments
- resilience
- dependencies
- SLA modal

Risk:

- the route family looked partially migrated
- some sections were not theme-safe in `light`

Resolution:

- rewrote those surfaces around shared section headers, glass cards, inline states, and vendor-local fields
- added a light-theme compatibility bridge in `vendorRoute.css` for remaining legacy utility-class surfaces that still render inside the vendor route family

### 3. Vendor form route lacked a complete user-facing section model

The new/edit form logic was intact, but the route-family doc and locale copy were behind the new sectioned form layout.

Resolution:

- documented the section structure
- added the missing `form.sections.resilience` locale key in English and Czech

### 4. Build and documentation guards exposed cleanup drift

The overhaul loop surfaced two unrelated-but-blocking cleanup gaps:

- `VendorOverviewTab.tsx` still had dead icon imports
- `.planning/codebase/STRUCTURE.md` still claimed `frontend/src/pages/` had `82` tracked files while the repo had `81`

Resolution:

- removed the dead imports
- reconciled the planning structure metadata and refresh date

## Fixes Applied

- Added vendor-local glass-stack primitives:
  - `frontend/src/components/vendors/vendorRoute.css`
  - `frontend/src/components/vendors/vendorRouteUi.tsx`
- Rebuilt vendor route shell and form framing:
  - `frontend/src/pages/VendorDetailPage.tsx`
  - `frontend/src/pages/vendors/VendorDetailHeader.tsx`
  - `frontend/src/pages/vendors/VendorFormView.tsx`
  - `frontend/src/components/VendorForm.tsx`
- Reworked overview and tab chrome:
  - `frontend/src/pages/vendors/VendorOverviewTab.tsx`
  - `frontend/src/pages/vendors/VendorSectionStack.tsx`
  - `frontend/src/pages/vendors/VendorTabs.tsx`
- Reworked the remaining lagging vendor detail surfaces:
  - `frontend/src/components/vendors/VendorAssessmentsTab.tsx`
  - `frontend/src/components/vendors/VendorResilienceTab.tsx`
  - `frontend/src/components/vendors/VendorDependenciesTab.tsx`
  - `frontend/src/components/vendors/VendorDependencyGraph.tsx`
  - `frontend/src/components/vendors/VendorSLAModal.tsx`
- Added locale/documentation sync:
  - `frontend/src/i18n/locales/en/vendors.json`
  - `frontend/src/i18n/locales/cs/vendors.json`
  - `frontend/src/pages/vendors/README.md`
  - `frontend/src/components/vendors/README.md`
  - `docs/user/vendors.md`
  - `docs/user-cs/vendors.md`
  - `.planning/codebase/STRUCTURE.md`

## Verification

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npx vitest run -c ../tests/frontend/unit/vitest.config.ts src/pages/__tests__/VendorDetailPage.presentation.test.ts src/pages/__tests__/VendorDetailPage.issue-entry.test.tsx`
- `cd frontend && npx playwright test -c ../tests/frontend/e2e/playwright.config.ts ../tests/frontend/e2e/vendors.spec.ts ../tests/frontend/e2e/issues-contextual-create.spec.ts ../tests/frontend/e2e/permissions/vendor-slas-crud.spec.ts`
- `cd frontend && npm run build`
- `python3 scripts/check_docs_contract.py`
- `make -f scripts/Makefile docs-topology-consistency`

## Residual Risks

- Some vendor tab bodies still use older utility-class markup internally. They now inherit the vendor-route compatibility layer, but they are good candidates for a follow-up cleanup pass if you want the code itself, not just the rendered result, fully normalized.
