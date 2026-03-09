# frontend/src/pages/controls

## Purpose

Controls register page modules and control-detail support helpers.

## Contents

- `ControlsFilterBar.tsx`
- `ControlsPageHeader.tsx`
- `ControlsTableSection.tsx`
- `controlsPagePresentation.ts`
- `useControlsPageState.ts`
- `ControlDetailOverviewTab.tsx`

## Notes

Keep route orchestration in `ControlsPage.tsx`, keep control-detail orchestration in
`ControlDetailPage.tsx`, and use this folder for page-local state/presentation seams.

`controlsPagePresentation.ts` owns grouped `By Vendor` behavior for the
controls register. The grouped view is multi-membership and uses readable
linked-vendor summaries returned by the backend list payload.
