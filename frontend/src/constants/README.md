# frontend/src/constants

## Purpose

Folder for `frontend/src/constants` implementation assets.

## Contents

- `entityIcons.ts`
- `list.ts`
- `riskScoreDescriptions.ts`

## Notes

`entityIcons.ts` is the one entity-to-icon map (NAV-03): sidebar routes, Governance, Departments and
history/notification rows take their icon from `ENTITY_ICONS` / `ENTITY_ICON_BY_TYPE`; no two entities
(or an entity and a non-entity destination) share a glyph.

Keep this README updated when responsibilities or structure in this folder change.
