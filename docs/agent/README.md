# Agent Documentation Index

This directory is the canonical documentation layer for AGENTS-specific development rules that are not product feature specs.

Canonical scope for AGENTS mapping:
- `docs/`
- `.planning/codebase/`

Coverage inventory:
- `AGENTS_DOC_COVERAGE.md`

Canonical topic docs:
- `EXECUTION_PROTOCOL.md` - mandatory agent execution flow before/during/after coding
- `TIMEZONE_POLICY.md` - UTC-aware datetime and timestamptz contract
- `PYTEST_RUNTIME_NOTES.md` - Postgres test mode and pytest exit-hang troubleshooting
- `ENDPOINT_INVARIANTS.md` - endpoint package/re-export invariants and FK-cycle note
- `FRONTEND_DISPLAY_GUARDRAILS.md` - frontend UI display rules (no raw numeric IDs, safe fallbacks)
- `CODEX_WORKING_RULES.md` - mission, source-of-truth order, active focus, repo hygiene, prompting/tooling
- `SKILLS_RESOLUTION.md` - skill resolution paths and usage rules

Verification date:
- 2026-02-16
