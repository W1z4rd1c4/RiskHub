# Security Policy

## Reporting a Vulnerability

If you believe you found a security vulnerability in RiskHub, do not open a public issue.

Preferred path:

1. Use GitHub Private Vulnerability Reporting from the repository Security tab.
2. If that option is unavailable, contact the maintainer privately through GitHub and include:
   - a short description of the issue
   - affected components or paths
   - reproduction steps or proof of concept
   - impact assessment
   - any suggested mitigation

Please avoid public disclosure until the issue is triaged and a fix or mitigation plan exists.

## What to Expect

- Initial triage should confirm whether the report is reproducible and in scope.
- Valid reports will be prioritized based on impact and exploitability.
- When possible, the fix will ship with a changelog note or advisory after remediation.

## Supported Security Practices

- Never commit secrets or production credentials.
- Prefer least-privilege configuration and explicit RBAC boundaries.
- Treat approval workflows, auth boundaries, and deployment behavior as high-sensitivity areas.

For repository security tooling and scan guidance, see [docs/security/SECURITY.md](./docs/security/SECURITY.md).
