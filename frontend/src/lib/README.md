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
- `tones.ts` - semantic tone → class recipes (`TONE_CLASSES`, `toneClass`) and the status `BADGE_TONES`
- `riskScoreTheme.ts` - deprecated pre-D1 risk-score palette (medium = blue), kept until roadmap 2.11 (W7) moves its consumers to `severity.ts`; its score helper is `legacyRiskScoreVariantClass`, never the D1 `riskScoreVariantClass`
- `cssTokens.ts` - runtime CSS custom-property reads for canvas/SVG/Recharts (`getCssToken`, `readCssColor`, `useCssTokens`, `useCssThemeKey`)

## Notes

Keep this directory focused on reusable presentation and UI helper logic rather than page-specific component code.
