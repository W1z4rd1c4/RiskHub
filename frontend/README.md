# RiskHub Frontend

## Purpose

RiskHub frontend is a React 19 + TypeScript SPA built with Vite. It owns the authenticated shell, route rendering, business/admin UI, theme and language preferences, and browser-side API orchestration for the backend.

## Entry Points

- `src/main.tsx`
  - Bootstraps React and mounts the SPA.
- `src/App.tsx`
  - Owns the provider stack and renders the protected/public route tree from `src/routing/`.
- `playwright.config.ts`
  - Canonical Playwright config for browser E2E execution.
- `vitest.config.ts`
  - Canonical Vitest config for unit/integration tests.

## Architecture

- Routing
  - Route metadata lives in `src/routing/`.
  - `App.tsx` keeps `BrowserRouter`, `Routes`, auth gating, and layout composition only.
  - `Sidebar.tsx` consumes shared route/nav metadata instead of maintaining its own route list.
- Providers
  - `QueryClientProvider` for server-state caching.
  - `AuthProvider` for user/bootstrap/session state.
  - `ThemeProvider` for `riskhub`, `light`, and `dark` themes.
  - `DashboardFilterProvider` for shell-scoped dashboard filters.
- Auth and authz
  - Auth bootstrap lives in `src/contexts/AuthContext.tsx`.
  - Business/admin visibility contracts are derived through `src/authz/policy.ts`, `src/authz/useAuthz.ts`, and route guards in `src/authz/BusinessRouteGuards.tsx`.
  - Backend remains authoritative; frontend mirrors access rules for UX and navigation.
- Data access
  - Shared HTTP client lives in `src/services/apiClient.ts`.
  - Domain APIs stay in `src/services/*Api.ts`.
  - `@tanstack/react-query` is used for polling and data refresh where local state is not sufficient.
- UI composition
  - Route-level views live in `src/pages/`.
  - Shared UI and domain widgets live in `src/components/`.
  - Translation resources live in `src/i18n/`.

## Commands

```bash
cd frontend
npm run dev
npm run lint
npx tsc --noEmit
npm run test:run
npm run e2e
npm run e2e:business-logic
```

Targeted browser runs use the local config:

```bash
cd frontend
npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

## Quality Gates

- Type safety: `npx tsc --noEmit`
- ESLint: `npm run lint`
- Debt budget JSON: `npm run quality:debt -- --report-json`
- Dead-code audit: `npm run cleanup:deadcode`
- Build gate: `npm run build`
- Accessibility/browser smoke: Playwright specs under `tests/frontend/e2e/`

Generated frontend quality outputs are written under `tests/results/quality/frontend/` and Playwright artifacts under `tests/results/frontend/playwright/`.

## Notes

- Keep user-facing UI free of raw numeric database IDs; use human-readable names/codes instead.
- Keep route/authz declarations in sync with `src/routing/` and backend permission contracts.
- Keep this README updated when the provider stack, routing model, or test entrypoints change.
