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
| `lint` | `make -f scripts/Makefile lint` | Runs the canonical frontend and backend lint contract. |
| `test` | `make -f scripts/Makefile test` | Runs the default backend regression contract, excluding PostgreSQL-only and benchmark markers. This is not the narrower `test-fast` target. |
| `e2e` | `make -f scripts/Makefile test-e2e` | Runs the guarded Playwright matrix. Existing `RISKHUB_E2E_TEST_DATABASE` and test-database safeguards remain authoritative. |
| `release-check` | `make -f scripts/Makefile release-parity-audit` | Runs the release-parity audit and evidence workflow. This is intentionally the highest-cost command in the façade. |
| `clean` | `make -f scripts/Makefile clean` | Destructively removes local containers, volumes, dependency directories, caches, and generated test output. |
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

The table maps each principal check family to its owner, execution lane,
operational runtime budget, purpose, and first triage action. Individual jobs
may be split for concurrency and evidence retention; the workflow file remains
the executable source.

The runtime ranges are maintained operational budgets based on recent hosted
runner behavior, including the 2026-08-23 review runs. They are not SLAs. The
owner should review the budget when three consecutive successful runs exceed
the upper bound; product, security, and database coverage must not be removed
merely to meet the budget.

| Check family | Primary owner | Execution lane | Runtime budget | Purpose | First triage action |
|---|---|---|---|---|---|
| `Lint / Frontend Unit Tests` | Frontend | Every PR and pushes to `main`/`develop` | 3–10 min | Coverage and unit regression floor | Re-run `cd frontend && npm run test:coverage`; inspect the test and coverage output. |
| `Lint / Backend Quality` | Backend | Every PR and pushes to `main`/`develop`; required on protected `main` | 2–8 min | Ruff, mypy, and suppression-budget enforcement | Run `./scripts/riskhub.sh lint`; isolate Ruff, mypy, or budget failure. |
| `Lint / Frontend + Repo Contracts` | Repository | Every PR and pushes to `main`/`develop`; required on protected `main` | 6–15 min | Frontend lint/type/build plus repository and production-document contracts | Run the named failing command from `.github/workflows/lint.yml`; do not bypass the contract. |
| `Lint / PR Merge Result Build` | Frontend/release | PR synthetic merge result; required on protected `main` | 2–6 min | Detects integration failure against the exact merge candidate | Rebase/update the branch, then run the frontend build against the merge result. |
| `Backend Postgres` | Backend/data | Every PR and pushes to `main`/`develop` | 20–35 min | Migration, locking, and database-truth behavior | Provision the dedicated test database and run `make -f scripts/Makefile test-postgres-ci`. |
| `Playwright E2E Tests` | Product/QA | Every PR and pushes to `main`/`develop`; required on protected `main` | 2–15 min | Cross-tier user-flow verification | Download Playwright artifacts, reproduce with `./scripts/riskhub.sh e2e`, and preserve the database guard. |
| `Security / Public Repo Hygiene` | Security/repository | Every PR and pushes to `main`/`develop`; required on protected `main` | 1–5 min | Prevents tracked path, privacy, and public-repository leaks | Run `make -f scripts/Makefile public-repo-hygiene`; inspect the exact offending path. |
| `Security Scanning` | Security | Every PR, pushes to `main`/`develop`, and scheduled runs | 5–25 min | SAST, dependency, container, secret, authorization, and header controls | Open the failing job, download its machine-readable artifact, and distinguish a product finding from infrastructure failure. |
| `Docker Onboarding Smoke` | Deployment/operations | Every PR and pushes to `main`/`develop`; required on protected `main` | 8–20 min | Public install/startup and container-health contract | Run the startup verification named in `.github/workflows/startup-smoke.yml`; inspect container logs. |
| `Release Parity` | Release owner | Release-relevant PRs, release candidates, and manual verification | 45–120 min | Verifies startup, dependency, image, and release evidence parity | Run `./scripts/riskhub.sh release-check`; preserve the generated evidence and exact candidate identity. |
| `Maintenance Governance` | Maintainer | Schedule and manual dispatch | 5–20 min | Detects documentation, dependency, policy, and maintenance drift | Follow the failing maintenance report; fix the source contract rather than the generated symptom. |

The current protected-`main` required-check list is a repository setting, not a
workflow-file guarantee. At the time of this contract it includes Playwright
E2E Tests, Docker Onboarding Smoke, Public Repo Hygiene, Frontend + Repo
Contracts, Backend Quality, and PR Merge Result Build. Any settings change must
update this map in the same administrative change record.

## Change Policy

A change to this façade must:

1. remain a thin delegate to an existing canonical implementation;
2. preserve underlying environment variables, safety guards, and exit codes;
3. avoid adding a second implementation of test, install, or release logic;
4. update this document, `CONTRIBUTING.md`, and `scripts/README.md` in the same pull request;
5. update the command-contract validator and tests;
6. explain whether CI check names or branch-protection configuration require a
   corresponding administrative update.

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
