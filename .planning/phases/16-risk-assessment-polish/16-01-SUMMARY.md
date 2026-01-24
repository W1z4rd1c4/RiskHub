# 16-01 — Review flow (compare vs last cycle + clarification requests)

## Template contract (v1 + v2)

**Template key:** `risk_owner_reassessment`

### v1 keys

- `risk_assessment.q1_description_changed` *(required)*
- `risk_assessment.q2_new_triggers`
- `risk_assessment.q3_recent_incidents`
- `risk_assessment.q4_controls_effective` *(required)*
- `risk_assessment.q5_control_gaps`
- `risk_assessment.q6_kri_changes`
- `risk_assessment.q7_kri_breaches`
- `risk_assessment.q8_outlook_trend` *(required)*
- `risk_assessment.q9_mitigation_actions` *(required)*
- `risk_assessment.q10_support_needed`

### v2 keys

v2 = v1 + two quantified required answers:

- `risk_assessment.q11_likelihood_12m` *(required, int 1–5)*
- `risk_assessment.q12_worst_case_impact` *(required, int 1–5)*

UI note: In the questionnaire modal, these are rendered as dropdowns showing `1–5` with the same label/description text used on the Risk create/edit scoring step (and impact includes the derived financial loss range).

## Previous cycle selection rule

**“Previous cycle” = previous submitted questionnaire for the same risk:**

- If the current questionnaire is **submitted**: pick the row with the greatest `submitted_at` that is strictly **before** the current `submitted_at`.
- If the current questionnaire is **not submitted**: pick the row with the greatest `submitted_at` overall (latest submitted).

Exposed via `GET /api/v1/questionnaires/{id}?include_previous=true` as `previous_submission` (`{id, submitted_at, template_version, answers}`) or `null`.

## Compare UI (“Compare to last cycle”)

- Toggle in questionnaire detail modal.
- Default: OFF.
- Loads `include_previous=true` when enabled.
- Diff logic:
  - Compare only keys in the active template’s question set (v1 vs v2).
  - Normalize strings by trimming whitespace.
  - Treat `null`/`undefined`/`""` as “missing”.
  - Show previous value only when the previous value exists and is different.

## Clarifications (per section, single reply)

### Data model

Table: `risk_questionnaire_clarifications`

- `questionnaire_id` (FK)
- `section_key` (matches FE section `titleKey`)
- `question_keys` (optional JSON list)
- `request_message`, `requested_by_user_id`, `requested_at`
- `response_message` (nullable), `responded_by_user_id` (nullable), `responded_at` (nullable)

### API

- `POST /api/v1/questionnaires/{id}/clarifications` (CRO/Risk Manager only; submitted questionnaires only)
- `GET /api/v1/questionnaires/{id}/clarifications` (any user who can read the questionnaire)
- `POST /api/v1/questionnaires/{id}/clarifications/{clarification_id}/respond` (Risk Owner only; single response enforced)

### Notifications

- Added `NotificationType.QUESTIONNAIRE_CLARIFICATION_REQUESTED`
- Sent to the questionnaire assignee (Risk Owner) when a clarification is requested.
