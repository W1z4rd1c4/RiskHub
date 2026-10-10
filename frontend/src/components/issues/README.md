# frontend/src/components/issues

## Purpose

UI components for `issues` area.

## Contents

- `__tests__/`
- `IssueBadges.tsx` — `IssueStatusBadge` / `IssueSeverityBadge` on the shared
  `Badge` shell (translated labels; severity on the D1 scale via
  `SeverityBadge`). The former `issueUi.ts` class constants are gone (DS-10).
- `IssueCreateForm.tsx` — a real `<form>` on `Field` + `Input`/`Textarea`/
  `ThemedSelect`, per-field validation errors, one server `InlineMessage`.
- `IssueQuickCreateModal.tsx`
- `RemediationPlanCard.tsx`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

`RemediationPlanCard.tsx` depends on React Query context because it updates and invalidates issue detail/history queries.
