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
3. State-machine valid-session depth: `PARTIAL` (local completed, staging-sim unavailable).
4. Protocol/parser abuse with valid auth: `FIXED` (middleware + tests).
5. IDOR/write side-effect depth: `FIXED` (write-surface sweep + RBAC regression).
6. Outbound connector abuse depth: `FIXED` (central guard + service integrations + tests).
7. Dev-auth boundary misconfiguration risk: `FIXED` (404 behavior + hidden schema + hardening tests).

## Follow-up Required
1. Re-run real staging replay with full `RH_STAGING_*` credentials and publish resulting artifact in a follow-up addendum.
2. Start staging-sim backend (`:18000`) and rerun `state_machine_campaign.py` for parity completion.

## Machine-Readable Findings
- `tests/results/security/deep-gap-round5-20260221-225327/findings-round5.json`
