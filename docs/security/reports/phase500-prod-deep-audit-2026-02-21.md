# Phase 500 Production Deep-Dive Audit Report (2026-02-21 UTC)

## Result
- Decision: **NO-GO**
- Audit window:
  - Local start: `2026-02-22T00:17:20+0100`
  - UTC start: `2026-02-21T23:17:20Z`
- Evidence artifact root:
  - `tests/results/prod/deep-audit-20260222-001703`

### Blockers
| ID | Severity | Status | Owner lane | Summary |
|---|---|---|---|---|
| PH500-DA-001 | P0 | open | `scripts/prod` + backend scripts | Fresh deploy fails during DB bootstrap (`ModuleNotFoundError: No module named 'app'`) when `bootstrap_db.sh` runs seed scripts in the backend image. |
| PH500-DA-002 | P1 | open | frontend image/runtime | Frontend runtime image executes as `root` (effective UID 0). |
| PH500-DA-003 | P1 | open | `scripts/prod/setup.sh` | `setup.sh --dry-run --action exit` leaves temp env files with generated secrets on disk. |
| PH500-DA-004 | P1 | open | `scripts/prod/lib/preflight.sh` | Preflight accepts invalid frontend ports (`FRONTEND_HOST_PORT=70000`, `FRONTEND_CONTAINER_PORT=abc`), then `install_frontend.sh` fails later at `docker run`. |

### Verified Green Areas
1. Baseline production script verifier: pass (`verify-prod-install-scripts`).
2. Frontend auth-mode login tests: pass.
3. Backend auth/prod hardening slice: pass.
4. Replacement-aware preflight behavior:
   - strict mode blocks occupied frontend port.
   - allow mode warns and continues.
5. Backend image contract:
   - bootstrap scripts are present in runtime image.
   - backend runtime user is non-root (`riskhub`, uid `100`).
6. Security/supply-chain scan gates:
   - Trivy HIGH/CRITICAL: backend `0/0`, frontend `0/0`.
   - Grype HIGH/CRITICAL: backend `0/0`.
   - pip-audit: pass.
   - npm audit (`--audit-level=high`): pass.
   - targeted backend security/resilience tests: `12 passed`.
   - gitleaks scan: no leaks (parse-gate command was re-run with corrected invocation and passed).

## Findings

### PH500-DA-001 (P0) — Deploy chain breaks at bootstrap runtime
- Expected:
  - Phase 500 deploy completes migrations, seeds RBAC/departments, bootstraps admin/CRO, and proceeds to container install/smoke.
- Actual:
  - Deploy fails during bootstrap seeding before backend/frontend install.
  - `upgrade`, `rollback`, post-rollback smoke, and `setup --action upgrade --dry-run` then fail because no successful install exists.
- Key evidence:
  - Script call chain:
    - `scripts/prod/bootstrap_db.sh:138`
    - `scripts/prod/bootstrap_db.sh:141`
    - `scripts/prod/bootstrap_db.sh:144`
  - Seed script import dependency:
    - `backend/scripts/seed_roles_permissions.py:12`
  - Runtime failure trace:
    - `tests/results/prod/deep-audit-20260222-001703/logs/16_lifecycle_deploy.log:187`
    - `tests/results/prod/deep-audit-20260222-001703/logs/16_lifecycle_deploy.log:190`
  - Lifecycle RC summary:
    - `tests/results/prod/deep-audit-20260222-001703/reports/05_lifecycle_rc.txt`

### PH500-DA-002 (P1) — Frontend runtime is root
- Expected:
  - Runtime container should run with a non-root user for production hardening.
- Actual:
  - Built frontend image runs as uid `0` / user `root`.
- Key evidence:
  - Dockerfile creates user but has no `USER` switch:
    - `frontend/Dockerfile:39`
    - `frontend/Dockerfile:54`
  - Runtime probe:
    - `tests/results/prod/deep-audit-20260222-001703/logs/13_frontend_runtime_user.log`

### PH500-DA-003 (P1) — Setup dry-run leaves secret-bearing temp env files
- Expected:
  - Dry-run should not leave generated secret env files after exit.
- Actual:
  - A new `riskhub-setup.*` temp directory remains with `backend.env` and `frontend.env` (`0600`), containing generated secrets.
- Key evidence:
  - Cleanup only removes local staging files, not dry-run destination temp files:
    - `scripts/prod/setup.sh:585`
    - `scripts/prod/setup.sh:593`
    - `scripts/prod/setup.sh:643`
  - Residual temp dir and file modes:
    - `tests/results/prod/deep-audit-20260222-001703/reports/03_setup_dryrun_tempdir_contents.txt`
  - Log redaction check (no literal DB/secret leak to stdout):
    - `tests/results/prod/deep-audit-20260222-001703/reports/03_setup_dryrun_leak_scan.txt`

### PH500-DA-004 (P1) — Preflight misses invalid frontend port semantics
- Expected:
  - Preflight should reject invalid frontend host/container ports before install.
- Actual:
  - Preflight passes both:
    - `FRONTEND_HOST_PORT=70000`
    - `FRONTEND_CONTAINER_PORT=abc`
  - Downstream `install_frontend.sh` then fails with Docker port validation errors.
- Key evidence:
  - Current preflight only checks host port numeric, not range, and does not validate container port:
    - `scripts/prod/lib/preflight.sh:122`
    - `scripts/prod/lib/preflight.sh:125`
  - Preflight matrix RCs:
    - `tests/results/prod/deep-audit-20260222-001703/reports/02_preflight_matrix_rc.txt`
  - Downstream install failures:
    - `tests/results/prod/deep-audit-20260222-001703/logs/09b_install_frontend_invalid_host_range.log`
    - `tests/results/prod/deep-audit-20260222-001703/logs/09c_install_frontend_invalid_container_port.log`
  - `install_frontend.sh` consumes `FRONTEND_CONTAINER_PORT` directly in `docker run -p`:
    - `scripts/prod/install_frontend.sh:77`
    - `scripts/prod/install_frontend.sh:99`

## Evidence Map

### Baseline and auth readiness
1. RC summary:
   - `tests/results/prod/deep-audit-20260222-001703/reports/01_baseline_rc.txt`
2. Logs:
   - `tests/results/prod/deep-audit-20260222-001703/logs/01_verify_prod_install_scripts.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/02_frontend_login_auth_tests.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/03_backend_auth_prod_tests.log`

### Script-chain and preflight behavior
1. Static chain anchors:
   - `tests/results/prod/deep-audit-20260222-001703/reports/02_script_chain_static_evidence.txt`
2. Preflight matrix RCs/logs:
   - `tests/results/prod/deep-audit-20260222-001703/reports/02_preflight_matrix_rc.txt`
   - `tests/results/prod/deep-audit-20260222-001703/logs/04_preflight_strict_occupied.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/05_preflight_allow_occupied.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/06_preflight_invalid_host_range.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/07_preflight_invalid_container_port.log`

### Setup dry-run secret handling
1. RC and temp-dir diff evidence:
   - `tests/results/prod/deep-audit-20260222-001703/reports/03_setup_dryrun_secret_hygiene.txt`
2. Residual file mode evidence:
   - `tests/results/prod/deep-audit-20260222-001703/reports/03_setup_dryrun_tempdir_contents.txt`
3. Log redaction evidence:
   - `tests/results/prod/deep-audit-20260222-001703/reports/03_setup_dryrun_leak_scan.txt`

### Image/runtime contracts
1. RC summary:
   - `tests/results/prod/deep-audit-20260222-001703/reports/04_image_contract_rc.txt`
2. Backend scripts + runtime user:
   - `tests/results/prod/deep-audit-20260222-001703/logs/10_backend_scripts_presence.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/11_backend_runtime_user.log`
3. Frontend runtime user:
   - `tests/results/prod/deep-audit-20260222-001703/logs/13_frontend_runtime_user.log`

### Lifecycle simulation
1. RC summary:
   - `tests/results/prod/deep-audit-20260222-001703/reports/05_lifecycle_rc.txt`
2. Deploy failure trace:
   - `tests/results/prod/deep-audit-20260222-001703/logs/16_lifecycle_deploy.log`
3. Follow-on failures:
   - `tests/results/prod/deep-audit-20260222-001703/logs/17_lifecycle_upgrade.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/18_lifecycle_rollback.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/19_lifecycle_smoke_after_rollback.log`
   - `tests/results/prod/deep-audit-20260222-001703/logs/20_setup_upgrade_dryrun_existing_install.log`

### Security and supply-chain
1. RC summaries:
   - `tests/results/prod/deep-audit-20260222-001703/reports/06_security_supply_chain_rc.txt`
   - `tests/results/prod/deep-audit-20260222-001703/reports/06b_security_gate_corrections_rc.txt`
2. Counts:
   - `tests/results/prod/deep-audit-20260222-001703/reports/06_security_supply_chain_counts.txt`
3. Raw scanner outputs:
   - `tests/results/prod/deep-audit-20260222-001703/reports/trivy-backend.json`
   - `tests/results/prod/deep-audit-20260222-001703/reports/trivy-frontend.json`
   - `tests/results/prod/deep-audit-20260222-001703/reports/sbom-backend.json`
   - `tests/results/prod/deep-audit-20260222-001703/reports/grype-backend.json`
   - `tests/results/prod/deep-audit-20260222-001703/reports/gitleaks-report.json`

### Docs/runtime cross-check anchors
1. Deployment flow guarantees:
   - `docs/deployment/external-postgres-install-scripts.md:122`
   - `docs/deployment/installation-manual.md:219`
2. Setup dry-run expectations:
   - `docs/deployment/installation-manual.md:113`
3. Security hardening policy:
   - `docs/deployment/security-checklist.md:40`

## Immediate Next Patch Set (P0/P1 Only)
1. **Fix PH500-DA-001 (P0)**:
   - Update bootstrap invocation so seed scripts run with import-safe module resolution (for example `python -m scripts.seed_roles_permissions`, `python -m scripts.seed_departments`, `python -m scripts.bootstrap_sso_user`) or explicitly inject `PYTHONPATH=/app` for bootstrap script runs.
   - Add a regression contract test that executes one bootstrap script in-container (not just file existence) with a minimal reachable DB fixture.
2. **Fix PH500-DA-002 (P1)**:
   - Move frontend runtime to non-root execution and validate nginx can bind the configured container port safely.
   - Add an image contract check in `verify-prod-install-scripts` for frontend runtime user (`id -u != 0`).
3. **Fix PH500-DA-003 (P1)**:
   - In `setup.sh` cleanup, remove dry-run target files (`$BACKEND_ENV`, `$FRONTEND_ENV`) when they point to generated `riskhub-setup.*` temp paths, then remove the temp directory.
   - Add regression test/assertion for zero new `riskhub-setup.*` dirs after `--dry-run --action exit`.
4. **Fix PH500-DA-004 (P1)**:
   - Extend `preflight_frontend_env` to validate:
     - `FRONTEND_HOST_PORT` numeric and within `1..65535`
     - `FRONTEND_CONTAINER_PORT` (if provided) numeric and within `1..65535`
   - Add script-contract tests covering invalid host/container port rejection.

## Limitations
1. Real Entra tenant login flow was not executed; auth verification relied on unit/integration test slices and production-mode endpoint behavior.
2. External PostgreSQL validation used a disposable local Postgres container exposed on host port and reached from containers via `host.docker.internal` (staging-like, not real infra).
3. The lifecycle scenario intentionally used synthetic env values; results are deployment-path correctness findings, not tenant-specific integration certification.
4. A pre-existing local container (`riskhub-db`) was present and left untouched.

