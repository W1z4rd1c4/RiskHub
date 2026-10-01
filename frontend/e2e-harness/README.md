# frontend/e2e-harness

Browser-only harnesses used by Playwright to mount real production components
with deterministic fixture props. The harness is served by Vite in tests but is
not part of the production Rollup inputs.

The `workflow-contrast.html` harness mounts the KRI history, approval resolution,
risk ownership, and questionnaire action families for #175. Its Playwright suite
checks real computed foreground/background stacks, contrast, hover, focused and
entered inputs, selected owners, validation, pending locks and read-only actions.
The matrix covers English/Czech, Light/RiskHub/Dark, and 1024/1440px desktop.
Run it without a backend or fixture reset from `frontend/`:

```sh
npx playwright test -c playwright.workflow-contrast.config.ts --workers=2
```

The same spec runs in the normal `ci` browser project. Computed-pair attachments
are test artifacts; the isolated harness does not replace the strict live-route
accessibility gates or establish full WCAG conformance.

`theme-rendered-contrast.spec.ts` (G-RENDER) reuses this harness and
`dialog-contract.html` to count sub-AA text per theme and surface against
`tests/frontend/e2e/rendered-contrast-baseline.json`; it runs under the same
config (see `docs/E2E_TESTING.md`).

The pre-fix light/English/1024px browser run measured white-on-white KRI and
approval headings and owner names at 1.00:1; white notes and questionnaire
Save/Close on the composited 3%-black-on-white surface at 1.068:1; white Approve
on `rgb(16,185,129)` at 2.537:1; and blue Submit on its 20% blue surface at
2.944:1. The regression asserts actual rendered ratios (4.5:1 text, 3:1 icons),
not utility class names.

The `access-check.html` harness mounts the real New Risk route for #179, with
production API client/schema validation and API responses intercepted in
`creation-access-check.spec.ts`. It covers capability and linked-vendor read
failures independently, pending/keyboard retries, successful admission, safe
404 denial, and the same EN/CS × three-theme × two-desktop-width matrix.
Run with `npx playwright test -c playwright.access-check.config.ts --workers=2`.
These fixture-backed checks do not replace authenticated live-route acceptance.
## KRI history pagination

`../playwright.kri-history.config.ts` runs the production KRI detail route against
intercepted, bounded 75-entry API fixtures; it does not mount copied page markup.
Run `npx playwright test -c playwright.kri-history.config.ts --workers=1 --retries=0`
from `frontend/`. It uses port 5183 without a live backend or fixture reset. The
12 EN/CS × RiskHub/Light/Dark × 1024/1440px journeys verify pending/failed/retried
continuation, subset/date/comparison windows, keyboard focus, URL history/reload,
older correction identity, calendar dates in America/Los_Angeles, distinct
403/404 outcomes, and strict-zero axe checks on the changed history
surface. API interception verifies UI transport, not server authorization;
backend history and correction contracts retain their existing test coverage.
