# KRI Component Tests

Vitest coverage for KRI-specific components.

Use this directory for component-level KRI behavior such as value recording modals, breach display, and approval-aware UI states.

`KRIHistoryEditModal.dirty-task.test.tsx` and the PG-22 cases in `KRIValueModal.test.tsx` cover the
dirty-task guard of the recording modals (they render in a data router because the guard uses `useBlocker`).
