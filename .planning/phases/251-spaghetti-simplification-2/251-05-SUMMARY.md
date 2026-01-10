# Summary: Plan 251-05 - Simplify Reports Endpoints

## Objective
Simplified `backend/app/api/v1/endpoints/reports.py` by extracting repeated scoping/query/response patterns and making RBAC invariants explicit.

## Changes Made

### File Modified
- **reports.py**: 443 → 330 lines (-25%)

### Helpers Extracted

#### Streaming Response Helpers
- `_stream_pdf(filename_base, content_bytes)` - Creates PDF StreamingResponse with correct headers
- `_stream_excel(filename_base, content_bytes)` - Creates Excel StreamingResponse with correct headers
- `_PDF_MEDIA_TYPE` / `_EXCEL_MEDIA_TYPE` constants for consistency

#### Department Scoping
- `_validate_department_access()` - Renamed from public to internal (unchanged logic)
- `_user_has_no_departments(dept_ids)` - Unified empty-scope check

#### Query Builders (Per-Entity, Explicit)
- `_controls_report_query(dept_ids, department_id, status_filter)` - Controls with RBAC scoping
- `_risks_report_query(dept_ids, department_id, status_filter)` - Risks with RBAC scoping  
- `_audit_trail_query(dept_ids, department_id, result_filter, control_id, from_date, to_date)` - ControlExecution with all filter support

### Endpoint Simplification

| Endpoint | Before | After |
|----------|--------|-------|
| Controls PDF | 47 lines | 12 lines |
| Controls Excel | 41 lines | 12 lines |
| Risks PDF | 41 lines | 12 lines |
| Risks Excel | 41 lines | 12 lines |
| Summary PDF | 76 lines | 58 lines |
| Audit Trail PDF | 61 lines | 12 lines |
| Audit Trail Excel | 61 lines | 12 lines |

## Verification
- ✅ `python3 -m pytest -q tests/test_reports_rbac.py` - 11 passed
- ✅ RBAC scoping preserved (privileged vs dept-scoped vs no-dept)
- ✅ Same filenames, media types, and headers

## Design Notes
- Query builders are **per-entity** with explicit parameters (no generic abstraction)
- Streaming helpers encapsulate media types and Content-Disposition headers
- Empty-scope checks occur early, before query execution
- File organized with clear section headers: Streaming, Scoping, Query Builders, Endpoints
