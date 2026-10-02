# frontend/src/components/riskhub/roles

## Purpose

Role management table, dialogs, and permission grouping helpers for the Risk Hub roles panel.

## Contents

- `RoleDeleteDialog.tsx` — role archive confirmation, a thin delegate over
  `ConfirmDialog intent="archive"` (PM-1, D10).
- `RoleModal.tsx` — create/edit dialog; permissions are `Checkbox`es in `Field`s,
  grouped per resource in `fieldset`s, labelled with task labels.
- `RolesTable.tsx` — role list on `ui/table`; permissions as translated `Badge`s
  (never raw `resource:action` tokens, PG-03); `RowActionButton` row actions
  with disabled reasons for system roles and assigned roles (GAP-B-03).
- `rolePermissions.ts`
- `useRolesPanelData.ts`

## Notes

Keep role create/update/delete/restore payload behavior aligned with backend role tests. Capability-driven action visibility should stay in the data hook or table boundary.
