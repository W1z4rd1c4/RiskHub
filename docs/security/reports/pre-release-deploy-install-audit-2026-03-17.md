# Pre-Release Deployment And Installation Deep Review (2026-03-17)

## Result
- Decision: **NO-GO**
- Run ID: `20260317T143939Z`
- Review artifact root: `tests/results/pre-release-deploy-install-review-20260317T143939Z`
- Supporting parity artifacts:
  - `tests/results/release-parity-audit-20260317T143939Z-skip`
  - `tests/results/release-parity-audit-20260317T143939Z-full`
- Overall release status is `NO-GO` for two independent reasons:
  - unresolved High findings remain on the current supported deployment surface
  - the mandatory Linux production wave was not executed live on a Linux host

## Scope

Supported surfaces reviewed:

- production `./scripts/deploy.sh --target docker`
- production `./scripts/deploy.sh --target linux`
- development/onboarding `./scripts/compose.sh`
- local contributor `./scripts/dev.sh`

Execution summary:

| Surface | Evidence type | Status |
|---|---|---|
| `docker` production | shared gates, direct CLI dry-run reproduction, parity artifacts, prod-readiness harness attempt | **blocked by High findings** |
| `linux` production | local `init`, negative preflight checks on macOS | **incomplete, no live Linux validation** |
| `compose.sh` | help/runtime/manual checks, parity full-stack evidence | **usable with one Medium CLI bug** |
| `dev.sh` | help/runtime/manual checks, parity cross-check | **no confirmed script defect** |

Automated baseline executed:

- `make -f scripts/Makefile verify-prod-install-scripts`
- `make -f scripts/Makefile verify-startup-scripts`
- `make -f scripts/Makefile security-contract-probe`
- `python3 scripts/check_docs_contract.py`
- `make -f scripts/Makefile docs-topology-consistency`
- targeted deploy/startup pytest pack
- `make -f scripts/Makefile security-gap-round5`
- `python3 scripts/security/run_release_parity_audit.py --run-id 20260317T143939Z-skip --skip-prod-readiness`
- `python3 scripts/security/run_release_parity_audit.py --run-id 20260317T143939Z-full`

## Shared Findings

### PRDI-001
- Severity: High
- Surface: `shared`
- Reproduction command: `make -f scripts/Makefile verify-prod-install-scripts`
- Affected file or contract anchor:
  - `scripts/Makefile`
  - `scripts/deploy/lib/common.sh`
  - `scripts/deploy/lib/docker.sh`
  - `scripts/deploy/lib/linux.sh`
  - `scripts/prod/lib/common.sh`
- Evidence artifact path:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/01_verify_prod_install_scripts_rerun.log`
- Operator/developer impact:
  - the repo's own production-install verification target currently fails on `main`, so the shared must-pass gate in the review plan is not met
- Remediation lane:
  - `scripts/deploy/*`
  - `scripts/prod/*`
  - `scripts/Makefile`
- Classification: `contract drift`
- Detail:
  - the failure is currently driven by ShellCheck findings, including `SC1091` on dynamic `metadata.env` sourcing and `SC2153` against `RUNTIME_DIR` usage in the Docker/Linux deploy helpers

### PRDI-002
- Severity: High
- Surface: `shared`
- Reproduction command: `bash scripts/security/run_prod_readiness_audit_local.sh`
- Affected file or contract anchor:
  - `scripts/security/run_prod_readiness_audit_local.sh`
  - `scripts/deploy.sh`
- Evidence artifact path:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/16_prod_readiness_audit_local_direct.log`
- Operator/developer impact:
  - the local prod-readiness harness aborts before it can produce trustworthy Docker lifecycle evidence, so the last pre-release audit cannot use this runner as a sign-off mechanism
- Remediation lane:
  - `scripts/security`
  - `scripts/deploy.sh`
- Classification: `code bug`
- Detail:
  - the harness runs `deploy.sh init`, then immediately redirects new secret content into read-only placeholder files, failing with `Permission denied`

## Docker Findings

### PRDI-003
- Severity: High
- Surface: `docker`
- Reproduction command:
  - `./scripts/deploy.sh deploy --target docker --config <config> --secret-dir <secret-dir> --backend-image <backend> --frontend-image <frontend> --redis-image <redis> --yes --dry-run`
- Affected file or contract anchor:
  - `scripts/deploy/lib/common.sh`
  - `scripts/deploy/lib/docker.sh`
- Evidence artifact path:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/21_deploy_docker_dry_run_direct.log`
- Operator/developer impact:
  - `docker` deploy dry-runs emit corrupted `--backend-env` and `--frontend-env` arguments, and the same stdout pollution created garbage pseudo-paths at the repo root during this review
- Remediation lane:
  - `scripts/deploy/lib/common.sh`
  - `scripts/deploy/lib/docker.sh`
- Classification: `code bug`
- Detail:
  - `make_runtime_dir()` captures stdout from `make_temp_dir_in_parent_dir()`, but `ensure_dir()` writes dry-run trace lines to stdout before the actual path is printed, so command substitution receives both the trace and the path

### PRDI-004
- Severity: Medium
- Surface: `docker`
- Reproduction command:
  - `python3 scripts/security/run_release_parity_audit.py --run-id 20260317T143939Z-full`
- Affected file or contract anchor:
  - `scripts/security/run_release_parity_audit.py`
  - `scripts/deploy.sh`
- Evidence artifact path:
  - `tests/results/release-parity-audit-20260317T143939Z-full/prod_readiness_ingest/prod-readiness-audit-20260317-144426/SUMMARY.json`
- Operator/developer impact:
  - the parity-ingested prod-readiness subtree is not reliable standalone Docker evidence because multiple early commands in the temp worktree fail before the actual lifecycle checks become meaningful
- Remediation lane:
  - `scripts/security`
- Classification: `environment-only issue`
- Detail:
  - this affects confidence in the ingested March 17 prod-readiness subtree, but it is not the primary release blocker because the direct prod-readiness harness also failed earlier for a real code-path reason

## Linux Findings

### PRDI-005
- Severity: High
- Surface: `linux`
- Reproduction command:
  - `./scripts/deploy.sh preflight --target linux --config <config> --secret-dir <secret-dir> --yes`
- Affected file or contract anchor:
  - `scripts/deploy/lib/linux.sh`
  - `docs/deployment/README.md`
  - `docs/deployment/production.md`
- Evidence artifact path:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/12_linux_init_local.log`
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/14_linux_preflight_on_macos.log`
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/15_linux_preflight_on_macos_fixed_perms.log`
- Operator/developer impact:
  - the Linux production path was not live-validated on a Linux host, so bundle install, systemd/nginx setup, smoke, upgrade, and rollback remain unproven
- Remediation lane:
  - release engineering / operator validation on a disposable Linux host
- Classification: `environment-only issue`
- Detail:
  - after secret permissions were corrected, preflight failed on macOS with `ERROR: Missing required command: systemctl`; under the agreed plan, missing Linux live validation is itself a release blocker

## Compose Findings

### PRDI-006
- Severity: Medium
- Surface: `compose`
- Reproduction command: `./scripts/compose.sh --help`
- Affected file or contract anchor:
  - `scripts/compose.sh`
  - `docs/development/README.md`
  - `README.md`
  - `scripts/README.md`
- Evidence artifact path:
  - `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/10_compose_help.log`
- Operator/developer impact:
  - the supported Docker onboarding CLI prints usage and then exits non-zero with `Unknown command: --help`, which is a public-interface defect on a documented entrypoint
- Remediation lane:
  - `scripts/compose.sh`
- Classification: `code bug`
- Detail:
  - `COMMAND="${1:-}"` captures `--help` before option parsing, so the script falls through to the unknown-command branch instead of the help handler

## Dev Findings

- No confirmed `dev.sh` defect was reproduced on the current code.
- `./scripts/dev.sh --backend` started successfully and showed the expected local-dev auth boundary (`MOCK_AUTH_ENABLED=true`) and local backend runtime.
- `./scripts/dev.sh --daemon` succeeded after stale listeners were removed and served the expected local frontend/backend URLs.
- The parity `P1-startup-path-failed-dev_sh_full` result on March 17 was caused by an unexpected listener already occupying port `8000`, not by a demonstrated `dev.sh` regression.

## Evidence Map

Baseline passes:

- startup verifier: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/02_verify_startup_scripts.log`
- docs contract: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/03_check_docs_contract.log`
- targeted deploy/startup pytest pack: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/06_targeted_deploy_startup_pytests.log`
- security gap round 5: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/13_security_gap_round5.log`

Parity evidence:

- skip decision: `tests/results/release-parity-audit-20260317T143939Z-skip/decision.json`
- full decision: `tests/results/release-parity-audit-20260317T143939Z-full/decision.json`
- full findings: `tests/results/release-parity-audit-20260317T143939Z-full/findings.json`
- contaminated `dev.sh` parity failure: `tests/results/release-parity-audit-20260317T143939Z-full/logs/path_dev_sh_full.log`

Compose/runtime confirmations:

- `compose up --profile db-only`: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/22_compose_up_db_only.log`
- `compose reset --dataset test`: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/23_compose_reset_test.log`
- `compose up` full-stack login UI: `tests/results/release-parity-audit-20260317T143939Z-full/ui/compose_sh_up_full_login.png`

Dev/runtime confirmations:

- `dev.sh --backend`: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/19_dev_backend.log`
- `dev.sh --daemon`: `tests/results/pre-release-deploy-install-review-20260317T143939Z/logs/20_dev_full_daemon.log`

## Limitations

- This review ran on macOS, not on a disposable Linux host, so the Linux production target could not be fully exercised.
- No clean-host live Docker production lifecycle was completed in this environment; Docker production evidence is therefore limited to shared gates, dry-run reproduction, and broken/incomplete prod-readiness harnesses.
- `make -f scripts/Makefile security-contract-probe` failed because no target app was running when the probe was executed; that result is not treated as an application defect.
- The parity-ingested March 17 prod-readiness subtree lives under a temporary worktree and contains harness noise; it is supporting evidence only, not the primary source of current truth.

## Release Recommendation

- Keep release status at **NO-GO**.
- Required closeout before a new sign-off attempt:
  - fix `verify-prod-install-scripts` so the shared production-install gate passes on current `main`
  - fix Docker deploy dry-run stdout pollution in `make_runtime_dir()` / `make_temp_dir_in_parent_dir()`
  - fix `run_prod_readiness_audit_local.sh` so it can complete after `deploy.sh init`
  - rerun the full Linux production wave on a real Linux host through `preflight`, `deploy`, `status`, `logs`, `smoke`, `upgrade`, and `rollback`
- `compose.sh` and `dev.sh` are not the release blockers in this review. The blockers are production-path evidence and shared release gating.
