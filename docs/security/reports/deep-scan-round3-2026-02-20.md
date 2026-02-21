# RiskHub Round 3 Deep Security Audit Report (2026-02-20)

## Scope
- In scope:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src`
`/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/Dockerfile`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/Dockerfile`
`/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/SECURITY.md`
- Explicitly excluded:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py`
- Artifact root:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628`

## Execution Summary
- Mode: maximum-aggression scan cycle (no product-code remediation).
- Environment coverage:
  - Local: **completed**.
  - Staging isolated tenant: **blocked precondition** (missing `RH_STAGING_*` inputs).
- Public API/schema/type changes: none.
- Product-code mutation in this cycle: none.

## Baseline
- Metadata: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/baseline/baseline-metadata.txt`
- Targets/preconditions: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/baseline/targets.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/baseline/preflight.txt`

## Scan Results
### Static analysis
- Bandit: 1 low, 0 medium/high.
- Semgrep backend/frontend packs: 0 findings.
- Custom auth/RBAC rules: 371 warnings (noise-heavy heuristic; no high/critical).
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/static/bandit-summary.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/static/semgrep-summary.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/static/static-summary.json`

### Supply chain / containers / secrets / SBOM
- pip-audit: 0 vulnerabilities.
- npm audit high/critical: 0.
- Trivy backend/frontend high/critical: 0/0.
- Syft + Grype backend high/critical: 0/0.
- Gitleaks parse + full scan: pass, 0 findings.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/supply_chain/supply-chain-gate.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/supply_chain/trivy-backend.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/supply_chain/trivy-frontend.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/supply_chain/grype-backend.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/supply_chain/gitleaks.json`

### Dynamic / DAST / fuzz
- ZAP baseline: completed, info-only alert profile.
- ZAP API scan: completed, one low alert + info alerts.
- Schemathesis broad/focused: runtime exceptions in scanner runtime; no confirmed app-side server-error finding from completed checks.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/zap-report-local.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/zap-api-local.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/dynamic-summary.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/schemathesis-broad.stderr.log`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/schemathesis-focused.stderr.log`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/schemathesis-triage.json`

### Session race / token abuse
- Refresh replay invariants held for `2/8/32/64`: exactly one `200`, remaining `401`.
- Stale parent replay: `401`.
- Winner child replay: `200`.
- Logout-all race: completed; stale access and stale refresh both `401` after invalidation.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/race/refresh-race-summary.csv`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/race/token-abuse-summary.csv`

### RBAC / IDOR / approvals
- RBAC matrix executed for 9 demo actors across 81 checks.
- Admin observability endpoint denied non-admin actors in sampled matrix.
- Approval-bypass direct mutation attempts returned `404` in this sample set (no bypass confirmed).
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/rbac-diff-matrix.csv`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/idor-results.json`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/approval-bypass-results.json`

### Frontend boundary sweep
- `apiClient` forced-401 recovery test: pass.
- No dangerous HTML sink matches detected in source sweep.
- No token persistence matches for auth token keys; storage hits are theme/language preferences.
- Excel compatibility invariant preserved server-side (`410` + `excel_export_removed`).
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/frontend/frontend-auth-recovery-test.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/frontend/frontend-boundary-grep.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/excel-compat-check.csv`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/csv-sanitize-check.txt`

### Stress / resilience
- 500-request bursts @ concurrency 50:
  - `/api/v1/health`: stable 200.
  - `/api/v1/reports/summary/export?format=csv`: stable 200.
  - `/api/v1/admin/logs/recent` as non-admin: stable 403 (fail-closed).
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/stress/stress-summary.csv`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/stress/stress-alerts.json`

### Security regression tests
- Targeted backend suite: `73 passed`, `0 failed`.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/reports/pytest-security-round3.txt`

## Confirmed Findings
| ID | Severity | Status | Finding |
|---|---|---|---|
| R3-001 | High | confirmed | Staging deep-scan wave blocked by missing required runtime inputs |
| R3-002 | Low | confirmed | Schemathesis runtime instability reduced fuzzing reliability in this run |
| R3-003 | Low | triaged | ZAP low alert on /auth/sso/exchange server-error response in local mode |


## Attack-Vector Coverage Matrix
| Attack Vector | Status | Result | Evidence |
|---|---|---|---|
| Auth mode boundary abuse (`/auth/sso/exchange`) | tested (local) | fail-closed local behavior (`503` on invalid SSO exchange in local mode) | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/race/token-abuse-summary.csv` |
| Session replay/race abuse | tested (local) | single-use refresh invariant holds at `2/8/32/64` | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/race/refresh-race-summary.csv` |
| RBAC / IDOR differential sweep | tested (local) | sampled matrix executed; no confirmed bypass in this run | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/rbac-diff-matrix.csv` |
| Approval bypass attempts | tested (local) | no bypass confirmed in sampled mutation attempts | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/approval-bypass-results.json` |
| Export exfiltration (`/excel`, `format=xlsx`) | tested (local) | all tested routes return `410` + `excel_export_removed` | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/excel-compat-check.csv` |
| CSV injection | tested (local) | formula-leading payloads prefixed/sanitized | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/dynamic/csv-sanitize-check.txt` |
| Admin observability abuse | tested (local) | non-admin denied (`403`) in matrix + stress | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/rbac/rbac-diff-matrix.csv`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/stress/stress-summary.csv` |
| Frontend auth boundary | tested (local) | 401 recovery test pass; no token-storage regression identified | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/frontend/frontend-auth-recovery-test.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/frontend/frontend-boundary-grep.txt` |
| Controlled stress/resilience | tested (local) | stable status distributions under burst load | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/stress/stress-summary.csv` |
| Staging isolated-tenant abuse wave | not-tested | blocked by missing runtime inputs | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round3-20260220-230628/baseline/targets.txt` |
| Client-IP trust-chain logic | excluded | excluded by scope rule | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py` |

## Acceptance Criteria Check
1. Full scan waves in both environments: **BLOCKED** (staging precondition missing).
2. High-impact claims reproducible + code/evidence anchored: **PASS (within executed local scope)**.
3. Client-IP findings excluded from conclusions: **PASS**.
4. Raw artifacts + machine findings index published: **PASS**.
5. Blocking decision generated: **PASS**.

## Blocking Decision
`BLOCK`

### Block Reasons
- `staging_precondition_missing`
