# frontend/src/components/access

## Purpose

UI components for `access` area.

## Contents

- `AccessEditModal.tsx`
- `PermissionMatrix.tsx`
- `UsersFilterBar.tsx`
- `UsersTable.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

`AccessEditModal` preserves one access transaction, consumes per-field ownership,
blocks exits while mutations are pending and keeps rejected edits available. Native
lifecycle is supplied by the route-local user panel only for an authorized native
Admin; authoritative returned rows are applied before optional list reload.
