# frontend/src/pages/login

## Purpose

Login-route support components and hooks extracted from `LoginPage.tsx`.

## Contents

- `DemoLoginView.tsx`
  - Demo/hybrid login surface (wide `AuthFrame` card, persona grid).
- `AccountButton.tsx`
  - One demo persona as an outline `Button` card.
- `SsoOnlyView.tsx`
  - Production SSO-only login surface; the standalone `ProdLoginPreviewPage`
    renders the same view with its preview-only notes (GAP-B-01).
- `LoginStateViews.tsx`
  - Loading/unavailable/not-configured states.
- `prodAuthCopy.ts` / `loginPageTypes.ts`
  - Production-login copy mapping (never the preview-only keys) and shared types.
- `useAuthConfigLoader.ts`
  - Auth-config loading and retry hook.
- `useLoginActions.ts`
  - Demo login and SSO-start action hook.
- `useProdLoginMetadata.ts`
  - Production document-title/lang updates.

## Notes

- Every view renders on the shared public frame (`components/layout/AuthFrame`):
  one `<main>`, the wordmark, the CS / EN switch and the OS colour scheme (D14);
  tokens and `ui` primitives only, no bespoke palette.
- The production SSO view drives the frame's language switch with the login's
  own fixed-language copy; `LoginPage` follows `languageChanged`, so a switch
  made on the loading, error or demo view carries over to the SSO copy.

- Keep `LoginPage.tsx` focused on URL parsing and top-level branching.
- `sanitizeReturnTo` stays in `frontend/src/services/authRedirect.ts`.

- `LoginPage` owns completed demo/native session redirects. Its existing-session
  redirect never overwrites the destination in an explicit login response.
- Public auth routes sit outside the principal query boundary so signing in does
  not remount login/callback code during the transition; protected data retains
  the principal boundary and is cleared when leaving that scope.
