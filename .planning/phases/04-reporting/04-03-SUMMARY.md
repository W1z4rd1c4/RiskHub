# Summary: 04-03 Unified Backend Exports (Risks/Controls/KRIs/Vendors)

**Status:** Complete  
**Executed:** 2026-02-10

## Deliverables

### Backend Export Contract
- Added unified export endpoints in `backend/app/api/v1/endpoints/reports.py`:
  - `GET /api/v1/reports/risks/export`
  - `GET /api/v1/reports/controls/export`
  - `GET /api/v1/reports/kris/export`
  - `GET /api/v1/reports/vendors/export`
- All four support:
  - `format=pdf|xlsx|csv`
  - `as_of_date=YYYY-MM-DD` (defaults to current date)
- Preserved legacy compatibility:
  - `GET /api/v1/reports/risks/pdf|excel`
  - `GET /api/v1/reports/controls/pdf|excel`
  - Legacy endpoints now route through shared export internals.

### Snapshot Reconstruction
- Added `backend/app/services/export_snapshot_service.py`.
- Implemented reverse replay logic over `ActivityLog` for `risk`, `control`, `kri`, and `vendor` exports:
  - Reverts post-cutoff changes via `changes[field].old`
  - Drops rows created after cutoff
  - Applies archive fallback for legacy archive logs without change sets
- KRI export additionally applies as-of value override from `kri_value_history` where available.

### Multi-format Rendering
- Extended `backend/app/services/report_service.py` with reusable generators:
  - `generate_tabular_pdf(...)`
  - `generate_tabular_excel(...)`
  - `generate_tabular_csv(...)`
- Added CSV formula-injection hardening by prefixing risky leading characters.

### Test Coverage
- Extended `backend/tests/test_reports_rbac.py` with:
  - Unified format matrix checks
  - CSV scoping assertions
  - As-of snapshot replay assertion
  - KRI/vendor export availability checks

## Verification
- `cd backend && venv/bin/pytest tests/test_reports_rbac.py -q`  
  Result: `16 passed`
- `cd backend && venv/bin/pytest tests/test_vendor_reports.py tests/test_kris_rbac.py tests/test_vendors.py tests/api/v1/test_reports_audit.py -q`  
  Result: `28 passed`

## Notes / Compatibility
- Summary and audit-trail report endpoints were left intact.
- Unified export endpoints are read-scoped and respect existing department/ownership visibility rules.
- `as_of_date` reconstruction is bounded to entities present in current scoped datasets (soft-delete workflows are supported; hard-deleted historical-only rows are not reconstructed).
