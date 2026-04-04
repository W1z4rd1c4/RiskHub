# RiskHub Round 5 Gap Closure Report (2026-02-21)

Run artifact root:
`tests/results/security/deep-gap-round5-20260221-225327`

## Executive Status
- Decision: `PARTIAL_BLOCKED_PRECONDITION`
- Confirmed `High/Critical` unresolved in implemented scope: `0`
- Excluded by directive: `backend/app/core/client_ip.py`
- Excel invariant: preserved (`410` + `excel_export_removed`)

## What Was Implemented
1. Redis fail-open hardening for sensitive prefixes (`/api/v1/auth/*`, `/api/v1/admin/*`, `/api/v1/approvals/*`) with `503` fail-closed behavior when Redis control plane is unavailable.
2. Lockout backend fail-closed behavior for password login when lockout backend errors occur.
3. Protocol/parser hardening middleware:
   - blocks method-override headers,
   - blocks duplicate sensitive query keys,
   - enforces JSON content type on sensitive write prefixes.
4. Outbound egress guard module and integration into directory, graph, SSO token verification, and vendor signal connector calls.
5. Dev-auth boundary hardening:
   - disabled demo login now returns `404` (non-discoverable behavior),
   - dev auth routes hidden from OpenAPI (`include_in_schema=False`),
   - debug-only mounting in endpoint package routers.
6. New replay/harness scripts:
   - `scripts/security/real_staging_replay.py`
   - `scripts/security/run_real_staging_replay.sh`
   - `scripts/security/state_machine_campaign.py`
   - `scripts/security/rbac_idor_write_sweep.py`
7. CI and tooling updates:
   - `backend/requirements-dev.txt` adds `fakeredis`, `testcontainers[redis]`, `pytest-timeout`.
   - `backend/pytest.ini` adds `redis_integration` marker.
   - `.github/workflows/security.yml` adds nightly non-blocking Redis integration job.

## Verification Evidence
- Targeted regression/security suite:
  - `65 passed, 1 skipped`
  - Evidence: `tests/results/security/deep-gap-round5-20260221-225327/reports/pytest-gap-round5.txt`
- State-machine valid-session campaign artifact:
  - `tests/results/security/deep-gap-round5-20260221-225327/campaigns/state-machine-valid-session.json`
- RBAC write-surface sweep artifacts:
  - `tests/results/security/deep-gap-round5-20260221-225327/campaigns/rbac-write-sweep.json`
  - `tests/results/security/deep-gap-round5-20260221-225327/campaigns/rbac-write-sweep.csv`
- Real staging replay precondition result:
  - `tests/results/security/deep-gap-round5-20260221-225327/reports/real-staging-precondition.json`

## 7-Point Closure Status
1. Real staging infra-only chains: `BLOCKED_PRECONDITION` (missing RH_STAGING_* credentials).
2. Redis fault-injection bypass risk: `FIXED` (fail-closed + resilience tests).
3. State-machine valid-session depth: `PARTIAL` (base run only; closed by addendum below).
4. Protocol/parser abuse with valid auth: `FIXED` (middleware + tests).
5. IDOR/write side-effect depth: `FIXED` (write-surface sweep + RBAC regression).
6. Outbound connector abuse depth: `FIXED` (central guard + service integrations + tests).
7. Dev-auth boundary misconfiguration risk: `FIXED` (404 behavior + hidden schema + hardening tests).

## Follow-up Required
1. Re-run real staging replay with full `RH_STAGING_*` credentials and publish resulting artifact in a follow-up addendum.
2. Point 3 parity completion: completed in addendum; no further staging-sim action required for this report cycle.

## Machine-Readable Findings
- `tests/results/security/deep-gap-round5-20260221-225327/findings-round5.json`
- `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/findings-round5-point3-parity.json` (consolidated Point 3 parity status view)

## Addendum — Point 3 Parity Completion (2026-02-21 UTC)

Addendum artifact root:
`tests/results/security/deep-gap-round5-point3-parity-20260221-230550`

### Execution Scope
1. Started staging-sim backend on `http://127.0.0.1:18000` using:
   - `backend/scripts/runtime/dev.sh --port 18000 --no-reload`
2. Re-ran:
   - `scripts/security/state_machine_campaign.py`
   - Targets:
     - `local=http://127.0.0.1:8000`
     - `staging-sim=http://127.0.0.1:18000`

### Addendum Decision
- Point 3 parity decision: `PASS`
- Campaign decision: `PASS`
- `staging_sim_failed_cases`: `0`
- `staging_sim_transport_errors`: `0`
- `staging_sim_session_noise_401`: `0`

### Evidence
- Campaign output:
  - `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/campaigns/state-machine-valid-session.json`
- Parity summary:
  - `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/reports/point3-parity-summary.json`
- Closure status:
  - `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/reports/parity-status.txt`
- Closure note:
  - `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/reports/point3-closure-note.md`
- Consolidated machine-readable index:
  - `tests/results/security/deep-gap-round5-point3-parity-20260221-230550/findings-round5-point3-parity.json`

### Revised 7-Point Status (Delta Only)
- Point 3. State-machine valid-session depth: `FIXED` for local + staging-sim parity.
- Point 1 (real staging replay) remains `BLOCKED_PRECONDITION` pending `RH_STAGING_*` credentials.
