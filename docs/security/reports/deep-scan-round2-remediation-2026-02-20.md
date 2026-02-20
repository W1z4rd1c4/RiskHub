# RiskHub Round 2 Remediation Closure Report (2026-02-20)

## Scope
- Source findings:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-20260220-221216/findings-round2.json`
- Remediation artifact root:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613`
- Explicitly excluded:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py`

## Summary
All unresolved Round-2 findings were remediated and re-validated in this cycle:
- `R2-001` fixed (snapshot capture 500 removed via enum persistence normalization).
- `R2-002` fixed (CORP header now enforced).
- `R2-003` fixed (runtime uplift to Python 3.13 and SBOM+Grype CI correlation gate).

No public API/schema additions were introduced.

## Implemented Changes
1. Snapshot enum persistence hardening:
   - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/models/quarterly_metric_snapshot.py`
   - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/snapshot_service.py`
   - Added admin snapshot regression tests:
     - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_admin_snapshots.py`
2. CORP header hardening:
   - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/middleware/security.py`
   - Updated header regression tests:
     - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_security_headers.py`
3. Supply-chain hardening and CI policy:
   - Python runtime uplift to 3.13:
     - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/Dockerfile`
     - `/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml`
     - `/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/lint.yml`
     - `/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/e2e.yml`
   - Added Grype suppression policy file:
     - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/security/grype-ignore.yaml`
   - Updated security operations docs:
     - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/SECURITY.md`

## Verification Results
### Backend security regression tests
- Command suite result: `39 passed, 9 warnings`.
- Evidence:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/reports/pytest-targeted.txt`

### Excel removal compatibility (`410 Gone`) checks
- Result: `5 passed` targeted Excel/xlsx compatibility tests.
- Evidence:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/dynamic/excel-compatibility-pytest.txt`

### Supply-chain gates
- Backend image Python runtime: `Python 3.13.12`.
- Trivy backend: `HIGH=0`, `CRITICAL=0`.
- Grype backend: `HIGH=0`, `CRITICAL=0`, `MEDIUM=16`, `LOW=2`.
- Gitleaks parse + full scan: pass, findings `0`.
- Evidence:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/reports/baseline-metadata.txt`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/trivy-backend-summary.txt`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/grype-backend-summary.txt`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/supply-chain-summary.txt`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/gitleaks-parse.status`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/gitleaks-scan.status`

## Finding Closure Status
| Finding | Severity | Status | Remediation Evidence |
|---|---|---|---|
| R2-001 | Medium | fixed | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/reports/pytest-targeted.txt` + code updates in snapshot model/service/tests |
| R2-002 | Low | fixed | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/reports/pytest-targeted.txt` + updated security header middleware/tests |
| R2-003 | Medium | fixed | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-round2-remediation-20260220-224613/supply_chain/supply-chain-summary.txt` + Python 3.13 runtime uplift + SBOM/Grype gate |

## Acceptance Criteria Check
1. `R2-001`, `R2-002`, `R2-003` closed with reproducible evidence: **PASS**.
2. No new security regression in targeted auth/report/admin tests: **PASS**.
3. CI security workflow enforces SBOM correlation gate: **PASS**.
4. Client-IP trust-chain unchanged and excluded: **PASS**.
5. Closure report and raw artifacts published: **PASS**.

## Blocking Decision
`PASS` (no confirmed unresolved Critical or High in remediation scope).
