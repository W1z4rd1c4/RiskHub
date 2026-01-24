# Phase 14-06 Summary — CRO batch send in Risk Hub

## Backend

Added CRO-only batch endpoint:
- `POST /api/v1/riskhub/questionnaires/batch-send`
- Module: `backend/app/api/v1/endpoints/riskhub_questionnaires.py`

Behavior:
- `select_all=false` → uses explicit `risk_ids`
- `select_all=true` → resolves risks by filters `{ department_id?, process?, category?, status? }` (archived excluded)
- Skips:
  - `skipped_no_owner` for risks without `owner_id`
  - `skipped_open_exists` when an open questionnaire already exists
- Returns summary: `created_count`, skip lists, and `errors[]`

Tests:
- `backend/tests/api/v1/test_riskhub_questionnaires.py`

## Frontend

Added a CRO-only Risk Hub tab and panel:
- `frontend/src/pages/RiskHubPage.tsx` (new tab)
- `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx`

UI supports:
- filters (department/process/category/status)
- selection per risk, plus “select all (filters)”
- batch send + results summary

