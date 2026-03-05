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
