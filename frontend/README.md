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

## Theme interface

`src/index.css` defines the same semantic interface for RiskHub, light, and dark themes; `tailwind.config.js` exposes it to components. Components select a meaning from this inventory and do not reinterpret literal colors per theme.

| Meaning | CSS pair or value | Tailwind interface |
| --- | --- | --- |
| Base | `--background` / `--foreground` | `bg-background text-foreground` |
| Card | `--card` / `--card-foreground` | `bg-card text-card-foreground` |
| Popover | `--popover` / `--popover-foreground` | `bg-popover text-popover-foreground` |
| Nested surface | `--nested` / `--nested-foreground` | `bg-nested text-nested-foreground` |
| Glass surface | `--glass` / `--glass-foreground` | `bg-glass text-glass-foreground` or `.glass` |
| Muted surface and copy | `--muted` / `--muted-foreground` | `bg-muted text-muted-foreground` |
| Accent fill and opaque hover | `--accent` / `--accent-hover` / `--accent-foreground` | `bg-accent hover:bg-accent-hover text-accent-foreground` |
| Accent on an ordinary surface | `--accent-text` | `text-accent-text` |
| Success fill and standalone text | `--success` / `--success-foreground`; `--success-text` | `bg-success text-success-foreground`; `text-success-text` |
| Warning fill and standalone text | `--warning` / `--warning-foreground`; `--warning-text` | `bg-warning text-warning-foreground`; `text-warning-text` |
| Destructive fill | `--destructive` / `--destructive-foreground` | `bg-destructive text-destructive-foreground` |
| Information fill | `--info` / `--info-foreground` | `bg-info text-info-foreground` |
| Decorative border | `--border` | `border-border` |
| Input boundary | `--input` | `border-input` |
| Focus indication | `--ring` | `ring-ring` |
| Meaningful muted icon | `--icon-muted` | `text-icon-muted` |

Literal `white` remains literal white. Use `accent-foreground` on an accent fill and `accent-text` on ordinary surfaces. Base `.glass-card` surfaces are static; an actionable card must opt into `.interactive-card`. User-readable copy is at least 12px (`text-xs`). Two bounded counters may remain at 10px: abbreviated permissions and their overflow count (`data-testid="permission-summary-badge"`), and the numeric linked-risk count (`data-testid="control-linked-risk-count"`). Reduced-motion behavior is owned by the global `prefers-reduced-motion` rule and Framer Motion configuration in `App.tsx`.

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
  - Alternate root: `npm run quality:debt -- --root /abs/path/to/frontend --report-json`
- Dead-code audit: `npm run cleanup:deadcode`
- Build gate: `npm run build`
- Accessibility/browser smoke: Playwright specs under `tests/frontend/e2e/`

Generated frontend quality outputs are written under `tests/results/quality/frontend/` and Playwright artifacts under `tests/results/frontend/playwright/`.

## Notes

- Keep user-facing UI free of raw numeric database IDs; use human-readable names/codes instead.
- Keep route/authz declarations in sync with `src/routing/` and backend permission contracts.
- Keep this README updated when the provider stack, routing model, or test entrypoints change.
