# RiskHub E2E Testing Guide

> **Version**: 1.1
> **Last Updated**: 2026-02-16
> **Audience**: QA, Engineering
> **Source of Truth**: `frontend/playwright.config.ts`, `frontend/e2e/`, `frontend/package.json`

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
```

## Prerequisites

1. Backend API running at `http://localhost:8000`.
2. Frontend app running at `http://localhost:5173` (or Playwright web server configured in `playwright.config.ts`).
3. Deterministic fixture data seeded for E2E when required by suite expectations.

## Suite Topology

Primary suite groups in `frontend/e2e/`:

- Core app: `auth`, `dashboard`, `risks`, `controls`, `kris`, `vendors`, `admin`
- Business logic packs:
  - `approval-workflows/`
  - `permissions/`
  - `sensitive-fields/`
  - `cross-department/`
  - `entity-ownership/`
  - `activity-logging/`
- Focus suites: `issues-workflow`, `issues-contextual-create`, `settings-isolation`, `navigation-stability`, `questionnaires`

## Deterministic Seed Workflow

For a fresh database, seed baseline + E2E entities:

```bash
cd backend
venv/bin/python -m app.db.seed
venv/bin/python -m scripts.seed_e2e_all
```

Rules:

- E2E seed scripts must not create duplicate role/department identity records.
- Deterministic entities are consumed by fixtures and page-object selectors.

## Running Targeted Packs

Examples:

```bash
cd frontend
npx playwright test e2e/cross-department --project=chromium
npx playwright test e2e/permissions --project=chromium
npx playwright test e2e/entity-ownership/risk-ownership.spec.ts --project=chromium
```

## Debugging

```bash
cd frontend
npx playwright test --debug
PWDEBUG=1 npx playwright test
npx playwright test --trace on
npx playwright show-trace test-results/<run>/placeholder-zip-017.zip
```

## CI Notes

- Use deterministic data and avoid hidden test coupling between suites.
- Prefer targeted reruns for fast triage before full suite reruns.
- Persist Playwright artifacts (`junit`, traces, HTML report) for failed runs.

## Exit Criteria for E2E Changes

- Modified E2E specs pass locally for touched suites.
- No regression in role-scoped access and docs audience behavior.
- Report artifacts are inspectable when failures occur.
