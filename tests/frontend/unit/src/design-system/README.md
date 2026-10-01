# tests/frontend/unit/src/design-system

Unit tests for design-system tokens. `statusTokenContrast.test.ts` verifies the
status color tokens meet color-contrast (accessibility) thresholds, and covers the
UI-contract token families (`tint`, `overlay`, `severity-high*`, `chart-1…8`,
`heat-0…4`, `nav-active`, `badge-count`) in all three themes: AA for text and
fill/foreground pairs, 3:1 for chart series, a monotonic heat scale.
`sharedShellTextTokens.test.tsx` guards the shared shells (StepIndicator,
ReadAccessDeniedState, ArchiveConfirmDialog, SortableTable empty text) against raw
`text-white` / `text-slate-*` text colours (DS-01, DS-03).
`cssVarsDeclared.test.ts` asserts every `var(--x)` used in `frontend/src` (and
`tailwind.config.js`) is declared in a stylesheet under `frontend/src`, with a
justified allowlist for library runtime variables (DS-18); each allowlist entry
names its package and the test proves that package's installed build sets it.
`severityConsistency.test.tsx` asserts every severity mapping derives from
`lib/severity.ts` + `lib/tones.ts` on one token family per band (D1), that
risk-score bands follow the configured thresholds (ADR-008), that adapter
modules never export a same-named helper with a different value, that every
adapter (issue pills, DORA criticality / vendor tier pills, 1-5 ordinal ratings,
chart severity series) resolves each band to its D1 token family, and that the
legacy palettes (`useStatusTheme`, `riskScoreTheme`, the `useChartTheme` hex
tables) stay deleted (roadmap 2.11).
