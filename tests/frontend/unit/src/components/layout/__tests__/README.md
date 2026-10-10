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
- `MainLayout.test.tsx` — app-shell route contract (audit 2026-09-30 §4.14, NAV-01, NAV-04): the routed
  page renders in `main`, the polite route announcer stays empty on first load, a pathname change focuses
  the new page `h1` and announces the translated `document.title`, and a lazy page's first load shows
  `LoadingState` inside the shell with the sidebar still mounted.
- `useRouteFocus.test.tsx` — the focus/announce hook behind `MainLayout`: no focus move on first render,
  waits for a late `h1`, follows a state-shell `h1` replaced by the record `h1`, ignores search-param
  (in-page tab) changes.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
