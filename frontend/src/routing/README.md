# frontend/src/routing

## Purpose

Route manifest definitions and route metadata for the RiskHub frontend application.

## Contents

- `admin.tsx`
- `business.tsx`
- `core.tsx`
- `index.ts`
- `public.tsx` — pre-auth routes (`/login`, SSO callback, `/landing`, native `/auth/local/*`); no guards
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

- **Route guards (NAV-05): one owner per route.** A route whose whole page is gated by a single boolean
  `Authz` flag (`canViewGovernance`, `canViewActivityLog`, `canViewUsersRoute`, `isPlatformAdmin`,
  `canViewAdminConsole`, `canReadControls` for `/audit-trail`) wraps its `element` in the named guard
  from `frontend/src/authz/BusinessRouteGuards.ts`. The guard renders `ReadAccessDeniedState` (the
  `AccessDeniedState` primitive) and the page component must not repeat the check: no `if (!authz.canX)`
  early return at the top of a routed page that already has a route guard. New guards are one more
  `createBusinessRouteGuard('<authzKey>')` export there, applied in this folder's manifest. In-page
  checks remain for partial access (a readable page that hides a tab or action) and for denials returned
  by the API (`AccessDeniedState`). Client-side guards are UX only; the backend capability checks stay
  authoritative.

Keep this README updated when responsibilities or structure in this folder change.
