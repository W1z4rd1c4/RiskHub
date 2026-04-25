# frontend/src/pages/admin-console/sections

## Purpose

Extracted Admin Console section and panel components used by `frontend/src/pages/AdminConsolePage.tsx`.

## Contents

- `AdminConsoleAuditPanels.tsx`
- `AdminConsoleOpsPanels.tsx`
- `ops/` - focused operational panel modules re-exported through `AdminConsoleOpsPanels.tsx`

## Notes

Keep page-level behavior in `frontend/src/pages/AdminConsolePage.tsx`; keep section files focused on panel rendering and local panel interactions.
