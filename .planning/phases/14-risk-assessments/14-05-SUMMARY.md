# Phase 14-05 Summary — Questionnaire detail + submission form (v1 questions)

## v1 question set

Defined stable v1 question metadata in:
- `frontend/src/components/risks/riskQuestionnaireQuestions.ts`

Template: `risk_owner_reassessment@v1`

Required keys enforced by UI:
- `risk_assessment.q1_description_changed`
- `risk_assessment.q4_controls_effective`
- `risk_assessment.q8_outlook_trend`
- `risk_assessment.q9_mitigation_actions`

## Form UX

- Detail UI implemented as a modal:
  - `frontend/src/components/risks/RiskQuestionnaireDetail.tsx`
- Read-only when status is `submitted` (answers shown but inputs disabled).
- Editable when open and caller is Risk Owner or Department Head for the risk’s department.
- Actions:
  - “Save progress” → PATCH draft
  - “Submit” → POST submit (client-side required validation)

## Localization

Question labels, section titles, and select options added in:
- `frontend/src/i18n/locales/en/risks.json`
- `frontend/src/i18n/locales/cs/risks.json`

