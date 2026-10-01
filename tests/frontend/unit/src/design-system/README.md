# tests/frontend/unit/src/design-system

Unit tests for design-system tokens. `statusTokenContrast.test.ts` verifies the
status color tokens meet color-contrast (accessibility) thresholds.
`sharedShellTextTokens.test.tsx` guards the shared shells (StepIndicator,
ReadAccessDeniedState, ArchiveConfirmDialog, SortableTable empty text) against raw
`text-white` / `text-slate-*` text colours (DS-01, DS-03).
`cssVarsDeclared.test.ts` asserts every `var(--x)` used in `frontend/src` (and
`tailwind.config.js`) is declared in a stylesheet under `frontend/src`, with a
justified allowlist for library runtime variables (DS-18).
