# CLAUDE.md

See [AGENTS.md](AGENTS.md) for project guidance and conventions.

## RiskHub v5 conventions

For RiskHub audit-repair work, also follow the architecture-lock conventions in
`AGENTS.md`: use `client_factory` for backend API tests, keep the TOML registries
in sync with invariant-lock tests, and cross-check ADR-001/002/005/010 when
touching capabilities, transactions, archive semantics, or forward-only
Postgres migrations. If a task explicitly forbids subagents, that task-level
instruction overrides this file's default orchestration model.

## Architecture Locks

Backend invariant-lock tests live in `tests/backend/pytest/architecture/` and
run through `make -f scripts/Makefile test-architecture-locks`. Keep the TOML
registries in sync, including `_archive_allowlist.toml`, `_naming_allowlist.toml`,
`_capabilities_all_allowlist.toml`, and `_endpoint_commit_allowlist.toml`.

## Authorization Capability Contract

Capability policy is governed by `docs/security/authorization-capability-contract.md`,
`docs/security/authorization-capability-contract.json`, and
`docs/security/capability-catalog.json`. The accepted frontend invariant test
home is `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`; per-row
capabilities remain on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`.

## client_factory

Backend API tests should use `client_factory` from `tests/backend/pytest/conftest.py`.
Local `dependency_overrides[get_db]` blocks require an entry in
`tests/backend/pytest/_get_db_override_whitelist.toml`.

## Orchestration model

**The main chat is an orchestrator only.** Real work — file reads, multi-file analysis, code review, audits, lint/test runs, broad refactors — runs in **Opus subagents** dispatched via the `Agent` tool. The main thread plans, dispatches, synthesizes. It does not investigate.

### When to delegate (default)

- Any task that requires reading more than ~3 files to answer.
- Any audit, review, refactor verification, or pre-commit check.
- Any run of `ruff`, `mypy`, `pytest`, `tsc`, `eslint`, or `scripts/security/validate_authz_capability_contract.py`.
- Any cross-cutting search across the codebase.

Direct reads / Bash in the main thread are reserved for: looking up a single line the user just referenced, verifying a single subagent's spot finding, or trivial one-shot commands (e.g. `git status`).

### Dispatch rules

- **Always pass `model: "opus"`** when dispatching review / audit / architecture / security work. Smaller models miss things and fabricate findings.
- **Parallelize independent work** — if you need backend, frontend, and docs reviewed, dispatch all three `Agent` tool calls in a single message. Do NOT sequence them.
- **Self-contained prompts** — subagents see no conversation context. Bake into the prompt: working directory, file paths, what to look for, output format, length cap, what *not* to do.
- **Quote-don't-paraphrase** — instruct subagents to copy exact `file:line` snippets (≤15 words) for every finding. Hallucinated paraphrases are the dominant failure mode (see `memory/feedback_audits_validate_current_code.md`).
- **Empirical over opinion** — spawn an agent that actually runs the gate (`ruff`, `mypy`, `pytest`, the authz contract validator). Don't ask another agent for an opinion on whether code is clean.
- **NEW vs PRE-EXISTING triage** — when lint or type-check fails, dispatch an agent that does `git stash` → re-run → `git stash pop` → diff. Always verify the working tree is restored before returning. The question that matters is "what did THIS PR introduce?".

### Adversarial rounds for high-stakes work

For pre-commit audits, security reviews, and refactor verifications, run multi-round adversarial review with fresh agents each round:

1. **Round 1** (~4 parallel Opus agents): per-domain initial pass — backend services, backend endpoints, frontend, docs/tests.
2. **Round 2** (~7 parallel Opus agents): adversarial re-review — explicitly tell agents Round 1 produced false flags and to verify each finding by reading the current file. Add: cross-reference integrity, security/authz deep-dive, migration safety, real quality-gate runs.
3. **Round 3** (~3 parallel agents): triage findings — ruff NEW-vs-pre-existing (stash diff), mypy NEW-vs-pre-existing (stash diff), validate remaining yellows as REAL / FALSE-FLAG / PRE-EXISTING / TRIVIAL.

Each round uses fresh agents that did NOT see prior findings (or that were briefed adversarially). Synthesize only at the end.

### Reporting format

Subagent reports and the final synthesis use the same shape:

- 🔴 **Critical / blocking**
- 🟡 **Should fix before commit**
- 🟢 **Observations / nice-to-have**
- ✅ **Verified clean** (one line each)

Every finding cites `file:line` and quotes ≤15 words from the file.

### Anti-patterns

- Reading 20 files in the main thread to "understand the codebase". Spawn an `Explore` or `code-explorer` agent.
- Repeating an audit yourself after a subagent did it. If you don't trust the result, dispatch a fresh agent to verify — not yourself.
- Running large lint/test suites in the main thread (output bloats main context). Always delegate.
- Sequencing independent agent calls. If they don't depend on each other, they go in one message with parallel tool uses.
- Trusting a single agent on a high-stakes finding. Adversarial Round 2 catches Round 1 hallucinations.
