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
- `...`

## Notes

Monitoring-status coverage for controls/KRIs page filters and status rendering
belongs in this folder.

Audit-trail pagination and canonical execution-result rendering regressions also
belong here because they are page-level consumers of the shared execution
domain contract.

Department detail KRI filter/count regressions also belong here because the page
consumes the canonical monitoring-status model and paginated department KRI API.

Keep this README updated when responsibilities or structure in this folder change.
