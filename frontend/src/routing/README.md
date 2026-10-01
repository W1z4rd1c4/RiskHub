# frontend/src/routing

## Purpose

Route manifest definitions and route metadata for the RiskHub frontend application.

## Contents

- `admin.tsx`
- `business.tsx`
- `core.tsx`
- `index.ts`
- `types.ts`

## Notes

- A route with a sidebar entry declares `nav`; a route without one (detail, New/Edit and hub-linked
  pages) is highlighted through its `nav` parent by prefix (`/risks/42` → `/risks`) or, when its path is
  not nested under the parent, through `activeNavHref` (`/audit-trail` and `/vendor-reports` →
  `/evidence`, audit 2026-09-30 NAV-02). `resolveActiveSidebarHref` returns `null` when that parent is not
  visible to the user.
- Every routed page renders one title source (`PageHeader`, `EntityDetailHeader`, `RegisterListShell`,
  `EditBlockedState`, `AuthFrame`, or `usePageTitle`) so it has one `h1` and a translated
  `document.title`; `tests/frontend/unit/src/routing/__tests__/routePageTitleContract.test.ts` enforces it.

Keep this README updated when responsibilities or structure in this folder change.
