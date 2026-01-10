# Plan 250-05 Summary: Extract StepIndicator Component

## Completed: 2026-01-10

## Changes Made

### Created
- `frontend/src/components/ui/StepIndicator.tsx` — Reusable step indicator component with flexible click policies

### Modified
- `frontend/src/components/ControlForm.tsx` — Replaced inline step indicator (~24 lines) with `<StepIndicator />` component
- `frontend/src/components/RiskForm.tsx` — Replaced inline step indicator (~28 lines) with `<StepIndicator />` component

## Implementation Details

The `StepIndicator` component accepts:
- `steps`: Array of `{ id, title, icon }` definitions
- `currentStep`: Current active step index
- `isStepClickable`: Callback to determine click policy per step
- `onStepClick`: Handler when clickable step is clicked

**Click policies preserved:**
- ControlForm: `idx <= currentStep + 1` (can click back + immediate next)
- RiskForm: `idx < currentStep` (back only)

## Verification

- ✅ `npm run build` passes (no TypeScript errors)
- ✅ Manual test: Control form navigation works correctly
- ✅ Manual test: Risk form navigation works correctly

## Line Reduction

- ControlForm.tsx: ~17 lines removed
- RiskForm.tsx: ~21 lines removed
- Total duplication eliminated: ~38 lines

## Next Steps

Continue with Plan 250-06 or other Phase 250 simplification plans.
