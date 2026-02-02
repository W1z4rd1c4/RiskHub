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
pip-audit

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

# Security Headers Verification
python scripts/verify_security_headers.py --mock  # CI mode
python scripts/verify_security_headers.py         # Against running server
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
| **Gitleaks** | Secrets detection | `.gitleaks.toml` | Pre-commit, CI |

---

## CI/CD Pipeline

The security workflow (`.github/workflows/security.yml`) runs:

| Job | Trigger | Severity Threshold |
|-----|---------|-------------------|
| Python Security | PR, Push, Weekly | Report all |
| Frontend Security | PR, Push, Weekly | High+ |
| Container Scan | Push, Weekly | Critical, High |
| Secrets Detection | PR, Push | Any |
| Security Headers | PR only | Required headers |

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
