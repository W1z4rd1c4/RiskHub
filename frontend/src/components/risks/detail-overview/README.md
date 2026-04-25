# frontend/src/components/risks/detail-overview

## Purpose

Focused risk detail overview sections for assessment, summary cards, linked controls, linked KRIs, linked vendors, and timestamps.

## Contents

- `RiskAssessmentSection.tsx`
- `RiskKriSection.tsx`
- `RiskLinkedControlsSection.tsx`
- `RiskLinkedVendorsSection.tsx`
- `RiskSummaryCards.tsx`
- `RiskTimestamps.tsx`
- `riskOverviewHelpers.ts`

## Notes

Keep `RiskDetailOverviewTab` as the public composition component. Helpers should remain pure and covered by focused tests when grouping or count rules change.
