# frontend/src/components/dashboard

## Purpose

UI components for `dashboard` area.

## Contents

- `__tests__/`
- `CategoryBreakdownCharts.tsx`
- `chartTooltip.ts`
- `ControlTrendChart.tsx`
- `DepartmentTable.tsx`
- `FilterBar.tsx`
- `IssueAgingChart.tsx`
- `IssuesSummaryCard.tsx`
- `KRIBreachHistoryChart.tsx`
- `KRIBreachWidget.tsx`
- `KRIStatusWidget.tsx`
- `OpenIssuesBySeverityChart.tsx`
- `QuarterlyComparisonWidget.tsx`
- `RiskCommitteeSection.tsx`
- `RiskDistributionMatrix.tsx`
- `WidgetShell.tsx`
- `...`

## Notes

`KRIStatusWidget.tsx` owns the dashboard KRI drill-down contract:

- overdue -> `/kris?monitoring_status=not_submitted`
- upcoming -> `/kris?timeliness_status=due_soon`

`WidgetShell.tsx` is the shared dashboard widget branch wrapper. It accepts
`title`, `isLoading`, `error`, `isEmpty`, `emptyLabel`, and optional custom
fallback nodes, then renders exactly one loading, error, empty, or data branch.

Dashboard filter consumers should use `useDashboardFilterSelector` for the
smallest needed filter slice and `useDashboardFilterMutators` for writes. Keep
`useDashboardFilters` as the compatibility facade for older call sites.

Keep this README updated when responsibilities or structure in this folder change.
