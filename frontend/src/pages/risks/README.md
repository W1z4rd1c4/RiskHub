# frontend/src/pages/risks

## Purpose

Risk register page support modules extracted for maintainability.

## Contents

- `RiskRegisterFilterBar.tsx`
- `riskRegisterConfig.ts`
- `risksPagePresentation.ts`
- `useRisksPageState.ts`
- `riskColumns.tsx`

The route composes these domain modules through the shared `RegisterListShell`;
do not reintroduce page-local header, view-switcher, or table-state owners.

## Notes

Keep `RisksPage.tsx` as the route container and use this folder for page-local
state, filter/query helpers, and reusable table-column definitions.

`risksPagePresentation.ts` now also owns grouped `By Vendor` behavior. The
grouped register is multi-membership: one risk can render in multiple vendor
groups when it is linked to multiple readable vendors.
