---
phase: 251-spaghetti-simplification-2
plan: 251-07
type: summary
domain: frontend
---

# Summary: Simplify ControlsPage with Shared Hooks

## Completed Tasks

### Task 1: Adopt shared hooks for debounce + pending approvals
- Replaced local debounce effect with `useDebouncedValue(search, 300)` hook
- Replaced local pending approvals fetch with `usePendingApprovalIds('control')` hook
- Removed ~35 lines of duplicate state and effects
- Removed `approvalsApi` import (no longer needed directly)

### Task 2: Extract grouped-view full-fetch into local helper
- Created `fetchAllForGroupedView(search, status)` function as module-level helper
- Encapsulates pageSize=100 pagination loop with proper typing
- `fetchControls` now calls helper for grouped views, reducing callback complexity

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| ControlsPage.tsx lines | 467 | 444 |
| Debounce effects | 1 local | 0 (shared hook) |
| Pending approvals effects | 1 local | 0 (shared hook) |

## Verification

- [x] `cd frontend && npm run build` - passes
- [ ] Manual smoke: Controls page "all" and grouped views - pending user verification

## Notes

- Consistent with RisksPage refactoring (251-06)
- No UI behavior changes; only internal code organization improved
