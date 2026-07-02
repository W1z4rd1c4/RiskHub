# Production Readiness Audit (20260701-203243)

- Original status: **complete** — 11 required-command failures, 15 open High findings
- Current status (re-verified 2026-07-02, run `20260702-115755`): **MC-12 remediated via policy suppression**; the remaining 14 are not repo defects (see table). The two grype findings are now suppressed with upstream-verified, time-bound entries; a targeted grype re-scan of the run's SBOM with the updated `backend/security/grype-ignore.yaml` reports `grype_backend_high_critical = 0`.
- Scorecard: production readiness **needs-attention (0/5)** — the harness scores 0 while the deploy lifecycle cannot complete in the local harness environment (see MC-09 below); this reflects harness/host state, not application code.

## Resolution summary

A forensic re-verification against current code plus a fresh audit run (`20260702-115755`)
established that **13 of the 15 High findings were never application-code defects**, one
(MC-09) is a harness/host-environment limitation, and **one (MC-12) is genuinely open**.

The 11 `p3_*` command failures collapse to **two root causes** plus **nine downstream
cascades**:

- **ROOT-A — `p3_cli_preflight`:** the local docker network `riskhub-network` exists on
  subnet `172.22.0.0/16` while preflight expects `172.31.255.0/24`
  (`ERROR: Existing docker network 'riskhub-network' uses subnet(s) [172.22.0.0/16], expected '172.31.255.0/24'`).
  Host/harness state; recreate the network or set `DOCKER_NETWORK_SUBNET`. No code defect.
- **ROOT-B — `p3_cli_deploy` / `p3_cli_upgrade`:** the audit harness passes mutable image
  tags, but `scripts/deploy.sh` correctly requires immutable digests
  (`ERROR: --backend-image must be immutable image refs with @sha256:<64 hex>`). The CLI is
  correct-by-design; the harness ref-construction (`prod_readiness_audit/run_state.py:116`
  emits `…:<tag>`, not `@sha256:`) is the gap. No application-code defect.
- **CASCADE (9):** `p3_verify_runtime`, `p3_cli_smoke_after_deploy`, `p3_cli_rollback`,
  `p3_cli_smoke_after_rollback`, `p3_backend_docs_code`, `p3_backend_openapi_code`,
  `p3_scheduler_ps`, `p3_frontend_uid` all fail with `No such container` / status `000`
  because ROOT-B left nothing deployed.

## Per-finding status

| Finding | Verdict | Evidence (current repo) |
|---|---|---|
| p3_cli_preflight | ENV/HOST (ROOT-A) | stale `riskhub-network` subnet; not a code defect |
| p3_cli_deploy | HARNESS (ROOT-B) | `deploy.sh` requires `@sha256:` digests; correct-by-design |
| p3_cli_upgrade | HARNESS (ROOT-B) | same immutable-ref requirement |
| p3_verify_runtime | CASCADE of deploy | `No such container: riskhub-backend` |
| p3_cli_smoke_after_deploy | CASCADE of deploy | smoke status `000` (nothing deployed) |
| p3_cli_rollback | CASCADE of deploy | `No previous image recorded` |
| p3_cli_smoke_after_rollback | CASCADE of deploy | smoke status `000` |
| p3_backend_docs_code | CASCADE of deploy | `No such container: riskhub-backend` |
| p3_backend_openapi_code | CASCADE of deploy | `No such container: riskhub-backend` |
| p3_scheduler_ps | CASCADE of deploy | `No such container: riskhub-backend-scheduler` |
| p3_frontend_uid | CASCADE of deploy | `No such container: riskhub-frontend` |
| MC-08 (frontend non-root UID) | RESOLVED — code already correct | `frontend/Dockerfile:64` `USER riskhub` (uid 1001); audit FAIL was a cascade artifact (no container to inspect) |
| MC-09 (deploy lifecycle) | ENV/HARNESS — not a code defect | rolls up ROOT-A + ROOT-B; deploy machinery unchanged and correct-by-design |
| MC-10 (docs/openapi not exposed) | RESOLVED — code already correct | `backend/app/main.py:394-396` gate `docs_url`/`redoc_url`/`openapi_url` on `settings.debug`; audit FAIL was a cascade artifact |
| MC-12 (supply-chain High/Critical) | **OPEN** | grype reports **2 High** on the backend python runtime (see below) |

## MC-12 — the one open finding

Fresh run `20260702-115755` (`reports/supply-chain-counts.json`): `trivy_backend=0`,
`trivy_frontend=0`, `gitleaks=0`, **`grype_backend_high_critical=2`**.

The two findings are both `tarfile` stdlib CPE matches on the base-image CPython, with **no
released 3.13.x fix**:

- **CVE-2026-11940** — `python 3.13.14` — `tarfile.extractall` hardlink/symlink filter bypass (gh-151558)
- **CVE-2026-11972** — `python 3.13.14` — `tarfile` streaming-mode EOF DoS (gh-151981)

**Upstream status (verified 2026-07-02 against `python/cpython`):** both fixes are *merged*
to the 3.13 branch (backport commits `771d12dda` and `3f031d431f80`, both 2026-06-23), but a
`git compare` shows each is **behind** the latest released tag `v3.13.14` — i.e. neither is in
the shipped image — and **no `v3.13.15` has been released yet**. So no fixed `python:3.13`
base image exists today. Both CVEs also require processing an attacker-controlled tar
archive, and RiskHub does not use the `tarfile` module anywhere (`backend/app`,
`backend/scripts`), so the vulnerable paths are unreachable in this application.

**Resolution applied (Option B — time-bound policy suppression):**
`backend/security/grype-ignore.yaml` now carries two compliant entries for
`CVE-2026-11940`/`CVE-2026-11972` pinned to `python 3.13.14`, each recording
Owner / Decision / Scanner-evidence / No-fix-proof (with the verified upstream state and the
non-reachability) and `expires-on: 2026-09-30`. The four stale `3.13.13` entries
(`CVE-2026-6100/-3298/-7210/-4786`), which no longer match the shipped runtime, were removed.
A targeted grype re-scan of the run's SBOM with the updated config reports
`grype_backend_high_critical = 0`, closing MC-12.

**Standing exit (Option A):** when `python:3.13.15-alpine` (or later, containing the merged
fixes) is published, bump the three `FROM` lines in `backend/Dockerfile` and remove both
suppression entries. The `expires-on` date forces this re-review.

## Evidence

- Original run: `tests/results/prod/prod-readiness-audit-20260701-203243/reports/`
  (command-matrix.json, findings.json, scorecard.json)
- Re-verification run (2026-07-02): `tests/results/prod/prod-readiness-audit-20260702-115755/reports/`
  (findings.json, supply-chain-counts.json, grype-backend.json)
- Re-run locally: `make -f scripts/Makefile prod-readiness-audit-local`
