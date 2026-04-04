# RiskHub Contract-Drift Remediation Closure Report (2026-02-21)

## Scope
- Source findings:
  - `tests/results/security/deep-scan-round3-runtimefix-20260220-233943/findings-round3-runtimefix.json` (`R3.1-004`)
  - `tests/results/security/deep-pentest-round4-20260221-001107/findings-round4.json` (`R4-004`)
- Closure artifact root:
  - `tests/results/security/contract-drift-remediation-20260221-004208`
- Explicitly excluded:
  - `backend/app/core/client_ip.py`

## Summary
The two open contract-drift findings were closed through tooling/spec parity, without runtime behavior changes:
1. Added deterministic protocol-contract probe harness with explicit triage classes (`security_defect`, `contract_drift`, `auth_precondition`) and fresh auth per protected probe case.
2. Aligned OpenAPI response contracts for fail-closed SSO, legacy/unified Excel rejection (`410`), and approval auth/not-found outcomes.
3. Added OpenAPI parity and probe smoke regression tests to prevent drift recurrence.

## Implemented Changes
1. Protocol drift harness (repo-tracked):
   - `scripts/security/protocol_contract_probe.py`
   - `scripts/security/run_protocol_contract_probe.sh`
2. OpenAPI contract alignment (metadata-only):
   - `backend/app/api/v1/endpoints/auth/sso.py`
   - `backend/app/api/v1/endpoints/reports/_streaming.py`
   - `backend/app/api/v1/endpoints/reports/legacy_excel.py`
   - `backend/app/api/v1/endpoints/reports/summary_excel.py`
   - `backend/app/api/v1/endpoints/reports/audit_trail_excel.py`
   - `backend/app/api/v1/endpoints/reports/unified_exports/routes.py`
   - `backend/app/api/v1/endpoints/approvals/resolve.py`
   - `backend/app/api/v1/endpoints/approvals/detail.py`
3. Regression tests:
   - `tests/backend/pytest/test_openapi_contract_parity.py`
   - `tests/backend/pytest/test_protocol_contract_probe.py`
4. Developer workflow/docs:
   - `scripts/Makefile` (`security-contract-probe` target)
   - `scripts/README.md`
   - `docs/security/SECURITY.md`

## Verification Results
### Deterministic protocol-contract probe
- Command:
  - `bash scripts/security/run_protocol_contract_probe.sh`
- Result summary:
  - `total_cases=12`
  - `security_defect=0`
  - `unresolved_contract_drift_count=0`
  - `auth_precondition=1` (expected no-auth probe)
- Evidence:
  - `tests/results/security/contract-drift-remediation-20260221-004208/protocol/probe-results.json`
  - `tests/results/security/contract-drift-remediation-20260221-004208/protocol/probe-triage.csv`

### Focused backend regression suite
- Command suite:
  - `test_openapi_contract_parity.py`
  - `test_protocol_contract_probe.py`
  - `test_auth_refresh.py`
  - `test_auth_demo_refresh.py`
  - `test_reports_rbac.py`
- Result: `31 passed, 9 warnings`.
- Evidence:
  - `tests/results/security/contract-drift-remediation-20260221-004208/reports/pytest-targeted.txt`

### Excel invariant checks
- Legacy `/excel` endpoints and `format=xlsx` remained fail-closed with `410` and `excel_export_removed`.
- Evidence:
  - `tests/results/security/contract-drift-remediation-20260221-004208/protocol/probe-results.json`

## Finding Closure Status
| Finding | Previous Status | New Status | Evidence |
|---|---|---|---|
| R3.1-004 | open | closed | `tests/results/security/contract-drift-remediation-20260221-004208/protocol/probe-results.json` |
| R4-004 | open | closed | `tests/results/security/contract-drift-remediation-20260221-004208/protocol/probe-triage.csv` |

## Acceptance Criteria Check
1. `R4-004` closure evidence reproducible from repo-tracked harness commands: **PASS**.
2. `R3.1-004` closed in consolidated closure report with evidence pointers: **PASS**.
3. Probe reports `0` unresolved `contract_drift` for previously-open cases: **PASS**.
4. OpenAPI parity tests pass for targeted endpoints/responses: **PASS**.
5. No behavior regressions in selected auth/RBAC tests: **PASS**.
6. Historical reports remain immutable except supersession notes: **PASS**.

## Fidelity Notes
1. This closure run executed on `local`; `staging-sim` (`http://127.0.0.1:18000`) was unavailable at run time.
2. Real staging remained unavailable in this cycle and is explicitly labeled as not-run.

## Final Decision
`PASS` (no confirmed unresolved `High`/`Critical`, no unresolved contract-drift items in closure scope).
