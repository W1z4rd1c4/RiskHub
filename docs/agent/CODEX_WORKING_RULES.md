# Codex-Specific Working Deltas

This file contains Codex-specific execution deltas only. General repository
policy is not repeated here.

## Canonical General Rules

Follow the canonical sections in [`AGENTS.md`](../../AGENTS.md):

- [Mission](../../AGENTS.md#mission)
- [Source-of-Truth Order](../../AGENTS.md#source-of-truth-order)
- [Active Work Focus](../../AGENTS.md#active-work-focus-default-bias)
- [Execution Protocol](../../AGENTS.md#execution-protocol)
- [Repo Hygiene](../../AGENTS.md#repo-hygiene)
- [Prompting and Tooling Best Practices](../../AGENTS.md#prompting-and-tooling-best-practices-openai-aligned)

Documentation and work-tracking authority is defined in
[`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md).

## Codex-Specific Deltas

- Resolve repository skills using
  [`docs/agent/SKILLS_RESOLUTION.md`](./SKILLS_RESOLUTION.md).
- Prefer repository-local instructions and commands over inferred defaults.
- When Codex is operating from a referenced Issue or pull request, use that live
  item for delivery state and use `.planning/` only as commit-scoped technical
  context, as required by the canonical `AGENTS.md` precedence.
- Preserve exact repository paths and command output in implementation evidence.

Verification date: 2026-08-24
