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
- `humanizeCode.ts` - `humanizeCode(code)`: readable fallback ("Risk update") for a machine code without a translation, plus `translateCode(t, prefix, code)`, which translates `<prefix>.<code>` and falls back to the humanized code (GAP-D-02)
- `kriUnits.ts` - `formatKriUnitName(unit, t)` ("Days") and `formatKriUnit(unit, t, value)` ("5 dní"): translated KRI unit labels; `%`, currencies and unknown units pass through (GAP-D-03)
- `roleLabels.ts` - `getRoleLabel(role, t)`: translated name of a seeded RBAC role code (`common:roles.*`), humanized fallback for custom roles; the code stays the filter value (GAP-D-06)
- `cssTokens.ts` - runtime CSS custom-property reads for canvas/SVG/Recharts (`getCssToken`, `readCssColor`, `useCssTokens`, `useCssThemeKey`)
- `closedListLabels.ts` - `closedListLabel(t, list, code)` / `closedListOptions(t, lists, list)`: translated display labels (`common:values.closed_lists.<List>.<slug>`) for the ICT Register workbook closed-list codes; the stored code stays the value and is the fallback label (GAP-C-09, PM-4)

## Notes

Keep this directory focused on reusable presentation and UI helper logic rather than page-specific component code.
