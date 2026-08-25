# Architecture Cleanup Decision Provenance — 2026-05-09

> **Record type:** historical provenance from removed session-style planning artifacts
> **Historical source blobs:** see [`legacy-planning-artifact-disposition-2026-08-24.md`](./legacy-planning-artifact-disposition-2026-08-24.md)
> **Accepted decision source:** [`ADR-017 Retained Compatibility Surfaces`](../adr/ADR-017-retained-compatibility-surfaces.md)

This dated record preserves the provenance of two deletion proposals from the
2026-05-09 cleanup audit. It does not define current architecture, live work
status, or implementation policy. The accepted decisions and current invariant
tests are owned by ADR-017.

## Audit item #10 — Risk Hub questionnaire endpoint module

The audit proposed deleting
`backend/app/api/v1/endpoints/riskhub_questionnaires.py`. Verification of that
proposal and its accepted disposition are recorded in ADR-017.

## Audit item #57 — Quarterly comparison compatibility facade

The audit proposed deleting
`backend/app/services/quarterly_comparison_service.py`. Verification of that
proposal and its accepted disposition are recorded in ADR-017.

## Scope boundary

The removed implementation log, developer response, and resolution plan remain
available by Git blob identity through the disposition record and Git history.
This provenance note deliberately excludes current architecture rules,
transient scheduling, estimates, agent-invocation plans, and command-session
output.
