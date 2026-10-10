# frontend/src/components/linking

## Purpose

UI components for `linking` area.

## Contents

- `ExistingLinksPanel.tsx`
- `LinkedItemList.tsx` — `LinkedItemList` / `LinkedItemRow` and the named `LinkRemoveButton`, shared with the
  Asset, Process and Threat link sections
- `LinkConfirmationPanel.tsx`
- `LinkSearchFilters.tsx`
- `LinkSearchPanel.tsx`
- `LinkSearchResultItem.tsx`
- `LinkSearchResults.tsx`
- `existingLinksPresentation.ts`
- `linkModes.ts`
- `linkSearchAdapters.ts`
- `linkSearchPresentation.ts`
- `linkTypes.ts`
- `useLinkManagementWorkflow.ts`

## Notes

`LinkManagementDialog` remains the public compatibility component outside this
folder. This folder owns the workflow, mode-specific search adapters, and
presentation pieces used by that dialog.

Keep this README updated when responsibilities or structure in this folder change.
