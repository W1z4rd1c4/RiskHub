# Contributor Command and CI Contract

> **Owner**: RiskHub Maintainer  
> **Audience**: Contributors, reviewers, CI maintainers  
> **Change rule**: preserve command meaning or update this contract, its validator, and the PR evidence together

RiskHub keeps a broad internal automation surface because database, security,
release, migration, and evidence workflows have different operational needs.
Contributors should not need to discover that entire surface for ordinary work.

The stable façade is:

```bash
./scripts/riskhub.sh <command>
```

It delegates to existing supported scripts and `scripts/Makefile` targets. It
does not reimplement environment setup, tests, scanning, or release logic.

## Stable Commands

| Command | Canonical delegate | Meaning and side effects |
|---|---|---|
| `setup` | `./scripts/install.sh doctor --mode dev --repair` | Repairs dependency state, starts db-only infrastructure, and starts daemonized backend/frontend services. It does not reset application data. |
| `dev [options]` | `./scripts/install.sh dev [options]` | Starts the supported local contributor workflow. Options such as `--backend` are forwarded unchanged. |
| `lint` | `make -f scripts/Makefile lint lint-types` | Runs frontend lint/type/build/debt checks, backend Ruff/suppression checks, and backend mypy. |
| `test` | `make -f scripts/Makefile test` | Runs the default backend regression contract, excluding PostgreSQL-only and benchmark markers. This is not the narrower `test-fast` target. |
| `e2e` | `make -f scripts/Makefile test-e2e` | Runs the guarded Playwright matrix. `RISKHUB_E2E_TEST_DATABASE` and the `_test` database safeguards remain authoritative. |
| `release-check` | `make -f scripts/Makefile release-parity-audit` | Runs the full release-parity audit. The runtime audit stops local development processes and tears down the active Compose stack before exercising local, Compose, and production dry-run paths. It may interrupt an existing local environment and writes evidence under `tests/results/`. |
| `clean` | `make -f scripts/Makefile clean` | Runs Compose teardown with volumes, removes Python/pytest caches, all tracked-tree `node_modules` directories, `frontend/dist`, `backend/.coverage`, and `tests/results`. It intentionally keeps `backend/venv`. |
| `help` | façade help | Prints this stable command set and the advanced-target discovery command. |

Environment variables continue to pass through to the underlying command. The
façade does not supply alternate defaults, bypass safety checks, or reinterpret
exit codes.

## Advanced Surface

Use the internal target inventory only when the work requires a narrower or
specialized contract:

```bash
make -f scripts/Makefile help
```

Examples include PostgreSQL-only tests, architecture locks, documentation
topology checks, supply-chain audits, deployment verification, security probes,
and benchmark lanes. Those targets remain supported implementation interfaces,
but they are not added to the stable contributor façade unless they represent a
frequent end-to-end task with durable semantics.

## CI Gate Map

[`ci-gate-contract.json`](./ci-gate-contract.json) is the machine-readable source
for workflow path, job ID, display name, triggers, runtime budget, ownership, and
protected-branch status. `scripts/tools/validate_contributor_command_contract.py`
loads that file and verifies it against the actual workflow YAML. The table below
is its human-readable operational projection.

The runtime ranges are maintained review budgets, not SLAs. The owner should
review a budget when three consecutive successful runs exceed its upper bound;
product, security, and database coverage must not be removed merely to meet the
budget.

`Required` reflects the protected-`main` settings snapshot recorded during this
review. Workflow presence does not by itself make a job required, and a required
job must have a pull-request trigger that makes the check available on every PR.

| Check | Workflow | Execution lane | Budget | Required | First triage action |
|---|---|---|---|---|---|
| `Frontend Unit Tests` | `lint.yml` | PR + pushes to `main`/`develop` | 3–10 min | No | Run `cd frontend && npm run test:coverage`. |
| `Backend Quality` | `lint.yml` | PR + pushes to `main`/`develop` | 2–8 min | Yes | Run `./scripts/riskhub.sh lint`; isolate Ruff, mypy, or suppression failure. |
| `Frontend + Repo Contracts` | `lint.yml` | PR + pushes to `main`/`develop` | 6–15 min | Yes | Run the named failing command from `.github/workflows/lint.yml`. |
| `PR Merge Result Build` | `lint.yml` | PR only; workflow also exists on push | 2–6 min | Yes | Update/rebase the branch and reproduce the frontend build against the merge candidate. |
| `Backend SQLite Regression` | `backend-postgres.yml` | PR + pushes to `main`/`develop` | 8–20 min | No | Run `make -f scripts/Makefile test`. |
| `Backend Postgres Regression` | `backend-postgres.yml` | PR + pushes to `main`/`develop` | 20–35 min | No | Run `make -f scripts/Makefile test-postgres-ci` against the dedicated test database. |
| `Playwright E2E Tests` | `e2e.yml` | PR + pushes to `main`/`develop` + manual | 2–15 min | Yes | Download Playwright artifacts and reproduce with `./scripts/riskhub.sh e2e`. |
| `Production Profile Smoke` | `e2e.yml` | PR + pushes to `main`/`develop` + manual | 5–20 min | No | Inspect `prod-smoke-backend.log` and reproduce the production-profile startup. |
| `Docker Onboarding Smoke` | `startup-smoke.yml` | Every PR + pushes + schedule + manual | 8–20 min | Yes | Download `startup-smoke`, inspect Compose/service logs, and run the canonical onboarding path. |
| `Public Repo Hygiene` | `security.yml` | PR + pushes + schedule | 1–5 min | Yes | Run `make -f scripts/Makefile public-repo-hygiene`. |
| `Workflow Pin Validation` | `security.yml` | PR + pushes + schedule | 1–5 min | No | Run both workflow-pin and repository-hardening validators. |
| `Authorization Capability Contract` | `security.yml` | PR + pushes + schedule | 1–5 min | No | Run `python3 scripts/security/validate_authz_capability_contract.py --base-ref HEAD`. |
| `Python Security (Bandit + pip-audit)` | `security.yml` | PR + pushes + schedule | 3–12 min | No | Download Bandit/pip-audit JSON and separate code findings from dependency findings. |
| `Frontend Security (npm audit)` | `security.yml` | PR + pushes + schedule | 2–8 min | No | Run `cd frontend && npm audit --audit-level=high`. |
| `Frontend i18n (Parity + Hardcoded Scan)` | `security.yml` | PR + pushes + schedule | 2–8 min | No | Run `cd frontend && npm run i18n:test`. |
| `Container Scan (Trivy + SBOM Correlation)` | `security.yml` | PR + pushes + schedule | 8–25 min | No | Download container reports and distinguish frontend Trivy from backend Grype findings. |
| `Secrets Detection (Gitleaks)` | `security.yml` | PR + pushes + schedule | 1–5 min | No | Inspect the exact match and remove/rotate genuine secret material. |
| `Security Headers Verification` | `security.yml` | PR only; workflow also exists on push/schedule | 2–8 min | No | Run the security-header test module and inspect response headers. |
| `Docs Governance` | `maintenance-governance.yml` | Path-filtered PR + schedule + manual | 2–10 min | No | Run `make -f scripts/Makefile docs-topology-consistency`. |
| `Frontend Maintenance Contracts` | `maintenance-governance.yml` | Path-filtered PR + schedule + manual | 5–20 min | No | Run the debt, cleanup, and inline-style validators. |
| `Backend Maintenance (Informational)` | `maintenance-governance.yml` | Path-filtered PR + schedule + manual; non-blocking | 5–20 min | No | Review suppression, Ruff, and mypy evidence without treating the informational lane as a merge gate. |
| `Release Parity Contract` | `release-parity-pr.yml` | Manual dispatch only | 2–8 min | No | Run the docs, workflow-pin, hardening, and deprecated-import contract commands. |
| `Fast Parity Audit (Non-Blocking)` | `release-parity-fast.yml` | Push to `main` + schedule + manual; non-blocking | 20–60 min | No | Download the release-parity artifact and inspect the failing startup/dependency fingerprint. |

The full local `release-check` command is not equivalent to either hosted parity
job. It runs the comprehensive audit and has the disruptive local side effects
documented in the Stable Commands table.

## Change Policy

A change to this façade or CI map must:

1. remain a thin delegate to an existing canonical implementation;
2. preserve underlying environment variables, safety guards, and exit codes;
3. avoid adding a second implementation of test, install, or release logic;
4. update this document, `ci-gate-contract.json`, `CONTRIBUTING.md`, and
   `scripts/README.md` when their contract changes;
5. update the command-contract validator and tests;
6. reconcile workflow triggers, job names, and protected-branch settings so a
   required check is emitted on every applicable pull request;
7. explain any destructive or service-stopping side effects explicitly.

Specialized targets should remain internal unless contributors repeatedly need
the complete workflow and its semantics are stable enough to support as a
public contract.

## Validation

```bash
bash -n scripts/riskhub.sh
python3 scripts/tools/validate_contributor_command_contract.py
cd backend
venv/bin/pytest ../tests/backend/pytest/test_contributor_command_contract.py -q
```
