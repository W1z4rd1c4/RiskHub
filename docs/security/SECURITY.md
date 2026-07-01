# Security Scanning & Vulnerability Management

This document describes the security scanning tools, processes, and response procedures for RiskHub.
Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Quick Start

### Install Pre-commit Hooks
```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install --install-hooks

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

# Fast public-repo hygiene gate (tracked files only)
python3 scripts/security/validate_public_repo_hygiene.py

# Public-repo leak audit (current tree + full git history + privacy metadata)
make -f scripts/Makefile public-leak-audit

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

# Redis fault-injection resilience checks (fail-closed verification)
make -f scripts/Makefile security-redis-resilience

# Round-5 targeted security gap suite
make -f scripts/Makefile security-gap-round5

# Local production-readiness deep audit (SOC2-oriented, local evidence)
make -f scripts/Makefile prod-readiness-audit-local

# Real staging replay pack (requires RH_STAGING_* env vars)
bash scripts/security/run_real_staging_replay.sh

# Compose Round-5 Point-3 consolidated findings index
python3 scripts/security/compose_round5_point3_index.py

# Documentation topology audit (canonical / full)
python3 scripts/tools/docs_tree_audit.py --scope canonical
python3 scripts/tools/docs_tree_audit.py --scope full
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
| **Public Repo Hygiene** | Fast tracked-file privacy and artifact gate | `scripts/security/validate_public_repo_hygiene.py` | Pre-commit, CI |
| **Public Leak Audit** | Current-tree + history leak/privacy sweep | `scripts/security/run_public_repo_leak_audit.sh` | Local before public releases |
| **Protocol Contract Probe** | Deterministic protocol/security-vs-contract triage | `scripts/security/protocol_contract_probe.py` | Local security closure runs |
| **Redis Resilience Tests** | Redis fault-injection fail-closed checks | `tests/backend/pytest/test_*redis*_resilience.py` | Local + nightly CI |
| **Round-5 Replay Harnesses** | Real staging + state-machine/RBAC sweeps | `scripts/security/*.py` | Local security audits |
| **Round-5 Parity Index Composer** | Consolidated machine-readable findings index for Point-3 parity | `scripts/security/compose_round5_point3_index.py` | Local security closure runs |
| **Docs Tree Audit** | Canonical docs-link integrity and topology contract audit | `scripts/tools/docs_tree_audit.py` | Local + CI informational |

---

## CI/CD Pipeline

The security workflow (`.github/workflows/security.yml`) runs:

| Job | Trigger | Severity Threshold |
|-----|---------|-------------------|
| Python Security | PR, Push, Weekly | Report all |
| Frontend Security | PR, Push, Weekly | High+ |
| Container Scan + SBOM Correlation | Push, Weekly | Trivy High+/Critical + Grype High+/Critical |
| Secrets Detection | PR, Push | Config parse + full scan |
| Public Repo Hygiene | PR, Push | Blocking on tracked path/privacy leaks |
| Security Headers | PR only | Required headers |
| Redis Resilience Integration (non-blocking) | Nightly | Informational (`redis_integration`) |

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

Docs topology artifacts are emitted to:
- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.json`
- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.md`

### Known Issues Allowlist

Document accepted risks in `.gitleaks.toml` and `backend/.bandit`:
- Include justification
- Set review date
- Require approval

## Accepted Risks

### CVE-2024-23342 (`ecdsa`, transitive via `python-jose`)

RiskHub uses symmetric JWT signing/verification (`HS256`) only (see `backend/app/core/security.py`), so ECDSA signing/verification code paths are not exercised by the application.

Re-evaluate this acceptance if RiskHub introduces any ECDSA/ECDH-based algorithms (e.g., `ES256`/`ES384`/`ES512`) or other features that rely on `ecdsa`.

### Accepted public-repo history baseline (2026-07-01)

`make -f scripts/Makefile public-leak-audit` reported two **history-only**
findings that were reviewed and accepted rather than resolved by rewriting git
history:

- `history_privacy_path_hits`: git-history patches echo the maintainer's own
  local absolute home path (a single `Users/<maintainer>/…` prefix) in internal
  AI-audit working notes and generated caches (`.planning/`, `.codex-home/`,
  `.smart-coding-cache/`, and older `docs/` drafts). Every hit references the
  same single maintainer user — no third-party PII, no secrets, no non-localhost
  IPs.
- `history_runtime_artifacts`: eight historical blobs — `.dev-*.pid` /
  `dev.sh.pid` (a screen-session label only) and
  `scripts/runtime-artifacts/legacy/dev.sh.log.*` (bounded by `scripts/dev.sh`
  to the already-public labeled dev placeholders
  `SECRET_KEY=dev-secret-key-not-for-production-use` and the local
  `riskhub:riskhub_dev@localhost` DSN).

Both are **history-only**: the current tree is clean and `.gitignore` excludes
these patterns going forward. A dual `gitleaks` pass (current tree + full
history) is clean, confirming no real secret sits alongside them.

**Decision — Option B (documented baseline, not history rewrite).** Severity is
LOW: closed-off historical noise, not an active leak. Rewriting history on a
public repo would break every fork, open PR, and commit-hash reference for a
non-secret finding — disproportionate to the risk. The accepted snapshot is
recorded in
[`scripts/security/_public_repo_history_baseline.toml`](../../scripts/security/_public_repo_history_baseline.toml).

The baseline is deliberately narrow and does **not** disable the check:

- It applies **only** to `history_privacy_path_hits` and
  `history_runtime_artifacts`. `current_tree_gitleaks`, `history_gitleaks`,
  `tracked_hygiene_findings`, and `history_message_privacy_hits` stay strict (0)
  with no exception.
- Privacy hits are accepted only when they match the recorded
  maintainer-local-path prefixes, keyed to a snapshot count — a hit referencing
  a **different** user, a match outside that shape, ANY hit in the current tree,
  or **growth** beyond the snapshot still fails the gate.
- Runtime artifacts are accepted by exact blob object-id — any new content, new
  path, or new object-id is not covered and still fails the gate.

Re-evaluate (and shrink) this baseline if the repository is ever re-published
from a rewritten history, or if the accepted counts change.

---

## Development Security Checklist

- [ ] Never commit secrets (use `.env` files)
- [ ] Install hooks with `pre-commit install --install-hooks`
- [ ] Run `pre-commit run --all-files` before pushing
- [ ] Prefer repo-relative markdown links in public docs; repo-root absolute markdown links are acceptable, but never commit `file://` or absolute local filesystem paths
- [ ] Review dependency updates for security patches
- [ ] Use parameterized queries (SQLAlchemy handles this)
- [ ] Validate all user input via Pydantic schemas
- [ ] Use proper authentication decorators

---

## Reporting Security Issues

For security vulnerabilities, please use GitHub's private vulnerability reporting rather than opening a public issue: go to the repository's **Security** tab and select **"Report a vulnerability"** (GitHub Security Advisories). This keeps the report confidential until a fix is available and lets maintainers coordinate a disclosure with you privately.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)
