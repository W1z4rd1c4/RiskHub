# Phase 14-04 Summary — Risk detail tab + questionnaire history grid

## Frontend additions

- Added API client + types:
  - `frontend/src/services/riskQuestionnairesApi.ts`
  - `frontend/src/types/riskQuestionnaire.ts`
- Added Risk Detail tab:
  - `frontend/src/pages/RiskDetailPage.tsx` now includes an “Risk Assessment” tab
  - `frontend/src/components/risks/RiskDetailQuestionnairesTab.tsx` renders:
    - current open questionnaire badge (Pending / In progress / Overdue)
    - history table (newest first via backend ordering)
    - row click opens detail view
- RM/CRO “Send questionnaire” CTA:
  - role-gated in `RiskDetailQuestionnairesTab`
  - disabled if the risk has no owner

## Badge logic

- `Overdue` if `due_at < now` and status is not `submitted`.
- Otherwise:
  - `sent` → Pending
  - `in_progress` → In progress
  - `submitted` → Submitted

## Localization

Added EN/CS keys in:
- `frontend/src/i18n/locales/en/risks.json`
- `frontend/src/i18n/locales/cs/risks.json`

