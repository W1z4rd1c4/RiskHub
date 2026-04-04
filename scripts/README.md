# scripts

## Purpose

Operational and development automation for RiskHub.

## Supported entrypoints

- `./scripts/install.sh`
  - Public first-run and lifecycle installer for demo, local contributor, and guided production flows.
  - Covers `production`, `upgrade`, `status`, `logs`, `doctor`, and `verify` on top of the lower-level script layer.
- `./scripts/dev.sh`
  - Advanced/manual local contributor startup.
  - Starts Docker-backed DB + Redis, performs local backend setup/schema preflight, and runs backend or backend+frontend locally.
- `./scripts/compose.sh`
  - Advanced/manual Docker onboarding and packaged development startup.
  - Supports `up`, `down`, `logs`, and deterministic `reset`.
- `./scripts/deploy.sh`
  - Advanced/manual production deployment/admin CLI used underneath `./scripts/install.sh production`, `upgrade`, `status`, `logs`, `doctor`, and `verify`.
- `make -f scripts/Makefile <target>`
  - Convenience wrapper around the supported scripts above plus validation/test helpers.

## Directory map

- `deploy/`
  - Shared library helpers used by `./scripts/deploy.sh`.
- `prod/`
  - Retained internal production runtime/install helpers behind the supported deploy CLI.
- `security/`
  - Security probes, parity audits, and resilience harnesses.
- `tools/`
  - Documentation topology, README coverage, and repository guard utilities.
- `quality/`
  - Quality-budget configuration and related support files.
- `release/`
  - Release packaging helpers.
- `runtime-artifacts/`
  - Generated/runtime-owned artifacts tracked by dedicated README guidance.

## Notable standalone utilities

- `check_docs_contract.py`
  - Enforces documentation frontmatter and topology rules.
- `run_playwright_with_watchdog.sh`
  - Wraps Playwright execution with artifact/watchdog handling.
- `verify_security_headers.py`
  - Verifies expected security headers for deployed/frontend targets.

## Startup notes

- `./scripts/install.sh` is the public first-run entrypoint.
- `./scripts/dev.sh` is local-only.
- `./scripts/compose.sh` remains the advanced/manual Docker development entrypoint.
- If the local database is behind the Alembic head, `./scripts/dev.sh` exits early and prints the recovery command:

```bash
cd backend
./venv/bin/alembic upgrade head
```

- Production deployment remains separate and is guided through `./scripts/install.sh production` or the lower-level `./scripts/deploy.sh`.
- Day-2 production lifecycle is wrapper-first through `./scripts/install.sh status`, `logs`, `doctor`, and `upgrade`.

## Common verification commands

```bash
make -f scripts/Makefile verify-startup-scripts
make -f scripts/Makefile docs-topology-consistency
make -f scripts/Makefile security-contract-probe
```

Security probe outputs are written under `tests/results/security/`.
Documentation audit outputs are written under `tests/results/docs/`.
