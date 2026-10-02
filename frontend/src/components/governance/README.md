# frontend/src/components/governance

## Purpose

UI components for `governance` area.

## Contents

- `index.ts`
- `OrphanedItemsTable.tsx`
- `OrphanQuickViewModal.tsx`
- `ResolveOrphanDepartmentSelection.tsx`
- `ResolveOrphanFooter.tsx`
- `ResolveOrphanModal.tsx`
- `ResolveOrphanOwnerSelection.tsx`
- `ResolveOrphanRiskSelection.tsx`
- `ResolveOrphanSummary.tsx`
- `orphanResolutionState.ts`
- `resolveOrphanHelpers.ts`
- `useResolveOrphanWorkflow.ts`

## Notes

`GovernancePage`'s stat cards are the single type filter (SM-11): `OrphanedItemsTable` renders the rows it
is given and has no select of its own. The "Uncategorised" catch-all department is recognised in one place
(`isUncategorisedDepartment` in `resolveOrphanHelpers.ts`) and always shown through its translated label.
The owner, department and risk pickers are single-selection radiogroups named by their heading, with an
`EmptyState` when a search matches nothing (GAP-D-13). Icons come from `constants/entityIcons.ts` (NAV-03).

Keep this README updated when responsibilities or structure in this folder change.
