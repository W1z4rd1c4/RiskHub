# Production Readiness Audit (20260702-115755)

> **Note:** these are the harness's raw, pre-triage counts. For the triaged
> status — root causes, per-finding verdicts, and the MC-12 remediation — see
> [prod-readiness-deep-audit-2026-07-01.md](./prod-readiness-deep-audit-2026-07-01.md).
> In short: the 11 command failures are two local env/harness roots plus nine
> cascades (not code defects), MC-08/MC-10 were already satisfied by shipping
> code, MC-09 is a harness limitation, and MC-12 was remediated **after** this run
> via time-bound `grype-ignore.yaml` suppressions. This run predates the fix, so
> its `supply-chain-counts.json` records `grype_backend_high_critical = 2`; a
> targeted re-scan of the same SBOM with the updated config reports 0. Evidence
> paths below are local run artifacts under `tests/results/` (gitignored).

- Status: **complete**
- Required failures: `11`
- Open High/Critical findings: `15`

## Scorecard
- production readiness: **needs-attention** (0/5)

## Evidence
- Command matrix: `tests/results/prod/prod-readiness-audit-20260702-115755/reports/command-matrix.json`
- Findings: `tests/results/prod/prod-readiness-audit-20260702-115755/reports/findings.json`
- Scorecard: `tests/results/prod/prod-readiness-audit-20260702-115755/reports/scorecard.json`
