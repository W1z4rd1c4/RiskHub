# Frontend E2E Tests (`tests/frontend/e2e`)

## Purpose

End-to-end coverage for user-facing flows, RBAC behavior, and deterministic production-critical workflows.

## Conventions

- Prefer resilient selectors (`getByRole`, `getByTestId`) over brittle text/DOM-coupled selectors.
- Keep assertions locale-agnostic for translatable surfaces:
  - avoid hardcoded localized labels unless that label is the explicit contract under test;
  - use stable invariants (URL, presence/absence of controls, deterministic record IDs, ISO date input values).
- Export dialog contract for deterministic list pages (`controls`, `risks`, `kris`, `vendors`):
  - dialog is CSV-only;
  - format chooser controls are intentionally absent;
  - tests should submit export with `csv` and assert dialog closes.

## Deterministic Data Baseline

Playwright global setup validates fixture health before tests run (risks, controls, KRIs, vendors, SLAs, approvals). Keep tests aligned with those seeded entities.

## Targeted Run Command

```bash
cd frontend
npx playwright test -c ../tests/frontend/e2e/playwright.config.ts \
  ../tests/frontend/e2e/controls.spec.ts \
  ../tests/frontend/e2e/risks.spec.ts \
  ../tests/frontend/e2e/navigation-stability.spec.ts \
  ../tests/frontend/e2e/questionnaires.spec.ts \
  ../tests/frontend/e2e/kris.spec.ts \
  ../tests/frontend/e2e/vendors.spec.ts \
  ../tests/frontend/e2e/polish-audit.spec.ts \
  --project=chromium
```

## Docker Full-Stack Run

Use the Docker-served frontend when you want the app exactly as served at `http://localhost/`:

```bash
./scripts/compose.sh reset --dataset test

cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c ../tests/frontend/e2e/playwright.config.ts \
  ../tests/frontend/e2e/polish-audit.spec.ts \
  --project=chromium
```

Notes:

- Playwright artifacts are written under `tests/results/frontend/playwright/`.
- `polish-audit.spec.ts` currently covers `riskhub` and `light`.
- `dark` theme still requires manual verification.
- Docker-origin runs should set `FRONTEND_URL=http://localhost`. The shared demo-login helper in [`/Users/stefanlesnak/Antigravity/Risk App 2/tests/frontend/e2e/helpers/login.ts`](./helpers/login.ts) now keys off post-login paths instead of a hardcoded `localhost:5173` origin, so the same helper works against both local Vite and Docker nginx surfaces.
