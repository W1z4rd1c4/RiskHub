# Phase 14-01 Summary — Questionnaire schema + models

## Data model

Added `RiskQuestionnaire` (`backend/app/models/risk_questionnaire.py`) to represent a single “sent questionnaire” instance for a Risk (immutable history via new row per send).

`risk_questionnaires` columns:
- `id` (PK)
- `risk_id` (FK → `risks.id`)
- `assigned_to_user_id` (FK → `users.id`)
- `sent_by_user_id` (FK → `users.id`)
- `status` (`sent` | `in_progress` | `submitted`)
- `template_key`, `template_version`
- `answers` (JSON, nullable)
- `sent_at`, `due_at`, `submitted_at` (tz-aware)
- `submitted_by_user_id` (FK → `users.id`, nullable)
- `created_at`, `updated_at` (tz-aware)

Indexes:
- `(risk_id, status)` — `ix_risk_questionnaires_risk_status`
- `(assigned_to_user_id, status)` — `ix_risk_questionnaires_assignee_status`
- `(due_at, status)` — `ix_risk_questionnaires_due_status`

## Schemas

Added `backend/app/schemas/risk_questionnaire.py` with:
- `RiskQuestionnaireStatusEnum`
- `RiskQuestionnaireListItemRead`
- `RiskQuestionnaireRead`
- `RiskQuestionnaireDraftUpdate`
- `RiskQuestionnaireSubmit`

## Migration

Alembic migration: `a14b0c9d1e2f_add_risk_questionnaires.py`

