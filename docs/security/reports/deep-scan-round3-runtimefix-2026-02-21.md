# RiskHub Deep Security Scan Round 3.1 Runtime-Fix Report (2026-02-21)

> Supersession note (2026-02-21): Contract-drift finding `R3.1-004` is closed in `docs/security/reports/contract-drift-remediation-2026-02-21.md`. Historical findings content below is preserved as originally reported.

## Scope
- Mode: scan-and-report only (no product-code remediation in this cycle)
- Environments executed:
  - local: `http://127.0.0.1:8000`
  - staging-sim: `http://127.0.0.1:18000` (second backend instance)
- Real staging: not run (credentials unavailable in this cycle)
- Explicit exclusion: `backend/app/core/client_ip.py`

## Artifact Root
- `tests/results/security/deep-scan-round3-runtimefix-20260220-233943`

## Execution Summary
1. Baseline and dual-backend topology completed; both targets healthy.
2. Synthetic `RH_STAGING_*` inputs generated from `:18000` with sanitized metadata only.
3. Schemathesis rerun used pinned image digest:
   - `schemathesis/schemathesis@sha256:242d4289723caf7cf9a183bad22172cffc32e45bd5ae91ebde7d4181bbad5ce7`
4. ZAP baseline + API artifacts generated for local and staging-sim.
5. High-value abuse checks passed on both environments:
   - refresh race 2/8/32/64 single-winner invariants,
   - logout-all/token-revocation,
   - Excel removal compatibility (410 + `excel_export_removed`),
   - admin-observability RBAC denial for non-admin.

## Key Results
- Schemathesis runtime-noise gate: **closed**
  - No `RuntimeError`, `Exception in thread`, or `dictionary changed size` signatures in scan logs.
  - Evidence: `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-runtime-noise-check.txt`
- Staging precondition status: **replaced by staging-sim completed**
  - Evidence: `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/baseline/targets.txt`
- ZAP artifacts: generated
  - Baseline final exits: `zap-local-baseline.final.exitcode=0`, `zap-staging-sim-baseline.final.exitcode=0`
  - API exits: `zap-local-api.exitcode=0`, `zap-staging-sim-api.exitcode=0`
- High-value abuse summary:
  - refresh race profiles passed: 8/8
  - token abuse checks passed: 2/2
  - excel invariant checks passed: 12/12
  - admin observability RBAC checks passed: 18/18
  - Evidence: `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/reports/high-value-abuse-summary.json`

## Findings Triage
| ID | Severity | Status | Summary | Evidence |
|---|---|---|---|---|
| R3.1-001 | Low | fixed | Schemathesis runtime-noise instability removed by pinned runtime image. | `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-summary.txt`, `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-runtime-noise-check.txt` |
| R3.1-002 | Low | mitigated_simulation | Missing real staging creds mitigated with full staging-sim wave on `:18000`; explicitly labeled as simulation. | `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/baseline/staging-sim-preflight.txt`, `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/baseline/targets.txt` |
| R3.1-003 | Low | false_positive_tooling_noise | Schemathesis generated `X-Mock-User-Id` in payload exploration despite no manual injection in harness commands. | `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-summary-nomock.txt`, `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-nomock-xmock-hits.txt` |
| R3.1-004 | Medium | open | OpenAPI contract drift (e.g., 410 legacy Excel compatibility and auth-path response variance) remains as spec/contract debt, not confirmed exploit path. | `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/dynamic/schemathesis-local-focused.log`, `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/reports/excel-invariant-results.csv` |

## Attack-Vector Coverage Matrix
- Matrix file: `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/reports/coverage-matrix-round3-runtimefix.csv`
- Coverage labels present: `local`, `staging-sim`, `real-staging-not-run`

## Final Decision
- Blocking policy: **BLOCK on any confirmed High/Critical**
- Confirmed High/Critical findings: **0**
- **Decision: PASS**

## Limitations
1. Real staging tenant wave was not executed in this cycle; findings apply to local + staging-sim only.
2. `client_ip.py` trust-chain logic remained excluded by directive.
3. OpenAPI contract drift items should be handled in a follow-up docs/spec alignment phase.
