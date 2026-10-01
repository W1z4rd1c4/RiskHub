# frontend/src/hooks

## Purpose

Folder for `frontend/src/hooks` implementation assets.

## Contents

- `useActivityLogPageState.ts`
- `useChartTheme.ts`
- `useContentTabs.ts` — tab/panel ARIA wiring with roving tabindex and
  Arrow/Home/End (disabled tabs skipped via `isTabDisabled`); the engine behind
  `components/ui/tabs.tsx`. `contentTabId` / `contentPanelId` build the shared ids.
- `useDebouncedValue.ts`
- `useDepartmentDetail.ts`
- `useRiskHubConfig.ts`
- `useStatusTheme.ts`
- `useUsersPageFilters.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
