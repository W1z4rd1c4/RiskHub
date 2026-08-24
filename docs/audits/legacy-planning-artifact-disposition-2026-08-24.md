# Legacy Planning Artifact Disposition — 2026-08-24

## Decision

Keep dated audit findings as historical evidence, but remove session-style
response, execution-log, and mega-plan files from the active planning tree once
their durable disposition is captured.

This decision implements the repository ownership rule in
[`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md): current work
belongs in GitHub Issues and pull requests; accepted architecture decisions
belong in ADRs; dated audits remain immutable evidence; transient execution
narratives do not remain a parallel operating system.

## Retained Historical Evidence

The following dated files remain under `.planning/audits/`:

- `2026-05-09-deepening-audit.md` — point-in-time architecture audit;
- `2026-05-17-architecture-improvement-plan.md` — later, bounded architecture
  improvement plan.

Their claims remain historical and must be revalidated against current code
before implementation.

## Removed Session-Style Artifacts

| Former path | Historical blob SHA | Disposition |
|---|---|---|
| `.planning/audits/developer answer.md` | `adbca49a9294c5c2dfeb58fb699bbc0d12941503` | Removed from the active tree. Its item-by-item responses were session analysis, not a durable policy source. Accepted decisions are represented by code, tests, ADRs, and linked delivery items. |
| `.planning/audits/resolution-plan.md` | `6d3d2f5959360c2ab401579d223fe256cbf40689` | Removed from the active tree. Its 79-item, 727-hour execution plan was a superseded parallel backlog. Current work must be represented by GitHub Issues/Projects with owners and acceptance criteria. |
| `.planning/audits/IMPLEMENTATION-LOG.md` | `ea4870061d0e6bfc082467e55d9484d8d40dd57f` | Removed from the active tree. Per-wave command output and session progress belong in pull-request checks, comments, and retained CI evidence rather than a mutable repository log. |

The files remain recoverable through Git history by the recorded blob identities;
removal does not rewrite historical commits.

## Durable Successors

- Repository review and operating-complexity remediation:
  [GitHub issue #128](https://github.com/W1z4rd1c4/RiskHub/issues/128)
- Maintainability work decomposition:
  [GitHub issue #111](https://github.com/W1z4rd1c4/RiskHub/issues/111)
- Accepted architecture decisions: [`docs/adr/`](../adr/)
- Current implementation state: code, tests, migrations, and configuration at
  the referenced commit
- Live delivery status: GitHub Issues, pull requests, and Projects

## Future Audit Rule

A new audit may be committed when it is dated, scoped, evidence-backed, and
immutable. Its remediation should be expressed as linked GitHub work items and
ADRs, not as an unowned session transcript, duplicate status table, or mutable
implementation log.
