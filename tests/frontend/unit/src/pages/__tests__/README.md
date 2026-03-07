# tests/frontend/unit/src/pages/__tests__

## Purpose

Folder for `tests/frontend/unit/src/pages/__tests__` implementation assets.

## Contents

- `ActivityLogPage.test.tsx`
- `AuditTrailPage.execution-status.test.tsx`
- `ApprovalsPage.presentation.test.ts`
- `ControlDetailPage.execution-status.test.tsx`
- `ControlDetailPage.issue-entry.test.tsx`
- `ControlsPage.archived-visibility.test.tsx`
- `DepartmentDetailPage.kri-monitoring.test.tsx`
- `DocumentationPage.test.tsx`
- `IssueDetailPage.tabs.test.tsx`
- `IssueNewPage.cancel.test.tsx`
- `IssueNewPage.test.tsx`
- `IssuesPage.layout-parity.test.tsx`
- `IssuesPage.naming.test.tsx`
- `IssuesPage.table-navigation.test.tsx`
- `IssuesPage.url-params.test.tsx`
- `KRIDetailPage.issue-entry.test.tsx`
- `KRIsPage.monitoring-status.test.tsx`
- `LoginPage.auth-modes.test.tsx`
- `rbac_gating.test.tsx`
- `RiskDetailPage.issue-entry.test.tsx`
- `VendorsPage.grouped-views.test.tsx`
- `...`

## Notes

Monitoring-status coverage for controls/KRIs page filters and status rendering
belongs in this folder.

`KRIsPage.monitoring-status.test.tsx` is the targeted regression gate for:
- URL-sourced monitoring/timeliness filter ownership
- monitoring/timeliness mutual exclusion
- no stuck loading under rapid filter changes
- grouped-view parity for route-backed KRI filters

Audit-trail pagination and canonical execution-result rendering regressions also
belong here because they are page-level consumers of the shared execution
domain contract.

Department detail KRI filter/count regressions also belong here because the page
consumes the canonical monitoring-status model and paginated department KRI API.

`VendorsPage.grouped-views.test.tsx` is the targeted regression gate for:
- grouped vendor tab rendering (`All`, `By Department`, `By Process`, `By Type`, `By Risk`)
- `By Risk` visibility only when risk-read permission exists
- vendor duplication across multiple linked-risk groups
- `Unlinked Risk` bucket behavior when no readable linked risks exist
- grouped results honoring active search/status/type filters before grouping

Keep this README updated when responsibilities or structure in this folder change.
