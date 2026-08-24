# AGENTS Documentation Coverage Manifest

This manifest tracks `AGENTS.md` section ownership and supporting documentation.
General policy remains canonical in `AGENTS.md`; supporting files may add detail
or tool-specific deltas without repeating the normative section.

Row schema:
- `section_id`
- `agents_heading`
- `canonical_paths`
- `status(full|partial|missing)`
- `gap_notes`
- `verification_date`

| section_id | agents_heading | canonical_paths | status(full\|partial\|missing) | gap_notes | verification_date |
|---|---|---|---|---|---|
| repository_knowledge_map | `Repository Knowledge Map` | `AGENTS.md`; `docs/agent/README.md`; `docs/agent/AGENTS_DOC_COVERAGE.md`; `docs/DOCUMENTATION_TREE.md`; `docs/DOCUMENTATION_OWNERSHIP.md`; `.planning/README.md` | full | `AGENTS.md` owns navigation policy; indexes provide links. | 2026-08-24 |
| mission | `Mission` | `AGENTS.md` | full | Tool-specific files link to the mission and do not repeat it. | 2026-08-24 |
| project_map | `Project Map` | `AGENTS.md`; `.planning/codebase/STRUCTURE.md`; `.planning/codebase/ARCHITECTURE.md` | full | Planning maps are commit-scoped repository descriptions. | 2026-08-24 |
| source_of_truth_order | `Source-of-Truth Order` | `AGENTS.md`; `docs/DOCUMENTATION_OWNERSHIP.md`; `.planning/codebase/CONVENTIONS.md` | full | `AGENTS.md` owns the precedence list; the ownership document defines information-type authority; tool-specific files link instead of duplicating. | 2026-08-24 |
| active_work_focus | `Active Work Focus (Default Bias)` | `AGENTS.md`; `docs/DOCUMENTATION_OWNERSHIP.md`; `.planning/STATE.md`; `.planning/ROADMAP.md` | full | GitHub or an explicit user task owns live applicability; planning files provide versioned context only. | 2026-08-24 |
| execution_protocol | `Execution Protocol` | `AGENTS.md`; `docs/agent/EXECUTION_PROTOCOL.md` | full | `AGENTS.md` owns the rule; the supporting document provides detail. | 2026-08-24 |
| risk_hotspots | `Risk Hotspots (Mandatory Extra Care)` | `AGENTS.md`; `.planning/codebase/CONCERNS.md`; `docs/agent/TIMEZONE_POLICY.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-08-24 |
| key_knowledge | `Key Knowledge (Keep In Sync)` | `AGENTS.md`; `docs/agent/TIMEZONE_POLICY.md`; `docs/agent/PYTEST_RUNTIME_NOTES.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-08-24 |
| timezone_policy_utc_aware | `Timezone policy (UTC-aware)` | `AGENTS.md`; `docs/agent/TIMEZONE_POLICY.md` | full | none | 2026-08-24 |
| postgres_test_mode | `Postgres test mode` | `AGENTS.md`; `docs/agent/PYTEST_RUNTIME_NOTES.md`; `.planning/codebase/TESTING.md` | full | none | 2026-08-24 |
| pytest_exit_hang | `Pytest exit hang (SQLite / aiosqlite)` | `AGENTS.md`; `docs/agent/PYTEST_RUNTIME_NOTES.md` | full | none | 2026-08-24 |
| endpoint_package_splits | `Endpoint package splits (maintainability)` | `AGENTS.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-08-24 |
| sqlalchemy_fk_cycles | `SQLAlchemy FK cycles (SQLite tests)` | `AGENTS.md`; `docs/agent/ENDPOINT_INVARIANTS.md` | full | none | 2026-08-24 |
| testing_matrix | `Testing Matrix` | `AGENTS.md`; `.planning/codebase/TESTING.md`; `docs/TESTING.md` | full | none | 2026-08-24 |
| rbac_business_logic_guardrails | `RBAC and Business Logic Guardrails` | `AGENTS.md`; `docs/security/authorization-capability-contract.md`; `docs/security/authorization-capability-contract.json`; `docs/BUSINESS_LOGIC.md`; `.planning/codebase/CONCERNS.md` | full | none | 2026-08-24 |
| frontend_display_guardrails | `Frontend Display Guardrails` | `AGENTS.md`; `docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md` | full | none | 2026-08-24 |
| security_production_guardrails | `Security and Production Guardrails` | `AGENTS.md`; `docs/deployment/security-checklist.md`; `docs/deployment/README.md` | full | none | 2026-08-24 |
| quick_commands | `Quick Commands` | `AGENTS.md`; `scripts/install.sh`; `scripts/dev.sh`; `scripts/compose.sh`; `scripts/deploy.sh`; `scripts/Makefile`; `docs/development/README.md`; `docs/deployment/reference.md` | full | none | 2026-08-24 |
| demo_dev_auth_local | `Demo/Dev Auth (local)` | `AGENTS.md`; `scripts/install.sh`; `scripts/dev.sh`; `docs/development/README.md`; `.planning/codebase/INTEGRATIONS.md` | full | none | 2026-08-24 |
| repo_hygiene | `Repo Hygiene` | `AGENTS.md`; `.planning/codebase/STRUCTURE.md` | full | Tool-specific files link to the canonical section and do not repeat it. | 2026-08-24 |
| prompting_tooling_best_practices | `Prompting and Tooling Best Practices (OpenAI-Aligned)` | `AGENTS.md` | full | Tool-specific files link to the canonical section and do not repeat it. | 2026-08-24 |
| skills | `Skills` | `AGENTS.md`; `docs/agent/SKILLS_RESOLUTION.md` | full | none | 2026-08-24 |
