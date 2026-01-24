# Phase 14 Research: Risk Assessments (Questionnaires)

## Goal (from user)
Add a **Risk Assessment Questionnaire** feature, per-risk, that Risk Managers and CRO can **send** to the Risk Owner (and Department Head can also submit). The Risk detail page gets a 3rd tab next to **Overview** and **KRI History** showing the questionnaire inbox + history. Add in-app notifications, basic workflow visibility, localization (EN/CS), and activity logging.

## Existing system patterns to reuse

### RBAC / scoping
- Department scoping utilities live in `backend/app/core/permissions.py` (`get_user_department_ids`, `check_department_access`, `is_privileged_user`).
- Role names are standardized in `backend/app/models/role.py` (`RoleType.CRO`, `RoleType.RISK_MANAGER`, `RoleType.DEPARTMENT_HEAD`, etc.).

### Notifications
- Model: `backend/app/models/notification.py` stores `type`, `title`, `message`, `resource_type`, `resource_id`.
- Preferences: `User.notification_preferences` JSON + UI in Settings already exists.
- Notification creation is centralized in `backend/app/services/notification_service.py`.
- KRI “due soon/overdue/breach” logic runs in background services (see `backend/app/services/kri_deadline_service.py`) and is a good blueprint for questionnaire reminders.
- Users have `preferred_language` in DB (`backend/app/models/user.py`), so scheduled notifications can be localized per user at creation time.

### Activity Log
- Activity logging helper: `backend/app/core/activity_logger.py` + enums in `backend/app/models/activity_log.py`.
- Adding a new entity type is straightforward (extend `ActivityEntityType`) and keeps questionnaire events auditable.

### Frontend risk detail tabs
- Risk detail tabs are implemented in `frontend/src/pages/RiskDetailPage.tsx` with `activeTab` (currently `overview` and `history`).
- KRI history tab component: `frontend/src/components/risks/RiskDetailKriHistoryTab.tsx` is a styling reference for the new Questionnaire tab.

### Localization
- Frontend translations live in `frontend/src/i18n/locales/{en,cs}/*.json`.
- Backend translations live in `backend/app/i18n/{en.py,cs.py}` and can be used for notification strings and API messages.

## Proposed product behavior (decisions)

### Questionnaire lifecycle
- States: `sent` → `in_progress` → `submitted`
  - `sent` is created immediately on “Send questionnaire”.
  - First time the assignee opens it, backend marks it `in_progress` (optional, but supports “pending vs in progress” badges).
  - `submitted` is final; assignee cannot edit afterwards.
- Due date: `sent_at + 15 days`.
- Reminders:
  - “Due soon” notification at **7 days before** due date.
  - “Overdue” notification when due date passes.

### Permissions
- Anyone who can access the Risk can **view** questionnaires/history for that risk.
- Only Risk Owner **or** Department Head can **submit** the questionnaire.
- Only Risk Manager or CRO can **start/send** questionnaires (single-risk send from the Risk page; batch send in Risk Hub for CRO).

### History UI
- Risk detail “Risk Assessment” tab shows:
  - Status banner for “current” questionnaire (if one is open).
  - A grid/table of historical questionnaire instances (most recent first), each row opening the read-only detail view (or submission form if open & assignee).
  - Badges: Pending (sent), In progress, Submitted, Overdue.

### Questions (v1)
Keep the initial scope simple and consistent with a per-risk reassessment:
- About the risk change: “Has the risk description changed?”, “Any new triggers/causes?”, “Any recent incidents/loss events?”
- Controls: “Are existing controls still effective?”, “Any control gaps or failures?”
- KRIs: “Any new/changed indicators?”, “Have thresholds been breached recently?”
- Outlook: “Expected trend next quarter”, “Proposed mitigation actions”

Implementation strategy for localization:
- Store questions as **stable keys** (e.g., `risk_assessment.q1_description_changed`) + input type metadata.
- Render localized question labels on the frontend via i18n JSON for EN/CS.

## Data model (recommended)
Prefer “template key + version” with immutable instances:
- `RiskQuestionnaire` (instance): `risk_id`, `assigned_to_user_id`, `sent_by_user_id`, `status`, `sent_at`, `due_at`, `submitted_at`, `submitted_by_user_id`, `template_key`, `template_version`, `answers_json`, `last_reminded_at?`.

This supports:
- Full history (each send = new instance)
- Read-only after submission
- Easy batch send (create instances in loop with RBAC + skip logic)

## Open items to clarify later (not blocking planning)
- Whether multiple open questionnaires per risk are allowed (default plan assumes **at most one** open per risk).
- Whether “Department Head can submit” means only when in the same department as the risk (assumed yes).

