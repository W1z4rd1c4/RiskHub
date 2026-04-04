# RiskHub Tests

Centralized test and artifact tree for backend pytest, frontend Vitest/Playwright, and generated verification output.

## Layout

- `backend/`
  - backend pytest suite and API/service regression coverage
- `frontend/`
  - Playwright E2E suite and frontend unit/integration harness config
- `results/`
  - ignored generated outputs from CI, docs audits, frontend quality scripts, Playwright, and release-readiness runs

## Notes

- source tests stay versioned; generated artifacts under `results/` do not
- frontend audit outputs now live under `results/quality/frontend/`
- Playwright browser artifacts live under `results/frontend/playwright/`

See `../docs/TESTING.md` for the active test matrix and required verification packs.
