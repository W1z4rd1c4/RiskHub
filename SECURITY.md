# Security Policy

RiskHub takes vulnerability reports seriously.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Use GitHub private vulnerability reporting when available:

- https://github.com/W1z4rd1c4/RiskHub/security/advisories/new

If private reporting is unavailable:

1. Contact the maintainers through an existing private channel if you already have one.
2. If you do not have a private channel, open a minimal public issue that requests a secure contact path and do **not** include exploit details.
3. Include details only after a private disclosure path is available.

## What to Include

- a clear description of the issue
- steps to reproduce
- expected and observed behavior
- impact assessment
- affected environment or commit
- affected version, release, or commit when known
- any suggested fix or mitigation if you have one

## Response Expectations

RiskHub follows the documented severity guidance in [docs/security/SECURITY.md](./docs/security/SECURITY.md), including prioritized response windows for critical, high, medium, and low findings.

## Public Repo Leak Audits

Before public releases or after opening new public repository surfaces, run:

```bash
make -f scripts/Makefile public-leak-audit
```

This audit checks the tracked working tree and full Git history for secrets, private local-machine metadata, and accidentally tracked runtime artifacts.

## Operational Security Documentation

For the full security scanning, vulnerability-management, and disclosure process, see:

- [docs/security/SECURITY.md](./docs/security/SECURITY.md)
