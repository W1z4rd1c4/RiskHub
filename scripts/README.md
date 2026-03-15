# scripts

## Purpose

Operational and development automation for RiskHub.

## Supported entrypoints

- `./scripts/dev.sh`
  - Canonical local contributor startup.
  - Starts Docker-backed DB + Redis, performs local backend setup/schema preflight, and runs backend or backend+frontend locally.
- `./scripts/compose.sh`
  - Canonical Docker onboarding and packaged development startup.
  - Supports `up`, `down`, `logs`, and deterministic `reset`.
- `./scripts/deploy.sh`
  - Canonical production deployment/admin CLI.
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

- `./scripts/dev.sh` is local-only.
- `./scripts/compose.sh` is the only supported Docker development entrypoint.
- If the local database is behind the Alembic head, `./scripts/dev.sh` exits early and prints the recovery command:

```bash
cd backend
./venv/bin/alembic upgrade head
```

- Production deployment remains separate and must use `./scripts/deploy.sh`.

## Common verification commands

```bash
make -f scripts/Makefile verify-startup-scripts
make -f scripts/Makefile docs-topology-consistency
make -f scripts/Makefile security-contract-probe
```

Security probe outputs are written under `tests/results/security/`.
Documentation audit outputs are written under `tests/results/docs/`.
