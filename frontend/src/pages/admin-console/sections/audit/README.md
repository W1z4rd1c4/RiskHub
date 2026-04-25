# frontend/src/pages/admin-console/sections/audit

## Purpose

Audit-log, details-modal, export, and log-rotation panels for the Admin Console audit area.

## Contents

- `AuditDetailsModal.tsx`
- `AuditLogsPanel.tsx`
- `AuditLogsTable.tsx`
- `LogSettingsPanel.tsx`
- `auditExport.ts`
- `auditPresentation.ts`

## Notes

Keep `AdminConsoleAuditPanels.tsx` as the compatibility export. Log settings form state must preserve unsaved local edits across background refreshes.
