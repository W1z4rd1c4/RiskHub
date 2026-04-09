# frontend/src/components/issues

## Purpose

UI components for `issues` area.

## Contents

- `__tests__/`
- `IssueCreateForm.tsx`
- `IssueQuickCreateModal.tsx`
- `issueUi.ts`
- `RemediationPlanCard.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

`RemediationPlanCard.tsx` depends on React Query context because it updates and invalidates issue detail/history queries.
