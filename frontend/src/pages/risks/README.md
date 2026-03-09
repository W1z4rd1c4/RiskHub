# frontend/src/pages/risks

## Purpose

Risk register page support modules extracted for maintainability.

## Contents

- `RisksFilterBar.tsx`
- `RisksPageHeader.tsx`
- `RisksTableSection.tsx`
- `risksPagePresentation.ts`
- `useRisksPageState.ts`
- `riskColumns.tsx`

## Notes

Keep `RisksPage.tsx` as the route container and use this folder for page-local
state, filter/query helpers, and reusable table-column definitions.

`risksPagePresentation.ts` now also owns grouped `By Vendor` behavior. The
grouped register is multi-membership: one risk can render in multiple vendor
groups when it is linked to multiple readable vendors.
