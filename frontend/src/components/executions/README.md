# frontend/src/components/executions

## Purpose

UI components for `executions` area.

## Contents

- `ExecutionHistory.tsx`
- `ExecutionLogModal.tsx`

## Notes

`ExecutionHistory.tsx` and `ExecutionLogModal.tsx` must use the canonical
execution result contract only:
`passed`, `failed`, `warning`, `not_applicable`.

Control detail/history flows must use the control-scoped execution API
(`/controls/{id}/executions`). The generic `/executions` API is reserved for
cross-control audit/list surfaces such as `AuditTrailPage.tsx`.

Keep this README updated when responsibilities or structure in this folder change.
