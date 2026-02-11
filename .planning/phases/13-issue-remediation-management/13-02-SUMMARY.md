# 13-02 Summary - Remediation Workflow, Notifications, and UI

## Delivered

### Workflow Engine and Endpoints

- Added workflow service in `backend/app/services/issue_workflow_service.py`:
  - deterministic issue/remediation transition guards
  - assignment, remediation start, progress updates, exception request/approval, close flow
  - activity log emission for all state mutations
- Added workflow endpoints in `backend/app/api/v1/endpoints/issues.py`:
  - `POST /issues/{id}/assign`
  - `POST /issues/{id}/start-remediation`
  - `POST /issues/{id}/update-progress`
  - `POST /issues/{id}/request-exception`
  - `POST /issues/{id}/approve-exception`
  - `POST /issues/{id}/close`

### Notifications and Scheduler

- Added issue notification enum values in:
  - `backend/app/models/notification.py`
  - `backend/app/schemas/notification.py`
- Added migration `backend/alembic/versions/13b1c2d3e4f6_add_issue_notification_types.py`.
- Implemented deadline/expiry notification service in `backend/app/services/issue_deadline_service.py`:
  - due-soon notifications
  - overdue notifications
  - high-severity escalation notifications
  - duplicate suppression fields
  - exception expiry handling and issue reopen semantics
- Registered issue deadline scheduler job in `backend/app/core/scheduler.py`.

### Frontend Workflow Surface

- Added issue types and API client:
  - `frontend/src/types/issue.ts`
  - `frontend/src/services/issuesApi.ts`
- Added issue page and workflow detail components:
  - `frontend/src/pages/IssuesPage.tsx`
  - `frontend/src/components/issues/IssueDetailPanel.tsx`
  - `frontend/src/components/issues/RemediationPlanCard.tsx`
- Wired routing/navigation:
  - `frontend/src/App.tsx` (`/issues` route)
  - `frontend/src/components/layout/Sidebar.tsx` (permission-gated Issues nav)
  - `frontend/src/pages/index.ts`
  - navigation locale keys in `frontend/src/i18n/locales/en/navigation.json` and `frontend/src/i18n/locales/cs/navigation.json`

### Test and Reliability Fixes During Execution

- Stabilized issue workflow/deadline tests for role-permission refresh and async loading behavior:
  - `backend/tests/api/v1/test_issue_workflow.py`
  - `backend/tests/test_issue_deadline_service.py`
  - `backend/tests/api/v1/test_issues_api.py`
- Fixed permission-loading path in deadline service to ensure `can_read_issue_id()` checks are accurate.

## Verification Evidence

- `cd backend && pytest -q tests/api/v1/test_issue_workflow.py` → pass
- `cd backend && pytest -q tests/test_issue_deadline_service.py` → pass
- `cd frontend && npx tsc --noEmit` → pass
