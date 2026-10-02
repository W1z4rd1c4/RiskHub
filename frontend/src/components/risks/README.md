# frontend/src/components/risks

## Purpose

UI components for `risks` area.

## Contents

- `__tests__/`
- `detail-overview/`
- `RiskGroupMetaBody.tsx` — risk type / department / owner of a "grouped by
  risk" register card (Controls and KRIs registers, PG-31).
- `RiskPickerOption.tsx` — one selectable risk row in the Control and KRI
  "link a risk" pickers (`Button`, CSS-clamped description).
- `RiskStatusBadge.tsx` — `RiskStatusBadge` (translated `risks:status.*` on
  `Badge`, PG-03) and `RiskPriorityBadge` (named priority star, PG-46).
- `RiskDetailKriHistoryTab.tsx`
- `RiskDetailOverviewTab.tsx`
- `RiskDetailQuestionnairesTab.tsx` — the risk's questionnaire tab (`Card`,
  `CardHeader`, accent send `Button`): "sent" is a success toast, "an open
  questionnaire already exists" a warning `InlineMessage` (GAP-D-09).
- `QuestionnaireStatusBadge.tsx` — the one questionnaire status pill (tone and
  translated label from `lib/questionnaireStatus.ts`, PG-03 / PG-20), used by
  the tab, the history table, the questionnaire dialog and the approvals inbox.
- `QuestionnaireHistoryTable.tsx` — questionnaire history on `SortableTable`
  with named first-cell row activation (AX-02).
- `QuestionnaireAssessmentSummary.tsx` — latest submitted assessment (`dl`).
- `RiskQuestionnaireDetail.tsx` — re-export of `risk-questionnaire-detail/`.
- `riskQuestionnaireQuestions.ts`

## Notes

`RiskDetailOverviewTab.tsx` is the stable route-facing composition component for
the Risk detail overview. Focused sections live under `detail-overview/`,
including assessment matrices, summary cards, linked controls, linked vendors,
KRI cards, timestamps, and linked-control grouping helpers.

Risk-linked KRI and control cards in this area consume backend-derived
`monitoring_status` fields through shared display metadata rather than local
badge logic.

Keep this README updated when responsibilities or structure in this folder change.
