# Summary: 250-06 Simplify RiskDetailPage Tab Extraction

## Changes Made

### Files Created
- **`frontend/src/components/risks/RiskDetailOverviewTab.tsx`** (~340 lines)
  - Extracted overview tab content: risk matrices, classification card, ownership card, KRIs grid, linked controls section (with active/draft/archived grouping), timestamps, and dialogs
  - Pure presentational component with explicit props

- **`frontend/src/components/risks/RiskDetailKriHistoryTab.tsx`** (~40 lines)
  - Extracted history tab: aggregated KRI history timeline
  - Simple wrapper around `HistoryTimeline` with appropriate empty message logic

### Files Modified
- **`frontend/src/pages/RiskDetailPage.tsx`** (719 → ~310 lines)
  - Reduced by ~57% in size
  - Now orchestrates: state, effects, handlers, and tab routing
  - Tab content delegated to extracted components

## Verification
- ✅ `npm run build` passes

## Notes
- `hexToRgba()` helper duplicated in overview tab component (kept local as per plan – only used there)
- Animation variants (`container`, `item`) moved to overview tab component
- Dialog state lifted up to parent and passed as props/setters
