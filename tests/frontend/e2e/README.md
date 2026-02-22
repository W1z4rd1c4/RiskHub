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
