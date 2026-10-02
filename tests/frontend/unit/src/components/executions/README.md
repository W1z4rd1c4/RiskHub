# tests/frontend/unit/src/components/executions

## Purpose

Vitest coverage for the control execution components.

## Contents

- `ExecutionLogModal.test.tsx`

## Notes

`ExecutionLogModal.test.tsx` covers the result `RadioGroup` (one choice of four, Passed preselected) and that the
chosen result is what is submitted, plus the PG-22 dirty-task guard (typed input asks before Escape/Cancel
discards it; a pristine form or a successful submission closes without asking; rendered in a data router). `ExecutionHistory` is covered in `components/__tests__/ExecutionHistory.test.tsx`.
