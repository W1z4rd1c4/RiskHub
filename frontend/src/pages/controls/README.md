# frontend/src/pages/controls

## Purpose

Controls register page modules and control-detail support helpers.

## Contents

- `ControlRegisterFilterBar.tsx`
- `controlRegisterConfig.ts`
- `controlColumns.tsx`
- `controlsPagePresentation.ts`
- `useControlsPageState.ts`
- `ControlDetailOverviewTab.tsx`

The route composes these domain modules through the shared `RegisterListShell`;
do not reintroduce page-local header, view-switcher, or table-state owners.

## Notes

Keep route orchestration in `ControlsPage.tsx`, keep control-detail orchestration in
`ControlDetailPage.tsx`, and use this folder for page-local state/presentation seams.

`controlsPagePresentation.ts` owns grouped `By Vendor` behavior for the
controls register. The grouped view is multi-membership and uses readable
linked-vendor summaries returned by the backend list payload.
