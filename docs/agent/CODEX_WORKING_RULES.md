# Codex Working Rules

Codex-specific development workflow and context-management guidance.
General agent precedence and default-work selection are canonical in
[`AGENTS.md`](../../AGENTS.md); cross-repository documentation and work-tracking
authority is canonical in
[`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md).

## Mission

- Deliver correct, test-verified changes to RiskHub with minimal unrelated churn.
- Prefer evidence from repository artifacts over assumptions.

## Source-of-Truth Order

Do not maintain a second precedence list in this file. Follow, in order:

1. [`AGENTS.md#source-of-truth-order`](../../AGENTS.md#source-of-truth-order) for
   the repository-wide instruction and evidence precedence;
2. [`AGENTS.md#active-work-focus-default-bias`](../../AGENTS.md#active-work-focus-default-bias)
   for agent default-work selection;
3. [`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md) for the
   distinction between live delivery state, versioned planning context,
   implemented behavior, durable decisions, and historical evidence.

Codex must not infer that work is active merely because `.planning/STATE.md`,
`.planning/ROADMAP.md`, or a phase plan describes it. Confirm the applicable
open GitHub Issue, pull request, Project item, or explicit user task as required
by `AGENTS.md`.

## Repo Hygiene

- Avoid editing generated/vendor folders:
  - `frontend/node_modules/`
  - `frontend/dist/`
  - `backend/venv/`
  - `tests/results/backend/coverage_html/`
  - `tests/results/`
- Prefer small, reviewable diffs over broad rewrites.
- Do not modify unrelated files just to satisfy formatting preferences.

## Prompting and Tooling Best Practices (OpenAI-Aligned)

- State objective, constraints, and expected output format before execution.
- Use strict structured outputs for machine-consumed results when possible.
- Keep tool/function contracts explicit, minimal, and schema-driven.
- Batch and parallelize independent operations to reduce latency and cost.
- Run an eval-like verification loop on behavior-changing work, then iterate once
  before finalizing.
- Keep reusable instruction prefixes stable; append task-specific context after
  them for cache efficiency.

Verification date:
- 2026-08-24
