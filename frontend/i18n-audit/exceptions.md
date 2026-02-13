# i18n Scanner Exceptions

These paths are temporarily excluded from `i18n:scan` to keep CI strict on migrated surfaces while phased localization continues.

## Pending module migrations
- `src/components/access/**`
- `src/components/activity-log/**`
- `src/components/controls/**`
- `src/components/dashboard/**`
- `src/components/executions/**`
- `src/components/governance/**`
- `src/components/history/**`
- `src/components/kri/**`
- `src/components/kris/**`
- `src/components/notifications/**`
- `src/components/risks/**`
- `src/components/settings/**`
- `src/components/tables/**`
- `src/components/vendors/**`

## Pending page migrations
- `src/pages/ActivityLogPage.tsx`
- `src/pages/AdminConsolePage.tsx`
- `src/pages/ApprovalsPage.tsx`
- `src/pages/AuditTrailPage.tsx`
- `src/pages/ControlDetailPage.tsx`
- `src/pages/ControlsPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/DepartmentDetailPage.tsx`
- `src/pages/DocumentationPage.tsx`
- `src/pages/KRIDetailPage.tsx`
- `src/pages/RiskDetailPage.tsx`
- `src/pages/RiskHubPage.tsx`
- `src/pages/RisksPage.tsx`
- `src/pages/UserDetailPage.tsx`
- `src/pages/UserNewPage.tsx`

## Notes
- Mandatory migration targets from the current plan are not in this exception list.
- This file should shrink to zero as remaining pages/components are migrated.
