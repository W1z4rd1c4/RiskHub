# 251-08 Summary: Simplify Activity Log Page

## Objective
Simplified `ActivityLogPage.tsx` (~559 lines) by extracting lookups, filtering, and fetching into a hook, and extracting the filter bar UI into a component.

## Changes Made

### Task 1: Extract data fetching + filters into `useActivityLogPageState`
- **Created** `frontend/src/hooks/useActivityLogPageState.ts` (277 lines)
  - Owns view mode, tab state, pagination, entries, and error handling
  - Manages all filter state (search, action, date range)
  - Manages view mode selectors (actor, department, risk)
  - Loads lookup data for selectors (users, departments, risks, actions)
  - Reuses existing `useDebouncedValue` hook for search debounce
  - Builds `ActivityLogFilters` payloads with correct entity type mapping
  - Exports `ViewMode`, `ErrorType`, `ActiveTab` types

### Task 2: Extract filter UI into a component
- **Created** `frontend/src/components/activity-log/ActivityLogFilterBar.tsx` (173 lines)
  - Renders view mode selector buttons
  - Renders conditional entity pickers (person/department/risk)
  - Renders search, action, and date range filters
  - Fully presentational with explicit props

### Refactored `ActivityLogPage.tsx` (560→414 lines)
- Now uses `useActivityLogPageState` hook for all state management
- Uses `ActivityLogFilterBar` component for filter UI
- Extracted local `ActivityLogEntries` and `ActivityLogPagination` components
- RBAC gating preserved (early return before hook call)
- All helper functions (`getActionIcon`, `formatDiffValue`, `getDiffPair`) remain

## Verification
- ✅ `npm run build` passes (3458 modules, 0 errors)
- ✅ TypeScript compilation succeeds
- ✅ RBAC gating preserved (early return before any API calls)

## Metrics
| File | Before | After |
|------|--------|-------|
| ActivityLogPage.tsx | 560 | 414 |
| useActivityLogPageState.ts | - | 277 |
| ActivityLogFilterBar.tsx | - | 173 |
