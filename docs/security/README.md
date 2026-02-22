# docs/security

Back to tree: [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Canonical security policy and reporting documentation for RiskHub.

## Contents

- [`SECURITY.md`](./SECURITY.md): Security scanning standards, CI gates, and vulnerability response policy.
- [`reports/README.md`](./reports/README.md): Time-stamped security scan and remediation reports.

## Notes

- Historical reports remain immutable records.
- If a report cycle is remediated later, add a supersession note in the original report pointing to the remediation report.
- Machine-readable findings indexes are emitted under `tests/results/security/<run-id>/findings-*.json`; parity/closure cycles may publish a consolidated index that updates status without mutating base-run findings.
- Release-parity gate reports are tracked under `docs/security/reports/` and point to immutable `tests/results/release-parity-audit-<run-id>/` evidence artifacts.
- Keep this README updated when responsibilities or structure in this folder change.
