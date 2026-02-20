# Codex Working Rules

Canonical agent operating rules for development workflow and context management.

## Mission

- Deliver correct, test-verified changes to RiskHub with minimal unrelated churn.
- Prefer evidence from repo artifacts over assumptions.

## Source-of-Truth Order

Use this precedence when instructions conflict:

1. Explicit user request for the current task.
2. Active phase plan file (`.planning/phases/<phase>/<plan>-PLAN.md`) when executing a phase.
3. `.planning/STATE.md` (current truth of progress).
4. `.planning/ROADMAP.md` (phase-level intent and status).
5. `.planning/codebase/*.md` (architecture, conventions, testing, concerns).
6. `docs/BUSINESS_LOGIC.md` and `docs/TESTING.md`.
7. `AGENTS.md`.

Rules:
- If planning docs conflict with current code behavior, trust code + `.planning/codebase/*`, then note the discrepancy.
- Ignore `.planning/codebase.bak-*` unless explicitly asked.

## Active Work Focus (Default Bias)

Unless user redirects, prioritize unresolved work identified as in progress in:
- `.planning/STATE.md`
- `.planning/ROADMAP.md`

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
- Batch and parallelize independent operations to reduce latency/cost.
- Run an eval-like verification loop on behavior-changing work (tests + checks), then iterate once before finalizing.
- Keep reusable instruction prefixes stable; append task-specific context after them for cache efficiency.

Verification date:
- 2026-02-16
