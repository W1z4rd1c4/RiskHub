# Security Scanning & Vulnerability Management

This document describes the security scanning tools, processes, and response procedures for RiskHub.

## Quick Start

### Install Pre-commit Hooks
```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run all hooks manually
pre-commit run --all-files
```

### Run Individual Scans

```bash
# Python SAST (Bandit)
cd backend
pip install bandit
bandit --ini .bandit -r app

# Python Dependency Scan (pip-audit)
pip install pip-audit
pip-audit -r requirements.txt

# Frontend Dependency Scan
cd frontend
npm audit

# Secrets Detection (Gitleaks)
# Install: brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks
gitleaks detect --config .gitleaks.toml

# Container Scan (Trivy)
# Install: brew install trivy (macOS)
trivy image riskhub-backend:latest
trivy image riskhub-frontend:latest

# SBOM generation (Syft) + correlation scan (Grype)
# Install: brew install syft grype (macOS)
syft riskhub-backend:latest -o json > sbom-backend.json
grype sbom:sbom-backend.json --config backend/security/grype-ignore.yaml -o json > grype-backend.json

# Security Headers Verification
python scripts/verify_security_headers.py --mock  # CI mode
python scripts/verify_security_headers.py         # Against running server

# Protocol / OpenAPI contract drift probe (deterministic, repo-tracked harness)
make -f scripts/Makefile security-contract-probe
```

---

## Security Scanning Tools

| Tool | Purpose | Location | Runs |
|------|---------|----------|------|
| **Bandit** | Python SAST | `backend/.bandit` | Pre-commit, CI |
| **pip-audit** | Python dependency vulnerabilities | CI | CI only |
| **ESLint** | Frontend code quality | `frontend/eslint.config.js` | Pre-commit, CI |
| **npm audit** | Frontend dependency vulnerabilities | CI | CI only |
| **Trivy** | Container image scanning | CI | CI (push/schedule) |
| **Syft** | SBOM generation for image inventory | CI | CI (push/schedule) |
| **Grype** | SBOM vulnerability correlation gate | `backend/security/grype-ignore.yaml` | CI (push/schedule) |
| **Gitleaks** | Secrets detection | `.gitleaks.toml` | Pre-commit, CI |
| **Protocol Contract Probe** | Deterministic protocol/security-vs-contract triage | `scripts/security/protocol_contract_probe.py` | Local security closure runs |

---

## CI/CD Pipeline

The security workflow (`.github/workflows/security.yml`) runs:

| Job | Trigger | Severity Threshold |
|-----|---------|-------------------|
| Python Security | PR, Push, Weekly | Report all |
| Frontend Security | PR, Push, Weekly | High+ |
| Container Scan + SBOM Correlation | Push, Weekly | Trivy High+/Critical + Grype High+/Critical |
| Secrets Detection | PR, Push | Config parse + full scan |
| Security Headers | PR only | Required headers |

Backend CI jobs in security/lint/e2e workflows use Python `3.13` to align with the backend runtime baseline.

### Viewing Results
- GitHub Security tab shows SARIF results
- Artifacts section contains JSON reports
- Check logs for detailed output

---

## Vulnerability Response

### Severity Levels

| Severity | Response Time | Action |
|----------|--------------|--------|
| **Critical** | 24 hours | Immediate patch/workaround |
| **High** | 7 days | Prioritize for next release |
| **Medium** | 30 days | Schedule for maintenance |
| **Low** | 90 days | Address opportunistically |

### Response Process

1. **Triage**: Security team reviews finding
2. **Assess**: Determine real-world exploitability
3. **Fix/Mitigate**: Patch, update, or add controls
4. **Verify**: Confirm fix resolves issue
5. **Document**: Update CHANGELOG, close issue

### Scanner Discrepancy Policy (Trivy vs Grype)

If Trivy is clean but Grype reports unresolved **High/Critical**, treat the result as an open vulnerability until one of the following is completed:
- Runtime/package upgrade removes the finding.
- A time-bound suppression is added to `backend/security/grype-ignore.yaml` with explicit owner, rationale, and expiry.

A Trivy-only pass is not sufficient to close supply-chain risk when SBOM correlation fails.

### Protocol Drift Triage Classes

The protocol probe harness classifies outcomes as:
- `security_defect`: runtime behavior deviates from fail-closed expected status.
- `contract_drift`: runtime status is expected but missing from OpenAPI documented responses.
- `auth_precondition`: authentication/session precondition failed (for example, missing auth), not treated as contract drift.

Artifacts are emitted to:
- `tests/results/security/contract-drift-remediation-<timestamp>/protocol/probe-results.json`
- `tests/results/security/contract-drift-remediation-<timestamp>/protocol/probe-triage.csv`

### Known Issues Allowlist

Document accepted risks in `.gitleaks.toml` and `backend/.bandit`:
- Include justification
- Set review date
- Require approval

## Accepted Risks

### CVE-2024-23342 (`ecdsa`, transitive via `python-jose`)

RiskHub uses symmetric JWT signing/verification (`HS256`) only (see `backend/app/core/security.py`), so ECDSA signing/verification code paths are not exercised by the application.

Re-evaluate this acceptance if RiskHub introduces any ECDSA/ECDH-based algorithms (e.g., `ES256`/`ES384`/`ES512`) or other features that rely on `ecdsa`.

---

## Development Security Checklist

- [ ] Never commit secrets (use `.env` files)
- [ ] Run `pre-commit run --all-files` before pushing
- [ ] Review dependency updates for security patches
- [ ] Use parameterized queries (SQLAlchemy handles this)
- [ ] Validate all user input via Pydantic schemas
- [ ] Use proper authentication decorators

---

## Reporting Security Issues

For security vulnerabilities, please contact the development team directly rather than opening a public issue.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)
