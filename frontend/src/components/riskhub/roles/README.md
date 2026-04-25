# frontend/src/components/riskhub/roles

## Purpose

Role management table, dialogs, and permission grouping helpers for the Risk Hub roles panel.

## Contents

- `RoleDeleteDialog.tsx`
- `RoleModal.tsx`
- `RolesTable.tsx`
- `rolePermissions.ts`
- `useRolesPanelData.ts`

## Notes

Keep role create/update/delete/restore payload behavior aligned with backend role tests. Capability-driven action visibility should stay in the data hook or table boundary.
