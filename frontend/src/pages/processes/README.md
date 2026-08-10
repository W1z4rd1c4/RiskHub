# frontend/src/pages/processes

Route-level Processes page. Contains the process form (`ProcessForm.tsx`),
process-to-vendor link section (`ProcessVendorLinksSection.tsx`), table column
definitions (`processColumns.tsx`), and the page/detail state hooks
(`useProcessesPageState.ts`, `useProcessDetailState.ts`) with their presentation helpers.
Protected Process edit routing is represented by `processProtectedEdit.ts` and
the permission-scoped pending proposal surface in `ProcessPendingChangePanel.tsx`.
