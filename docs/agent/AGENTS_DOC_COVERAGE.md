# AGENTS Documentation Coverage Manifest

This manifest tracks AGENTS section coverage in canonical documentation.

Row schema:
- `section_id`
- `agents_heading`
- `canonical_paths`
- `status(full|partial|missing)`
- `gap_notes`
- `verification_date`

| section_id | agents_heading | canonical_paths | status(full\|partial\|missing) | gap_notes | verification_date |
|---|---|---|---|---|---|
| repository_knowledge_map | `Repository Knowledge Map` | `docs/agent/README.md`; `docs/agent/AGENTS_DOC_COVERAGE.md`; `docs/DOCUMENTATION_TREE.md`; `.planning/README.md` | full | none | 2026-03-29 |
| mission | `Mission` | `docs/agent/CODEX_WORKING_RULES.md` | full | none | 2026-02-16 |
| project_map | `Project Map` | `.planning/codebase/STRUCTURE.md`; `.planning/codebase/ARCHITECTURE.md` | full | none | 2026-04-04 |
| source_of_truth_order | `Source-of-Truth Order` | `docs/agent/CODEX_WORKING_RULES.md`; `.planning/codebase/CONVENTIONS.md` | full | none | 2026-02-16 |
| active_work_focus | `Active Work Focus (Default Bias)` | `docs/agent/CODEX_WORKING_RULES.md`; `.planning/STATE.md`; `.planning/ROADMAP.md` | full | none | 2026-02-16 |
| execution_protocol | `Execution Protocol` | `docs/agent/EXECUTION_PROTOCOL.md` | full | none | 2026-02-16 |
| risk_hotspots | `Risk Hotspots (Mandatory Extra Care)` | `.planning/codebase/CONCERNS.md`; `docs/agent/TIMEZONE_POLICY.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-02-16 |
| key_knowledge | `Key Knowledge (Keep In Sync)` | `docs/agent/TIMEZONE_POLICY.md`; `docs/agent/PYTEST_RUNTIME_NOTES.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-03-29 |
| timezone_policy_utc_aware | `Timezone policy (UTC-aware)` | `docs/agent/TIMEZONE_POLICY.md` | full | none | 2026-02-16 |
| postgres_test_mode | `Postgres test mode` | `docs/agent/PYTEST_RUNTIME_NOTES.md`; `.planning/codebase/TESTING.md` | full | none | 2026-03-29 |
| pytest_exit_hang | `Pytest exit hang (SQLite / aiosqlite)` | `docs/agent/PYTEST_RUNTIME_NOTES.md` | full | none | 2026-02-16 |
| endpoint_package_splits | `Endpoint package splits (maintainability)` | `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-02-16 |
| sqlalchemy_fk_cycles | `SQLAlchemy FK cycles (SQLite tests)` | `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-02-16 |
| testing_matrix | `Testing Matrix` | `.planning/codebase/TESTING.md`; `docs/TESTING.md` | full | none | 2026-04-04 |
| rbac_business_logic_guardrails | `RBAC and Business Logic Guardrails` | `docs/BUSINESS_LOGIC.md`; `.planning/codebase/CONCERNS.md` | full | none | 2026-02-16 |
| frontend_display_guardrails | `Frontend Display Guardrails` | `docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md` | full | none | 2026-02-16 |
| security_production_guardrails | `Security and Production Guardrails` | `docs/deployment/security-checklist.md`; `docs/deployment/README.md` | full | none | 2026-02-20 |
| quick_commands | `Quick Commands` | `scripts/install.sh`; `scripts/dev.sh`; `scripts/compose.sh`; `scripts/deploy.sh`; `scripts/Makefile`; `docs/development/README.md` | full | none | 2026-04-04 |
| demo_dev_auth_local | `Demo/Dev Auth (local)` | `scripts/install.sh`; `scripts/dev.sh`; `docs/development/README.md`; `.planning/codebase/INTEGRATIONS.md` | full | none | 2026-04-04 |
| repo_hygiene | `Repo Hygiene` | `.planning/codebase/STRUCTURE.md`; `docs/agent/CODEX_WORKING_RULES.md` | full | none | 2026-02-16 |
| prompting_tooling_best_practices | `Prompting and Tooling Best Practices (OpenAI-Aligned)` | `docs/agent/CODEX_WORKING_RULES.md` | full | none | 2026-02-16 |
| skills | `Skills` | `docs/agent/SKILLS_RESOLUTION.md` | full | none | 2026-02-16 |
