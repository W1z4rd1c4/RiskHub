# backend/app/services/_risk_questionnaires

## Purpose

Internal helpers for risk questionnaire policy, loading, validation, and workflow actions.

## Contents

- `policy.py` - capability and actor checks.
- `repository.py` - questionnaire loading helpers.
- `validation.py` - template and answer validation.
- `workflow.py` - lifecycle, clarification, and reminder actions.

## Notes

Keep `backend/app/services/risk_questionnaire_service.py` as the compatibility facade. Changes here need questionnaire API tests and notification/reminder coverage.
