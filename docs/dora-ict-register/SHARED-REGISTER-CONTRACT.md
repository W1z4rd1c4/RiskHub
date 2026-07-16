# Shared Operational Register Contract

Issue [#83](https://github.com/W1z4rd1c4/RiskHub/issues/83) completes the
expand-contract migration for the eight operational registers: Process, Asset,
Threat, Vendor, Risk, Control, KRI, and Issue. This document is the canonical
map of the shared seam and the evidence that protects it.

## Contract boundary

The frontend owns one interaction vocabulary:

- `frontend/src/components/ict-register/RegisterListShell.tsx` owns the shared
  page layout, views, toolbar, grouped/table branch, pagination, export-dialog
  lifecycle, and loading/empty/error/access-denied presentation.
- `frontend/src/pages/shared/registerListQuery.ts` parses and serializes search,
  view, sort, filters, and selected group while preserving unrelated browser
  navigation parameters.
- `frontend/src/pages/shared/collectionPageState.ts` owns reusable collection
  success/failure/request-order state. Entity page hooks own only their domain
  filter types, query mapping, API call, and row actions.
- Each entity `*RegisterConfig.ts` is the declarative home for its confirmed
  views, filters, grouping keys, sort fields, and normalized list parameters.

The backend owns one normalized collection boundary:

- `backend/app/api/v1/endpoints/_collection.py` provides `build_list_context`,
  which converts the public query into normalized collection criteria; all
  eight list and current-export endpoints use it.
- `backend/app/services/_register_listings/` owns permission scope, filter
  algebra, facets, grouping, lookups, deterministic ordering, and pagination.
- `backend/app/services/_register_listings/lifecycle.py` owns the shared SQL and
  in-memory response lifecycle. Entity planners supply scoped rows and domain
  serialization; endpoints do not recreate list semantics.
- Current-view export reuses the same normalized criteria and authorization
  scope with pagination removed. Risk, Control, KRI, and Issue historical
  snapshots remain separate reporting-service operations with an as-of date.
  Formal DORA Register of Information export remains a third, regulatory
  adapter and is not a list export.

## Eight-register map

| Register | Route | Frontend page state/config | Backend planner | Browser/API evidence |
|---|---|---|---|---|
| Process | `/processes` | `pages/processes/` | `_register_listings/processes.py` | `process-register-framework.spec.ts`; `test_process_register_framework.py` |
| Asset | `/assets` | `pages/assets/` | `_register_listings/assets.py` | `asset-register-framework.spec.ts`; `test_asset_register_framework.py` |
| Threat | `/threats` | `pages/threats/` | `_register_listings/threats.py` | `threat-register-framework.spec.ts`; `test_threat_register_framework.py` |
| Vendor | `/vendors` | `pages/vendors/` | `_register_listings/vendors.py` | `vendor-register-framework.spec.ts`; `test_vendor_register_framework.py` |
| Risk | `/risks` | `pages/risks/` | `_register_listings/risks.py` | `risk-control-register-framework.spec.ts`; `test_risk_control_register_framework.py` |
| Control | `/controls` | `pages/controls/` | `_register_listings/controls.py` | `risk-control-register-framework.spec.ts`; `test_risk_control_register_framework.py` |
| KRI | `/kris` | `pages/kris/` | `_register_listings/kris.py` | `kri-issue-register-framework.spec.ts`; `test_kri_issue_register_framework.py` |
| Issue | `/issues` | `pages/issues/` | `_register_listings/issues.py` | `kri-issue-register-framework.spec.ts`; `test_kri_issue_register_framework.py` |

`tests/frontend/e2e/eight-register-parity.spec.ts` traverses all eight routes as
one black-box matrix. It proves shared shell readiness, server-declared
Create/Export visibility, URL-backed search, page reset, and Back/Forward view
restoration. `tests/frontend/unit/src/pages/shared/eightRegisterParity.contract.test.ts`
locks the shell, URL vocabulary, entity query builder, current export, async
state, capabilities, pending projection where applicable, and historical-export
separation. `tests/backend/pytest/architecture/test_ict_gov_11_register_listing_contraction.py`
locks the normalized endpoint boundary, shared listing lifecycle, stable entity
tiebreakers, scoped-facet regression inventory, and removal of the superseded
endpoint execution facade.

## Invariants

1. Authorization is applied before facets, counts, groups, lookups, and export.
   A hidden row, relationship, label, or quantity cannot influence any of them.
2. Different filter fields compose with AND; repeated values inside one field
   compose with OR where supported; search is additionally ANDed. Controlled
   zero-result values remain visible but disabled when the domain contract
   requires them.
3. Default ordering uses the entity business key plus a stable entity-ID
   tiebreaker. Pagination never depends on database return order.
4. Search, view, sort, filters, and selected group are URL-backed. Back,
   Forward, reload, and copied links restore that working set for callers with
   equivalent access. Any working-set change clears the selected page and
   returns local pagination to page 1.
5. The shell distinguishes initial loading, stale-data refresh, empty results,
   retryable failure, and access denial. A confirmed denial clears rows, groups,
   facets, counts, and capabilities.
6. Collection and row actions are rendered from backend capabilities. Archive,
   restore, and pending approval are separate states; pending proposals do not
   alter the approved operational collection until execution.
7. Current-view export contains every matching authorized row, not only the
   visible page. Historical snapshots and formal RoI export never masquerade as
   the current filtered list.

## Contraction rule

Legacy orchestration may be deleted only when production callers are absent and
the matrix above stays green. Do not reintroduce entity-specific copies of URL
parsing, collection success/failure state, list response assembly, or endpoint
export filtering. A new domain filter belongs in the entity config/planner and
must travel through the shared seams.

## Verification

Run the narrow contract first, then the repository gates affected by the
change:

```bash
cd frontend
npm run test:run -- ../tests/frontend/unit/src/pages/shared/eightRegisterParity.contract.test.ts
npx playwright test -c playwright.config.ts --project=ci --list ../tests/frontend/e2e/eight-register-parity.spec.ts

cd ../backend
./venv/bin/pytest -q ../tests/backend/pytest/architecture/test_ict_gov_11_register_listing_contraction.py

cd ..
make -f scripts/Makefile docs-topology-consistency
python3 scripts/security/validate_authz_capability_contract.py
```

The entity framework suites in the table remain the behavioral authority for
domain filters, scoped facets/non-leakage, archive/restore, async failures,
accessible controls, and export contents. The cross-register tests intentionally
guard only the shared behavior so entity-specific coverage is not duplicated.
