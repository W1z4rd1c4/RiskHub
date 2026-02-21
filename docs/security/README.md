# docs/security

Back to tree: [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Canonical security policy and reporting documentation for RiskHub.

## Contents

- `SECURITY.md`: Security scanning standards, CI gates, and vulnerability response policy.
- `reports/`: Time-stamped security scan and remediation reports.

## Notes

- Historical reports remain immutable records.
- If a report cycle is remediated later, add a supersession note in the original report pointing to the remediation report.
- Machine-readable findings indexes are emitted under `tests/results/security/<run-id>/findings-*.json`; parity/closure cycles may publish a consolidated index that updates status without mutating base-run findings.
- Keep this README updated when responsibilities or structure in this folder change.
