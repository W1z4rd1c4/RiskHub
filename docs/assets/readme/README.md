# README Screenshot Assets

## Purpose

These images support the root `README.md` and GitHub repository presentation. They should show real RiskHub screens from deterministic demo data, not hand-made mockups.

## Capture Command

Start a clean demo stack first:

```bash
./scripts/install.sh demo --reset test
```

Then capture the README assets:

```bash
cd frontend
CAPTURE_README_SCREENSHOTS=1 FRONTEND_URL=http://localhost npx playwright test -c playwright.config.ts ../tests/frontend/e2e/readme_screenshots.spec.ts --project=chromium
```

The screenshot spec is opt-in. Normal Playwright runs skip it so CI does not rewrite tracked image files.

If the backend is running on a nonstandard local port, add `VITE_DEV_API_TARGET=http://localhost:<port>` to the capture command.

## Asset Manifest

| File | Source | Demo account | README use |
|---|---|---|---|
| `hero-dashboard.png` | `/` | Petra Svobodova, Risk Manager | Opening dashboard visual |
| `risk-register.png` | `/risks` | Petra Svobodova, Risk Manager | Risk operating loop |
| `risk-detail-linked-work.png` | first seeded risk detail | Petra Svobodova, Risk Manager | Linked risk context |
| `vendor-linked-context.png` | first seeded vendor detail | Petra Svobodova, Risk Manager | Third-party risk context |
| `approvals-workflow.png` | `/approvals` | Petra Svobodova, Risk Manager | Approval workflow |
| `governance-queue.png` | `/governance` | Anna Kowalski, CRO | Governance resolution |
| `risk-hub-configuration.png` | `/risk-hub` | Anna Kowalski, CRO | Risk Hub configuration |
| `admin-console-ops.png` | `/admin` | System Admin | Admin operations |
| `social-preview.png` | `/` | Petra Svobodova, Risk Manager | GitHub social preview |

## Regeneration Rules

- Regenerate these assets when README copy references a changed screen or when the UI layout materially changes.
- Use the deterministic demo dataset so filenames stay stable and screenshots remain reproducible.
- Do not include secrets, local-only tokens, browser chrome, terminal output, or fabricated data.
- If a seeded page is empty or visually misleading, adjust the capture target or remove that README image instead of staging a weak screenshot.
- After regeneration, inspect every image before committing.
