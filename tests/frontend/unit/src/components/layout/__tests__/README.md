# tests/frontend/unit/src/components/layout/__tests__

## Purpose

Folder for `tests/frontend/unit/src/components/layout/__tests__` implementation assets.

## Contents

- `SidebarPolling.test.tsx`
- `AuthFrame.test.tsx` — public/pre-auth frame contract (audit 2026-09-30 §4.20, DS-24): `BrandWordmark`
  name, `LanguageSwitch` group + `aria-pressed`, `AuthFrame` main landmark, focused `h1` + `document.title`,
  OS colour-scheme theme scope without an explicit app theme vs. the stored / signed-in app theme (D14,
  PM decision), focused error alert, busy content with an announced (never busy) status line and local
  language switching.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
