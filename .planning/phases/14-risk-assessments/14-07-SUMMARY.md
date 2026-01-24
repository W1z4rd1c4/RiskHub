---
phase: 14-risk-assessments
plan: 14-07
title: End-to-end verification (tests + Playwright)
date: 2026-01-24
---

## Completed

### Backend tests
- Added/ran questionnaire notification + reminder coverage:
  - `backend/tests/api/v1/test_risk_questionnaires_notifications.py`
- Verified questionnaire lifecycle + RBAC + CRO batch send still pass:
  - `backend/tests/api/v1/test_risk_questionnaires.py`
  - `backend/tests/api/v1/test_riskhub_questionnaires.py`

### Playwright E2E
- Added and verified an end-to-end flow test:
  - `frontend/e2e/questionnaires.spec.ts`
- Coverage: CRO creates risk → sends questionnaire → owner submits → CRO sees notification for the created risk.

## Verification commands

Backend:
- `cd backend && pytest -q tests/api/v1/test_risk_questionnaires_notifications.py`
- `cd backend && pytest -q tests/api/v1/test_risk_questionnaires.py tests/api/v1/test_riskhub_questionnaires.py`

Frontend E2E:
- `cd frontend && npx playwright test -g "questionnaire workflow" --project=ci`

## Notes
- Full `pytest -q` may still fail due to unrelated pre-existing test collection issues; the questionnaire-focused suites above pass.

