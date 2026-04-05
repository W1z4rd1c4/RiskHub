# frontend/src/pages/login

## Purpose

Login-route support components and hooks extracted from `LoginPage.tsx`.

## Contents

- `DemoLoginView.tsx`
  - Demo/hybrid login surface.
- `SsoOnlyView.tsx`
  - Production SSO-only login surface.
- `LoginStateViews.tsx`
  - Loading/unavailable/not-configured states.
- `useAuthConfigLoader.ts`
  - Auth-config loading and retry hook.
- `useLoginActions.ts`
  - Demo login and SSO-start action hook.
- `useProdLoginMetadata.ts`
  - Production document-title/lang updates.

## Notes

- Keep `LoginPage.tsx` focused on URL parsing and top-level branching.
- `sanitizeReturnTo` stays in `frontend/src/services/authRedirect.ts`.
