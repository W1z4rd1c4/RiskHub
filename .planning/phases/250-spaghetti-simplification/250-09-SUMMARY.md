# Summary 250-09: Simplify `DepartmentDetailPage.tsx`

## Objective
Refactored `DepartmentDetailPage.tsx` (~575 lines) to reduce state/effect sprawl by extracting data-fetching logic into a dedicated hook and organizing tab panels into local render functions.

## Changes Made

### Created: `frontend/src/hooks/useDepartmentDetail.ts`
- Extracted all data-fetching logic (department metadata, risks, controls, KRIs, users)
- Preserved "fetch only when tab is active" behavior
- Exports constants (`DEPARTMENT_PAGE_SIZE`, `HIGH_RISK_MIN_NET_SCORE`) and types (`TabView`, `DeptUser`)
- Returns pagination totals, data arrays, loading/error states, and a `refresh` function

### Modified: `frontend/src/pages/DepartmentDetailPage.tsx`
- Uses new `useDepartmentDetail` hook for all data fetching
- Organized rendering with local render functions:
  - `renderRisksTab()`
  - `renderControlsTab()`
  - `renderKrisTab()`
  - `renderUsersTab()`
  - `renderActivityTab()`
- Moved column definitions and helper functions (`getResultIcon`) outside the component
- Added clear section comments for better code navigation

## Verification
- ✅ `npm run build` passes
- ✅ No TypeScript errors
- ✅ All imports resolve correctly

## Behavior Preserved
- API call semantics unchanged
- Pagination semantics unchanged (page size = 100, skip calculation)
- "High risk" filter semantics unchanged (min_net_score = 10)
- Tab switching behavior unchanged
- Row click navigation targets unchanged

## Impact
- Reduced number of `useEffect` blocks in the main page component (from 5 to 1)
- Clear separation: data loading in hook, UI state/rendering in page
- Improved code organization and readability
