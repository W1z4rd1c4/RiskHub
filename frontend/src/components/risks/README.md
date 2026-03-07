# frontend/src/components/risks

## Purpose

UI components for `risks` area.

## Contents

- `__tests__/`
- `RiskDetailKriHistoryTab.tsx`
- `RiskDetailOverviewTab.tsx`
- `RiskDetailQuestionnairesTab.tsx`
- `RiskQuestionnaireDetail.tsx`
- `riskQuestionnaireQuestions.ts`

## Notes

`RiskDetailOverviewTab.tsx` owns the top summary cards on the Risk detail page,
including `Classification`, `Ownership`, and `Connections`.

Risk-linked KRI and control cards in this area consume backend-derived
`monitoring_status` fields through shared display metadata rather than local
badge logic.

Keep this README updated when responsibilities or structure in this folder change.
