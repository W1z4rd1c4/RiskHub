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
- `...`

## Notes

`KRIStatusWidget.tsx` owns the dashboard KRI drill-down contract:

- overdue -> `/kris?monitoring_status=not_submitted`
- upcoming -> `/kris?timeliness_status=due_soon`

Keep this README updated when responsibilities or structure in this folder change.
