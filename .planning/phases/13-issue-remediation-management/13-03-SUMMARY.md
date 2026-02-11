# 13-03 Summary - Dashboard, Reporting, and Phase Closeout

## Delivered

### Dashboard Issue Metrics

- Added issue dashboard schemas in `backend/app/schemas/dashboard.py`:
  - `IssueDashboardSummaryResponse`
  - `IssueAgingResponse`
  - `IssueSeverityBreakdownResponse`
- Added issue metrics endpoints in `backend/app/api/v1/endpoints/dashboard.py`:
  - `GET /dashboard/issues-summary`
  - `GET /dashboard/issues-aging`
  - `GET /dashboard/issues-by-severity`
- Implemented `issues:read` enforcement and issue visibility scoping parity with issue endpoints.
- Implemented metric semantics:
  - open issues exclude closed and active approved exceptions
  - overdue logic with UTC date comparison
  - high severity open count (`high`, `critical`)
  - median open age and aging bucket distribution

### Issue Reporting Export

- Added `GET /reports/issues/export` in `backend/app/api/v1/endpoints/reports.py`.
- Implemented filter support:
  - `status`
  - `severity`
  - `owner_user_id`
  - `department_id`
  - `overdue_only`
- Added scoped row generation with remediation and exception context:
  - issue metadata
  - owner/department/due/age
  - linked risk/control/execution/KRI IDs and names
  - remediation status/progress/owner/target
  - exception status/expiry

### Backend Regression Tests

- Added metrics API regression tests:
  - `backend/tests/api/v1/test_dashboard_issue_metrics.py`
- Added issue export regression tests:
  - `backend/tests/api/v1/test_reports_issues.py`

### Frontend Dashboard/Reporting Integration

- Extended dashboard API client and types:
  - `frontend/src/services/dashboardApi.ts`
  - `frontend/src/types/dashboard.ts`
- Added dashboard widgets:
  - `frontend/src/components/dashboard/IssueAgingChart.tsx`
  - `frontend/src/components/dashboard/OpenIssuesBySeverityChart.tsx`
- Integrated issue widgets into dashboard page:
  - `frontend/src/pages/DashboardPage.tsx`
- Added issue export client method:
  - `frontend/src/services/reportApi.ts`
- Added issue export action in Issues page:
  - `frontend/src/pages/IssuesPage.tsx`

### E2E Coverage

- Added issue workflow e2e path:
  - `frontend/e2e/issues-workflow.spec.ts`
- Covers create → assign/start/progress → close + dashboard visibility checks.

## Verification Evidence

- `cd backend && pytest -q tests/api/v1/test_dashboard_issue_metrics.py` → pass
- `cd backend && pytest -q tests/api/v1/test_reports_issues.py` → pass
- `cd frontend && npx tsc --noEmit` → pass
- `cd frontend && npx playwright test -g "issues workflow"` → pass (`4 passed`)

## Closeout

- Updated planning state:
  - `.planning/ROADMAP.md` marks `13-01`, `13-02`, `13-03` complete
  - `.planning/STATE.md` marks Phase 13 complete with verification evidence
