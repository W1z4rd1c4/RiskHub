# Phase 14-02 Summary — Questionnaire API + RBAC

## Routes

Added `backend/app/api/v1/endpoints/risk_questionnaires.py` and wired it in `backend/app/api/v1/router.py`:
- `GET /api/v1/risks/{risk_id}/questionnaires`
- `POST /api/v1/risks/{risk_id}/questionnaires/send`
- `GET /api/v1/questionnaires/{questionnaire_id}`
- `PATCH /api/v1/questionnaires/{questionnaire_id}/draft`
- `POST /api/v1/questionnaires/{questionnaire_id}/submit`
- `GET /api/v1/questionnaires/inbox`

## RBAC / scoping

Implemented shared rules in `backend/app/services/risk_questionnaire_service.py`:
- Send: role in `{risk_manager, cro}`
- Submit/draft: Risk Owner OR Department Head for the risk’s department
- Risk access: requires underlying Risk visibility (department-scoped; returns 404 for out-of-scope risks)

Lifecycle rules:
- Send enforces “at most one open questionnaire per risk” (409 if open exists).
- Draft/submit only allowed for `sent`/`in_progress`; submitted is immutable (409).
- Submit validates a minimal `v1` required key set.

## Tests

Added `backend/tests/api/v1/test_risk_questionnaires.py` covering:
- out-of-scope access
- send permissions + owner-required
- single-open enforcement
- submit permissions + post-submit immutability
- inbox behavior (owner vs department head)

