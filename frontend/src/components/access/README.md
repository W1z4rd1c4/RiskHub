# frontend/src/components/access

## Purpose

UI components for `access` area.

## Contents

- `AccessEditModal.tsx`
- `PermissionMatrix.tsx` - read-only permission list with a text "granted" state; native checkboxes in edit mode (GAP-D-16)
- `UserAvatar.tsx` - the one decorative initial-avatar recipe for user rows and the profile header (GAP-D-27)
- `UsersFilterBar.tsx`
- `UsersTable.tsx` - `ui/table` primitives; rows expose `aria-expanded` / `aria-controls` on their expand toggles (AX-10)

## Notes

Keep this README updated when responsibilities or structure in this folder change.

`AccessEditModal` preserves one access transaction, consumes per-field ownership,
blocks exits while mutations are pending and keeps rejected edits available. Native
lifecycle is supplied by the route-local user panel only for an authorized native
Admin; authoritative returned rows are applied before optional list reload.
