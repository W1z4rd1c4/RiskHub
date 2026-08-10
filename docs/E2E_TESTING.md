# RiskHub E2E Testing Guide

> **Version**: 1.6
> **Last Updated**: 2026-08-03
> **Audience**: QA, Engineering
> **Source of Truth**: `frontend/playwright.config.ts`, `tests/frontend/e2e/`, `tests/frontend/contracts/dora-e2e-requirements.json`, `frontend/package.json`

This guide covers Playwright execution, suite organization, and deterministic test prerequisites.

## Quick Start

```bash
cd frontend
npm run e2e
```

Useful variants:

```bash
npm run e2e:ui
npm run e2e:headed
npm run e2e:report
npm run e2e:business-logic
npm run e2e:dora:collect
npx playwright install chromium
```

## Prerequisites

1. Backend API running at `http://localhost:8000`.
2. Frontend app running at `http://localhost:5173`, or Docker nginx at `http://localhost/` with `FRONTEND_URL=http://localhost`.
3. Deterministic fixture data seeded for E2E when required by suite expectations.

Canonical startup guidance:

- [`docs/development/README.md`](./development/README.md)
- Playwright still defaults to the local Vite frontend on `http://localhost:5173`
- Docker full-stack at `http://localhost/` is for onboarding/manual verification unless `FRONTEND_URL` is overridden

## Suite Topology

Primary suite groups in `tests/frontend/e2e/`:

- Core app: `auth`, `dashboard`, `risks`, `controls`, `kris`, `vendors`, `admin`
- Business logic packs:
  - `approval-workflows/`
  - `permissions/`
  - `sensitive-fields/`
  - `cross-department/`
  - `entity-ownership/`
  - `activity-logging/`
- Focus suites: `issues-workflow`, `issues-contextual-create`, `settings-isolation`, `navigation-stability`, `questionnaires`

## ICT Governance Acceptance Matrix

The #91 release acceptance uses the deterministic test dataset and the
following public browser seams:

| Acceptance behavior | Primary Playwright evidence |
|---|---|
| CISO stewardship, Threat lifecycle, reassignment, and permission-safe linked-Risk context | `threats.spec.ts`, `threat-register-framework.spec.ts`, `roles-access.spec.ts` |
| Process ownership and protected create/edit/relationships | `processes.spec.ts`, `process-register-framework.spec.ts`, `approval-workflows/governed-process-*.spec.ts` |
| Asset dual ownership, protected mutation, and Composite cascade | `assets.spec.ts`, `asset-register-framework.spec.ts`, `approval-workflows/governed-asset.spec.ts`, `approval-workflows/governed-process-relationships.spec.ts` |
| Protected Vendor accountability, approval-gated archive with direct restore, and protected Contract edit/archive | `vendors.spec.ts`, `vendor-register-framework.spec.ts`, `approval-workflows/governed-vendor.spec.ts`, `vendor-contracts.spec.ts` |
| Department drill-down under a locked Department filter | `department-register-drilldown.spec.ts`, `department-access.spec.ts` |
| Requester/approver separation and scenario resolution | `approval-workflows/self-approval.spec.ts`, `approval-workflows/status-flow.spec.ts`, `permissions/approvals-access.spec.ts` |

### Fail-closed DORA coverage contract

```bash
cd frontend
npm run e2e:dora:collect
```

The command reads `tests/frontend/contracts/dora-e2e-requirements.json` and
dynamically collects the Playwright `ci` project with `--list`; it does not pin
a historical suite size. Validation fails for malformed or duplicate
requirements/evidence, unsafe or missing spec paths, required specs containing
`skip`/`fixme`, uncollected evidence, or title fragments that do not resolve to
exactly one collected test.

`dora-locale-journeys.spec.ts` automates representative English and Czech
register and governed-approval journeys. Controlled labels must remain
language-pure while user-entered free text remains unchanged.

The ten-persona demo-picker desktop layout, including the CISO card in a
five-column by two-row grid, remains a separate manual visual seam and must not
be reported as automated evidence.

## Deterministic Seed Workflow

One-command deterministic reset + full seed (recommended):

```bash
./scripts/install.sh demo --reset test
```

This wipes Docker dev volumes, reruns migrations + base demo seed, then adds deterministic E2E fixtures:

- `python -m app.db.seed` (base demo data)
- `python -m scripts.seed_e2e_all` (deterministic E2E fixtures)

For a fresh database, seed baseline + E2E entities:

```bash
cd backend
venv/bin/python -m app.db.seed
venv/bin/python -m scripts.seed_e2e_all
```

Rules:

- E2E seed scripts must not create duplicate role/department identity records.
- Deterministic entities are consumed by fixtures and page-object selectors.
- The underlying advanced/manual reset command remains `./scripts/compose.sh reset --dataset test`.

## Docker Full-Stack Verification

Preferred deterministic reset:

```bash
./scripts/install.sh demo --reset test
```

Current behavior:

- `./scripts/install.sh demo --reset test` is the preferred deterministic browser-verification path.
- The underlying advanced/manual command remains `./scripts/compose.sh reset --dataset test`, which now completes end to end on the Docker stack.
- The Docker bootstrap service uses the backend `dbtasks` target, so migrations and seed commands run with the required Postgres client dependencies.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.

Preflight:

```bash
curl -fsS http://localhost:8000/api/v1/readyz
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/auth/config
curl -I -fsS http://localhost/login
```

Docker-targeted Playwright commands:

```bash
cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

Current Docker-origin truth:

- Docker full-stack browser runs should use `FRONTEND_URL=http://localhost`.
- The shared login helper in [`tests/frontend/e2e/helpers/login.ts`](../tests/frontend/e2e/helpers/login.ts) now waits on post-login pathnames instead of a hardcoded `localhost:5173` origin, so the same helper works against both Vite and Docker nginx surfaces.
- Targeted verification on 2026-03-29 passed for:
  - `access-scope.spec.ts --grep "GLOBAL user can see all departments in department list"`
  - `polish-audit.spec.ts --grep "RISK_MANAGER / theme=riskhub / lang=en"`

Current automation scope:

- `polish-audit.spec.ts` automates `riskhub`, `light`, and `dark`.

## Running Targeted Packs

Examples:

```bash
cd frontend
npx playwright test -c playwright.config.ts ../tests/frontend/e2e/cross-department --project=chromium
npx playwright test -c playwright.config.ts ../tests/frontend/e2e/permissions --project=chromium
npx playwright test -c playwright.config.ts ../tests/frontend/e2e/entity-ownership/risk-ownership.spec.ts --project=chromium
```

## Debugging

```bash
cd frontend
npx playwright test -c playwright.config.ts --debug
PWDEBUG=1 npx playwright test -c playwright.config.ts
npx playwright test -c playwright.config.ts --trace on
npx playwright show-trace ../tests/results/frontend/playwright/test-results/<run>/placeholder-zip-017.zip
```

## CI Notes

- Use deterministic data and avoid hidden test coupling between suites.
- Prefer targeted reruns for fast triage before full suite reruns.
- Persist Playwright artifacts (`junit`, traces, HTML report) for failed runs.
- Docker-targeted local runs also write artifacts under `tests/results/frontend/playwright/`.

## Exit Criteria for E2E Changes

- Modified E2E specs pass locally for touched suites.
- No regression in role-scoped access and docs audience behavior.
- Report artifacts are inspectable when failures occur.
