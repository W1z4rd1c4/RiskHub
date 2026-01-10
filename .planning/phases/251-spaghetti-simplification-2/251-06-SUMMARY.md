# Plan 251-06 Summary: Simplify RisksPage

## Objective
Simplify `frontend/src/pages/RisksPage.tsx` by extracting shared list-page utilities into small, reusable hooks.

## Changes Made

### New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/hooks/useDebouncedValue.ts` | 24 | Generic debounce hook replacing ad-hoc setTimeout patterns |
| `frontend/src/hooks/usePendingApprovalIds.ts` | 47 | Encapsulates paginated pending approvals fetch logic |

### Modified Files

| File | Before | After | Change |
|------|--------|-------|--------|
| `frontend/src/pages/RisksPage.tsx` | 647 | 614 | -33 lines (5%) |

## Technical Details

### `useDebouncedValue<T>(value: T, delayMs: number): T`
- Generic hook that debounces any value
- Default delay of 300ms
- Replaces the manual `setTimeout`/`clearTimeout` effect pattern

### `usePendingApprovalIds(resourceType: 'risk' | 'control' | 'kri'): Set<number>`
- Fetches all pending approvals via paginated API calls
- Filters by resource type and returns a Set of resource IDs
- Handles pagination automatically (100 items per page)
- Ready to be reused by `ControlsPage.tsx` in the next plan

## Verification

- [x] `npm run build` - Passed
- [x] RisksPage functional with new hooks

## Next Steps

Plan 251-07 can refactor `ControlsPage.tsx` to use the same hooks, eliminating its duplicate debounce and pending approvals logic.
