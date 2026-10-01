# frontend/src/lib

## Purpose

Shared frontend UI helpers and presentation utilities used across pages and components.

## Contents

- `approvalUi.ts`
- `executionResult.ts`
- `monitoringStatus.ts`
- `utils.ts`
- `kriHistory.ts` - bounded history page size and calendar-date presentation
- `severity.ts` - the single D1 severity scale (low/medium/high/critical → success/warning/severity-high/danger), risk-score bands from configured thresholds (ADR-008), DORA criticality and vendor tier mappings, heat-cell classes
- `questionnaireStatus.ts` - the one risk-questionnaire status → tone + label map shared by the risk detail tab and the approvals inbox
- `tones.ts` - semantic tone → class recipes (`TONE_CLASSES`, `toneClass`) and the status `BADGE_TONES`
- `cssTokens.ts` - runtime CSS custom-property reads for canvas/SVG/Recharts (`getCssToken`, `readCssColor`, `useCssTokens`, `useCssThemeKey`)

## Notes

Keep this directory focused on reusable presentation and UI helper logic rather than page-specific component code.
