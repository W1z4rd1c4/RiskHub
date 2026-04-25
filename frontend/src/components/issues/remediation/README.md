# frontend/src/components/issues/remediation

## Purpose

Focused sections and workflow helpers for the issue remediation plan card.

## Contents

- `AssignmentSection.tsx`
- `ClosureSection.tsx`
- `ExceptionSection.tsx`
- `ProgressSection.tsx`
- `SummaryField.tsx`
- `WorkflowSummarySection.tsx`
- `remediationPresentation.tsx`
- `useRemediationPlanWorkflow.ts`

## Notes

Preserve existing remediation behavior and test IDs when changing these sections. Workflow state belongs in the hook; section components should stay presentational.
