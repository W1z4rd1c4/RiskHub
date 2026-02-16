# Execution Protocol

Canonical execution protocol for agent work in RiskHub.

## Before Coding

1. Restate acceptance criteria and required output.
2. Read the smallest relevant set of files first (`rg` then targeted opens).
3. If phase-driven work: read plan + context + related summaries first.

## During Coding

1. Keep diffs small and scoped to task intent.
2. Preserve existing patterns in touched areas unless plan requires refactor.
3. Update tests near changed behavior.

## After Coding

1. Run the minimum meaningful verification for touched surface area.
2. If phase plan requires it, add/update matching `*-SUMMARY.md`.
3. If phase completion changes state, reconcile `.planning/STATE.md` and `.planning/ROADMAP.md`.

Verification date:
- 2026-02-16
