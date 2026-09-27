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

The pre-fix light/English/1024px browser run measured white-on-white KRI and
approval headings and owner names at 1.00:1; white notes and questionnaire
Save/Close on the composited 3%-black-on-white surface at 1.068:1; white Approve
on `rgb(16,185,129)` at 2.537:1; and blue Submit on its 20% blue surface at
2.944:1. The regression asserts actual rendered ratios (4.5:1 text, 3:1 icons),
not utility class names.
