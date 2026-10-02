# frontend/src/components/activity-log

## Purpose

UI components for `activity-log` area.

## Contents

- `ActivityLogFilterBar.tsx`
- `ActivityLogEntries.tsx`
- `activityLogPresentation.ts`

## Notes

Entity types, actions and changed fields are translated (`common:activity_log.entity_types.*`,
`admin:audit.events.*`, `common:activity_log.fields.*`) with a humanised fallback, never raw snake_case
(GAP-D-02). The view-mode switch is a named group of pressed-state buttons; every filter has an accessible
name (AX-04).

Keep this README updated when responsibilities or structure in this folder change.
