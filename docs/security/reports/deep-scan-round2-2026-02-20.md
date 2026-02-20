# RiskHub Round 2 Deep Security Audit Report (2026-02-20)

> [!NOTE]
> This report is a historical baseline. Current closure status is tracked in `/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/reports/deep-scan-round2-remediation-2026-02-20.md`.

## Scope
- In scope:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src`
`/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/Dockerfile`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/Dockerfile`
- Explicitly excluded:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py`
- Artifact root:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216`

## Execution Summary
- Mode: Maximum-aggression deep audit.
- Environment coverage:
  - Local: **completed**.
  - Staging isolated tenant: **not executed** (staging target / tenant / actor credentials not provided in runtime context).
- Public API/schema/type changes: none.
- Product-code mutation in this cycle: none.

## Baseline
- Branch: `main`
- Commit: `599369a5b12ac75e2199f52c1c0a6bc8f8ded65a`
- Runtime snapshot:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/baseline/baseline-metadata.txt`
- Target metadata:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/baseline/targets.txt`

## Automated + Advanced Scan Results

### Static Analysis
- Bandit: total `1` low, `0` medium/high.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/static/bandit-summary.txt`
- Semgrep (OWASP/Python/JS/TS packs): `0` findings.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/static/semgrep-backend-summary.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/static/semgrep-frontend-summary.txt`
- Custom auth/RBAC Semgrep pack: 6 findings triaged (4 false-positive token-storage heuristics, 2 review warnings).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/static/semgrep-custom-auth-rbac-summary.txt`

### Supply Chain / Container / Secrets / SBOM
- pip-audit: `0` vulnerabilities.
- npm audit (high gate): `0` vulnerabilities.
- Trivy backend/frontend (HIGH,CRITICAL): `0` / `0`.
- Gitleaks parse + scan: pass, `0` findings.
- Syft+Grype correlation: `1 High` (`CVE-2025-13836`, Python runtime) requiring explicit triage.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/supply_chain/supply-chain-gate.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/supply_chain/grype-backend-summary.txt`

### Dynamic / DAST / Fuzz
- ZAP baseline: pass (`exit 0`).
- ZAP API scan: warnings (`exit 2`), no high/medium alerts, low hardening findings present.
- ZAP scoped API scan (logout/demo-login excluded): warnings (`exit 2`), same risk profile; destructive auth/logout paths validated via controlled scripts instead of scanner mutation.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/zap-statuses.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/zap-summary.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/zap-api-scoped.status`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/zap-scoped-summary.txt`
- Schemathesis (auth/reports/approvals/admin/RBAC paths): `exit 1`, with one confirmed 500-path issue and contract drift findings.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/schemathesis-status.txt`, `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/schemathesis-summary.txt`

### Race / Session Abuse
- Parallel refresh replay profiles (`2/8/32/64`): exactly one `200` winner, all other requests `401`; stale parent replay `401`; winner child refresh remains valid (`200`).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/race/refresh-race-summary.csv`

### RBAC / IDOR Differential
- Differential matrix executed across 9 demo actors and 17 endpoints (`153` checks).
- Admin observability endpoints remained admin-only (`403` for non-admin).
- Cross-department direct reads for sampled resources were denied (`404`/`403`).
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/rbac/rbac-diff-matrix.csv`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/rbac/idor-results.json`

### Stress / Resilience
- 500-request bursts at concurrency 50:
  - `/api/v1/health`: stable 200s.
  - `/api/v1/reports/summary/export?format=csv` (CRO): stable 200s.
  - `/api/v1/admin/logs/recent` (employee): stable fail-closed 403s.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/stress/stress-summary.csv`

### Security Regression Tests
- Targeted backend security suite: `70 passed`.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/reports/pytest-security-round2.txt`

## Confirmed Findings (Prioritized)

### R2-001 (Medium) — Admin snapshot capture endpoint can be forced into `500`
- Impact:
Authenticated platform admins can trigger repeated 500s on quarterly snapshot capture, degrading operational workflows and creating avoidable incident noise.
- Reproduction:
`POST /api/v1/auth/demo-login/1` then `POST /api/v1/admin/snapshots/capture?notes=`.
- Observed:
`500 Internal Server Error`; backend logs show enum-value mismatch for `snapshot_type` insert.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/admin/snapshots.py:16`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/snapshot_service.py:373`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/models/quarterly_metric_snapshot.py:16`
- Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/repros/admin-snapshot-capture-500.txt`

### R2-003 (Medium) — SBOM correlation reveals High CVE not visible in primary Trivy gate
- Impact:
Correlated scanner drift can hide exploitable supply-chain risk unless triaged outside primary gate.
- Observed:
Grype reports `CVE-2025-13836` (`High`) for runtime Python `3.12.12`; Trivy reports zero high/critical in same image.
- Exploitability context:
CVE relates to malicious HTTP response behavior; RiskHub has outbound HTTP integrations (`directory_provider_service`, `public_registry`), so this remains relevant for threat modeling.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/Dockerfile:7`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/directory_provider_service.py:74`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/integrations/vendor_signals/public_registry.py:28`
- Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/supply_chain/grype-backend-summary.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/supply_chain/grype-backend.json`

### R2-002 (Low) — CORP hardening gap in security headers
- Impact:
Missing `Cross-Origin-Resource-Policy` weakens browser-side embed protection posture.
- Code anchor:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/middleware/security.py:59`
- Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/zap-api.json`

## False Positives / Non-Security Contract Drift
1. Schemathesis undocumented-status failures are predominantly missing documented `403` responses for fail-closed RBAC behavior.
2. Schemathesis `503` on `/api/v1/auth/sso/exchange` is expected in local `hybrid_dev` with SSO config unavailable.
3. Custom Semgrep `localStorage` hits are theme/language preference keys; token storage remains in-memory.
Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/reports/false-positives-round2.json`

## Attack-Vector Coverage Matrix
| Attack Vector | Status | Result | Evidence |
|---|---|---|---|
| Auth mode boundary abuse (`/auth/sso/exchange`) | tested (local) | fail-closed in local env (`503`) | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/race/token-abuse-summary.csv` |
| Session replay/race abuse | tested (local) | single-use invariant holds at `2/8/32/64` | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/race/refresh-race-summary.csv` |
| RBAC / IDOR cross-department abuse | tested (local) | sampled cross-reads denied (`404`/`403`) | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/rbac/idor-results.json` |
| Approval bypass abuse | tested (local differential) | no bypass found in sampled matrix; contract drift noted | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/rbac/rbac-diff-matrix.csv` |
| Export exfiltration (`/excel`, `format=xlsx`) | tested (local) | all tested routes return `410` + `excel_export_removed` | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/excel-compat-check.txt` |
| CSV injection | tested (local function-level) | formula-leading chars prefixed/sanitized | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/csv-sanitize-check.txt` |
| Admin observability abuse | tested (local) | non-admin denied (`403`) | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/rbac/rbac-diff-summary.csv` |
| External-call boundary / SSRF posture | reviewed (local static + supply-chain) | no direct SSRF exploit path confirmed in this run | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/directory_provider_service.py:69` |
| Frontend auth boundary | tested (local unit + static) | in-memory token model intact; no token localStorage use | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/dynamic/frontend-auth-tests.status` |
| Controlled stress / resilience | tested (local) | stable under burst; fail-closed authz maintained | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/stress/stress-summary.csv` |
| Staging isolated-tenant abuse wave | not-tested | pending target/credentials | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/baseline/targets.txt` |
| Client-IP trust-chain logic | excluded | excluded by scope rule | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py` |

## Remediation Backlog
1. Fix `R2-001`: normalize snapshot enum persistence between model/migration and endpoint path to prevent 500 on manual capture.
2. Fix `R2-003`: create explicit policy for SBOM/Trivy discrepancy handling; track `CVE-2025-13836` patch window (base image/runtime upgrade or compensating controls).
3. Fix `R2-002`: add `Cross-Origin-Resource-Policy` header in security middleware and regression-test it.
4. Non-security hardening: update OpenAPI response docs for common `403` RBAC outcomes to reduce fuzzing noise and improve contract fidelity.

## Acceptance Criteria Check
1. Full scan waves in both environments: **PARTIAL** (`local complete`, `staging pending target/tenant/actors`).
2. Every high-impact claim reproducible + code-anchored: **PASS** (for confirmed findings).
3. Client-IP findings excluded: **PASS**.
4. Report + machine findings published: **PASS**.
5. Blocking decision generated: **PASS** (no confirmed Critical in this cycle).

## Blocking Decision
`PASS` (no confirmed Critical findings in executed scope).
