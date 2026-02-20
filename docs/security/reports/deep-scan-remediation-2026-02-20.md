# RiskHub Deep Security Remediation Report (2026-02-20)

## Scope
- In scope:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src`
`/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml`
`/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/SECURITY.md`
- Explicitly excluded in this cycle:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py`

## Executive Summary
- Remediation objective: close findings from `/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/reports/deep-scan-2026-02-20.md` and re-run security gates.
- Closure result: all five findings from the deep scan are remediated and validated.
- Current gate status: no blocking security findings in this remediation run.

## Baseline And Artifact Root
- Branch: `main`
- Commit: `599369a5b12ac75e2199f52c1c0a6bc8f8ded65a`
- Remediation artifacts:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321`
- Baseline evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/baseline-metadata.txt`

## Finding Closure Status

### 1) HIGH — Refresh token replay/race (Closed)
- Fix implemented:
  - Atomic single-use refresh rotation in `/api/v1/auth/refresh` using conditional `UPDATE ... revoked_at IS NULL` and `rowcount == 1` gate.
  - Pre-generated child refresh token/JTI flow added to shared issuance helper.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/auth/refresh.py:104`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/auth/refresh.py:117`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/auth/_shared.py:59`
- Regression coverage:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_auth_refresh.py:103`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_auth_demo_refresh.py:68`
- Validation result:
  - Parallel replay now deterministic single-use: one `200`, one `401`; stale token replay `401`; winning child token rotates.

### 2) MEDIUM — Backend container vulnerability posture (Closed)
- Fix implemented:
  - Backend Docker image switched to Alpine multi-stage.
  - Runtime dependency set trimmed and split from dev tooling.
  - Runtime `openpyxl` and `python-multipart` removed.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/Dockerfile:7`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/.dockerignore:1`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/requirements.txt:1`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/requirements-dev.txt:1`
`/Users/stefanlesnak/Antigravity/Risk App 2/scripts/dev.sh:309`
- Validation result:
  - Trivy backend image gate: HIGH=0, CRITICAL=0.
  - Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/trivy-backend-summary.txt`

### 3) MEDIUM — Gitleaks config drift / parse parity (Closed)
- Fix implemented:
  - `.gitleaks.toml` migrated to schema-valid top-level allowlist.
  - CI parse gate corrected and enforced before scan.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/.gitleaks.toml:10`
`/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml:215`
`/Users/stefanlesnak/Antigravity/Risk App 2/.github/workflows/security.yml:221`
- Validation result:
  - Parse gate pass.
  - Gitleaks scan findings=0.
  - Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/gitleaks-parse-gate.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/gitleaks-summary.txt`

### 4) LOW — Residual Excel code despite removal policy (Closed)
- Fix implemented:
  - Removed backend tabular Excel generator and deleted stale Excel reporting modules.
  - Preserved backward-compatible `410 Gone` behavior for legacy `/excel` and `format=xlsx` requests.
  - Updated frontend locale display strings to CSV wording where Excel text was user-visible.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/tabular.py:18`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/_streaming.py:13`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/_streaming.py:27`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/legacy_excel.py:15`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/summary_excel.py:97`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/audit_trail_excel.py:107`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/i18n/locales/en/common.json:41`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/src/i18n/locales/cs/common.json:41`
- Removed modules:
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/audit_excel.py`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/controls_excel.py`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/risks_excel.py`
`/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/vendor_reports.py`

### 5) LOW — KRI RBAC security coverage gap (Closed)
- Fix implemented:
  - Async fixtures switched to `pytest_asyncio.fixture` in KRI RBAC tests.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_kris_rbac.py:7`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_kris_rbac.py:14`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_kris_rbac.py:37`
- Validation result:
  - KRI RBAC tests execute and pass inside targeted security suite.
  - Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/pytest-targeted.txt`

### 6) Frontend npm high advisory chain (Closed)
- Fix implemented:
  - Upgraded approved lint toolchain path (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`).
  - Kept ESLint config/runtime behavior compatible and lint/typecheck passing.
- Code anchors:
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/package.json:58`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/package.json:67`
`/Users/stefanlesnak/Antigravity/Risk App 2/frontend/package.json:76`
- Validation result:
  - npm audit high gate pass with zero vulnerabilities.
  - Evidence:
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/npm-audit-summary.txt`
`/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/npm-audit-gate.txt`

## Re-Scan And Regression Gate Results
- Bandit high gate: pass (`high=0`).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/bandit-summary.txt`
- pip-audit: 0 vulnerabilities.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/pip-audit-summary.txt`
- npm audit (`--audit-level=high`): pass, 0 vulnerabilities.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/npm-audit-summary.txt`
- gitleaks parse gate: pass.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/gitleaks-parse-gate.txt`
- gitleaks scan: pass, 0 findings.
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/gitleaks-summary.txt`
- trivy backend: pass (HIGH=0, CRITICAL=0).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/trivy-backend-summary.txt`
- trivy frontend: pass (HIGH=0, CRITICAL=0).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/trivy-frontend-summary.txt`
- Targeted backend security regression suite: pass (`52 passed`).
Evidence: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/pytest-targeted.txt`

## Attack-Vector Coverage Matrix
| Attack vector | Status | Result | Evidence |
|---|---|---|---|
| Session lifecycle abuse (refresh replay/race, replay-after-rotation) | tested | closed; single-use enforced | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_auth_refresh.py:103` |
| Demo auth refresh replay race | tested | closed; one winner path only | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_auth_demo_refresh.py:68` |
| RBAC / IDOR on reports and audit surfaces | tested | pass in targeted suite | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/pytest-targeted.txt` |
| KRI RBAC mutation coverage | tested | restored and passing | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/backend/pytest/test_kris_rbac.py:14` |
| Export exfil (`/excel`, `format=xlsx`) | tested | policy preserved via `410` + `excel_export_removed` | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/api/v1/endpoints/reports/_streaming.py:13` |
| CSV injection | tested by code inspection | guard preserved | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/services/_reporting/tabular.py:18` |
| Secrets scanning parity | tested | parse + scan gates pass | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/gitleaks-gate.txt` |
| Container vuln gates | tested | backend/frontend high+critical pass | `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/security/deep-scan-remediation-20260220-215321/trivy-backend-gate.txt` |
| Client-IP trust chain | excluded by directive | out of scope | `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/core/client_ip.py` |

## Notes
- No API/schema additions were introduced.
- Backward compatibility preserved for removed Excel routes (`410 Gone`, `code=excel_export_removed`).
- Client-IP logic was not changed per scope exclusion.
