# Agent Documentation Index

Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

`AGENTS.md` is the canonical owner of general agent mission, instruction
precedence, default-work selection, execution protocol, repository hygiene, and
prompting/tooling rules. Files in this directory provide focused supporting
contracts or tool-specific deltas; they do not create a second general-policy
home.

Documentation and work-tracking authority is defined in
[`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md).

## Coverage

- [`AGENTS_DOC_COVERAGE.md`](./AGENTS_DOC_COVERAGE.md) — maps every `AGENTS.md`
  section to supporting evidence and ownership.

## Supporting Contracts

- [`EXECUTION_PROTOCOL.md`](./EXECUTION_PROTOCOL.md) — detailed execution-flow
  support for the canonical `AGENTS.md` protocol.
- [`TIMEZONE_POLICY.md`](./TIMEZONE_POLICY.md) — UTC-aware datetime and
  `timestamptz` contract.
- [`PYTEST_RUNTIME_NOTES.md`](./PYTEST_RUNTIME_NOTES.md) — PostgreSQL test mode
  and pytest exit-hang troubleshooting.
- [`ENDPOINT_INVARIANTS.md`](./ENDPOINT_INVARIANTS.md) — endpoint package,
  re-export, and FK-cycle invariants.
- [`FRONTEND_DISPLAY_GUARDRAILS.md`](./FRONTEND_DISPLAY_GUARDRAILS.md) — safe
  frontend display rules.
- [`SKILLS_RESOLUTION.md`](./SKILLS_RESOLUTION.md) — repository and user skill
  resolution paths.

## Tool-Specific Deltas

- [`CODEX_WORKING_RULES.md`](./CODEX_WORKING_RULES.md) — Codex-specific deltas
  and links to the canonical `AGENTS.md` sections. It does not own mission,
  source-of-truth order, active-work focus, repo hygiene, or general prompting
  policy.
- [`../../CLAUDE.md`](../../CLAUDE.md) — Claude-specific orchestration and tool
  deltas, linked back to `AGENTS.md` for general rules.

Verification date: 2026-08-24
