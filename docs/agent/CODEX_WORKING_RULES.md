# Codex Working Rules

Canonical agent operating rules for development workflow and context management.
See [`../DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md) for the
cross-repository authority model.

## Mission

- Deliver correct, test-verified changes to RiskHub with minimal unrelated churn.
- Prefer evidence from repository artifacts over assumptions.

## Source-of-Truth Order

Use this precedence when instructions or status claims conflict:

1. Explicit user request for the current task.
2. The referenced GitHub Issue, pull request, or Project item for live scope,
   assignment, priority, blocking, review state, acceptance evidence, and
   open/closed status.
3. The active phase plan (`.planning/phases/<phase>/<plan>-PLAN.md`) for
   implementation detail, after confirming that its live delivery item remains
   open and applicable.
4. Code, tests, migrations, and runtime configuration for implemented behavior at
   the current commit.
5. `.planning/STATE.md` and `.planning/ROADMAP.md` for versioned technical context
   and roadmap intent at the current commit—not live assignment or closure state.
6. `.planning/codebase/*.md` for architecture, conventions, testing, and concerns.
7. `docs/BUSINESS_LOGIC.md`, `docs/TESTING.md`, and accepted ADRs for durable
   product, verification, and architecture contracts.
8. `AGENTS.md` as the repository navigation layer.

Rules:

- When GitHub delivery status conflicts with `.planning/STATE.md` or
  `.planning/ROADMAP.md`, use GitHub for live status and reconcile the planning
  snapshot in the relevant delivery change.
- When code conflicts with descriptive documentation, code and tests establish
  current behavior. An accepted ADR or product contract may still establish the
  desired behavior and therefore identify a defect.
- Ignore `.planning/codebase.bak-*` unless explicitly asked.

## Active Work Focus (Default Bias)

Unless the user supplies a direct task, select work only from an assigned or
otherwise explicitly applicable open GitHub Issue, pull request, or Project item.
Use `.planning/STATE.md`, `.planning/ROADMAP.md`, and active phase plans to obtain
versioned implementation context after that live-status check.

Do not start work solely because a planning snapshot says it is in progress.
Closed, declined, superseded, blocked, or unassigned live work is not an active
default task.

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
- 2026-08-23