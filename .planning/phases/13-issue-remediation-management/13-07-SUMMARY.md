# 13-07 Summary - Simplified Issue Workflow UX

## Delivered

### Guided Workflow Emphasis

Updated `frontend/src/components/issues/RemediationPlanCard.tsx` to reduce operational clutter while keeping backend workflow contract unchanged.

Implemented:

- status-aware next-step summary text in workflow summary card
- action emphasis by current issue status:
  - `open|triaged`: remediation start emphasized
  - `in_progress`: progress/exception paths emphasized
  - `ready_for_validation`: close action emphasized
  - `closed`: summary-only mode

### Advanced Field Simplification

- Moved low-frequency progress fields behind collapsible `details` section:
  - blocker reason
  - completion notes
- Preserved all existing mutation endpoints and payload support.

### Localization

Added workflow UX keys in EN/CS locale files:

- `workflow.next_step.*`
- `workflow.sections.advanced_progress`

### Regression Coverage

Validated via:

- `frontend/src/components/issues/__tests__/RemediationPlanCard.workflow-visibility.test.tsx`
- `frontend/src/pages/__tests__/IssueDetailPage.tabs.test.tsx`

## Verification Evidence

- `cd frontend && npx tsc --noEmit` -> pass
- `cd frontend && npm run test:run -- IssueDetailPage RemediationPlanCard.workflow-visibility` -> pass
