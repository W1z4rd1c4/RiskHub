# tests/frontend/unit/src/routing/__tests__

## Purpose

Focused Vitest assertions for frontend route manifests and routing contracts.

## Contents

- `routingManifest.test.ts`
- `routePageTitleContract.test.ts` — Phase 2 exit criterion (audit 2026-09-30 §5.4, D7, NAV-01): every
  lazily routed page reaches a title source (`PageHeader`, `EntityDetailHeader`, `RegisterListShell`,
  `EditBlockedState`, `AuthFrame`/`NativeFrame` or `usePageTitle`), and a raw `<h1>` exists only in the
  title primitives and documented whole-route fallbacks.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
