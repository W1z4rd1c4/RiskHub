# frontend/src/pages/admin-console/sections/ops

## Purpose

Operational Admin Console panels for health, logs, scheduler/outbox status, sessions, and directory checks.

## Contents

- `HealthPanel.tsx`
- `LogsPanel.tsx`
- `OutboxStatusSection.tsx`
- `SchedulerStatusSection.tsx`
- `SessionsPanel.tsx`
- `SessionsTable.tsx`
- `sessionPresentation.ts`

## Notes

Keep API ownership in the parent panels. Extracted status/table components should receive already-loaded data and callbacks.
