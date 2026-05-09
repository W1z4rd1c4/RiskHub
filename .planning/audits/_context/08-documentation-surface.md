# Phase 1 Context Map — Documentation Surface (Agent 8)

Mission: enumerate every doc that constrains code, so the resolution plan's
"README & Lock Change Register" section is comprehensive. The user's working
principle: docs are outputs of decisions. If the cleanest architecture says
delete a module, the README/lock changes alongside the deletion.

All citations are file:line with quoted ≤15-word excerpts from the current
working tree as of branch `main` (commit `1ee872a4`).

---

## 1. Top-Tier Constraint Documents

### `AGENTS.md` (root)

- `AGENTS.md:1`: "RiskHub — AGENTS Playbook" — repository-level agent contract.
- `AGENTS.md:5`: "Canonical Source: `docs/agent/README.md`, `docs/agent/AGENTS_DOC_COVERAGE.md`" —
  declares that every section maps to a canonical source.
- `AGENTS.md:11-34`: large coverage table mapping each AGENTS section to one or
  more canonical doc paths; columns are `AGENTS Section | Canonical Source(s)
  | Coverage | Owner | Last Verified`. Any rename/delete of a referenced
  canonical doc requires an AGENTS update.
- `AGENTS.md:155-163` (Endpoint Package Splits subsection):
  - `AGENTS.md:157`: enumerates "controls/, risks/, kris/, dashboard/, issues/,
    reports/, riskhub/, approvals/, departments/, users/, vendors/,
    vendor_incidents/, vendor_dependencies/, vendor_slas/, admin/,
    risk_questionnaires/" as required endpoint **packages**.
  - `AGENTS.md:158`: invariant "`app.api.v1.endpoints.<name>.router` must
    remain the exported router object".
  - `AGENTS.md:160-163`: required re-exports including
    `AGENTS.md:162`: "`app.api.v1.endpoints.riskhub.get_cro_user` (used by
    `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)".
- `AGENTS.md:218-231` (Architecture Locks):
  - `AGENTS.md:220`: "Backend architecture invariant tests live in
    `tests/backend/pytest/architecture/` … `pytest.mark.contract`".
  - `AGENTS.md:221`: "Run `make -f scripts/Makefile test-architecture-locks`
    after changing capability exports, transaction ownership…".
  - `AGENTS.md:223-229`: locked TOML registry list:
    `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`,
    `_archive_allowlist.toml`, `_naming_allowlist.toml`,
    `_get_db_override_whitelist.toml`, `_audit_matrix.toml`,
    `_reserved_modules.toml`.
  - `AGENTS.md:230`: "Outbox worker transaction ownership is consolidated in
    `backend/app/services/outbox/dispatcher.py`; `…/store.py` flushes only".
  - `AGENTS.md:231`: "Transaction-boundary changes follow ADR-002; archive-state
    changes follow ADR-005; forward-only Postgres migration rehearsals follow
    ADR-010."
- `AGENTS.md:188-205` (RBAC and Business Logic Guardrails):
  - `AGENTS.md:191`: "Frontend action visibility must prefer backend
    `capabilities` metadata when available".
  - `AGENTS.md:201-204`: lists files to reconcile on permission change,
    including `docs/security/authorization-capability-contract.md`,
    `…json`, and `docs/BUSINESS_LOGIC.md`.
  - `AGENTS.md:205`: "Authorization-sensitive changes must pass
    `python3 scripts/security/validate_authz_capability_contract.py`".
- `AGENTS.md:207-214` (Authorization Capability Contract):
  - `AGENTS.md:212`: "Per-row capability data remains on
    `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`".
  - `AGENTS.md:213`: pinned frontend invariant test path
    `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`.
- `AGENTS.md:240-247` (Frontend Display Guardrails): forbids raw numeric IDs in
  user-facing UI; quotes `AGENTS.md:246`: "Technical IDs are acceptable in
  logs, telemetry, and developer tooling only…".

Locks code in: `riskhub_questionnaires.py` (S8.5), the 16 listed endpoint
packages, the 3 required re-exports, the outbox dispatcher/store split,
the per-row capability shape, the canonical authz frontend test home.

### `CLAUDE.md` (root)

- `CLAUDE.md:3`: "See [AGENTS.md](AGENTS.md) for project guidance and
  conventions" — defers to AGENTS.md.
- `CLAUDE.md:14-19` (Architecture Locks): "Backend invariant-lock tests live
  in `tests/backend/pytest/architecture/` and run through
  `make -f scripts/Makefile test-architecture-locks`. Keep the TOML registries
  in sync, including `_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, and `_endpoint_commit_allowlist.toml`."
- `CLAUDE.md:21-27` (Authorization Capability Contract): "Capability policy is
  governed by `docs/security/authorization-capability-contract.md`,
  `docs/security/authorization-capability-contract.json`, and
  `docs/security/capability-catalog.json`. The accepted frontend invariant
  test home is `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`;
  per-row capabilities remain on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`."
- `CLAUDE.md:29-33` (client_factory): pins `client_factory` from
  `tests/backend/pytest/conftest.py` and the
  `_get_db_override_whitelist.toml` exception registry.
- `CLAUDE.md:35-84`: orchestration model rules (subagent dispatch, adversarial
  rounds). Process-level — no specific code lock.

### `docs/agent/ENDPOINT_INVARIANTS.md`

- `docs/agent/ENDPOINT_INVARIANTS.md:7`: lists required packages "controls/,
  risks/, kris/, dashboard/, issues/, reports/, riskhub/, approvals/,
  departments/, users/, vendors/, admin/, risk_questionnaires/." (note: this
  list is **shorter** than AGENTS.md:157 — missing vendor_incidents/,
  vendor_dependencies/, vendor_slas/).
- `docs/agent/ENDPOINT_INVARIANTS.md:8`: "Invariant: `app.api.v1.endpoints.
  <name>.router` must remain the exported router object".
- `docs/agent/ENDPOINT_INVARIANTS.md:11-14`: required re-exports list,
  `docs/agent/ENDPOINT_INVARIANTS.md:13`: "`app.api.v1.endpoints.riskhub.
  get_cro_user` (used by `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)".
- `docs/agent/ENDPOINT_INVARIANTS.md:18-19`: SQLAlchemy FK cycle note for
  `Department.manager_id -> users.id` `use_alter=True`.
- `docs/agent/ENDPOINT_INVARIANTS.md:22`: "Verification date: 2026-02-16".

---

## 2. README Inventory (full list, paths only)

### Root, planning, and infrastructure
- `/README.md`
- `/CLAUDE.md` (not a README, listed for completeness)
- `/AGENTS.md` (not a README, listed for completeness)
- `/.planning/README.md`
- `/.planning/phases/README.md`
- `/.planning/phases/152-audit-resolution-2/README.md`
- `/.planning/phases/250-spaghetti-simplification/README.md`
- `/.pytest_cache/README.md`
- `/docker/README.md`
- `/docker/redis/README.md`
- `/scripts/README.md`
- `/scripts/deploy/README.md`
- `/scripts/deploy/lib/README.md`
- `/scripts/deploy/templates/README.md`
- `/scripts/deploy/templates/linux/README.md`
- `/scripts/install_lib/README.md`
- `/scripts/prod/README.md`
- `/scripts/prod/config/README.md`
- `/scripts/prod/lib/README.md`
- `/scripts/quality/README.md`
- `/scripts/release/README.md`
- `/scripts/security/README.md`
- `/scripts/security/release_parity_audit/README.md`
- `/scripts/tests/README.md`
- `/scripts/tools/README.md`
- `/tests/README.md`
- `/tests/backend/README.md`
- `/tests/backend/pytest/README.md`
- `/tests/backend/pytest/.pytest_cache/README.md`
- `/tests/backend/pytest/api/README.md`
- `/tests/backend/pytest/api/v1/README.md`
- `/tests/frontend/README.md`
- `/tests/frontend/e2e/README.md`
- `/tests/frontend/e2e/{activity-logging,approval-workflows,cross-department,entity-ownership,fixtures,helpers,legacy,pages,permissions,sensitive-fields,setup}/README.md`
- `/tests/frontend/unit/**` — extensive mirror tree (see `find` output for
  the full set; ~70 mirrored READMEs).

### Backend
- `/backend/.pytest_cache/README.md`
- `/backend/README.md`
- `/backend/alembic/versions/README.md`
- `/backend/data/README.md`
- `/backend/data/seed_assets/README.md`
- `/backend/docs/README.md`
- `/backend/scripts/README.md`
- `/backend/scripts/runtime/README.md`
- `/backend/scripts/runtime/db/README.md`
- `/backend/security/README.md`

#### Backend code-tree READMEs
- `/backend/app/README.md`
- `/backend/app/api/README.md`
- `/backend/app/api/mappers/README.md`
- `/backend/app/api/v1/README.md`
- `/backend/app/api/v1/endpoints/README.md`
- `/backend/app/api/v1/endpoints/admin/README.md`
- `/backend/app/api/v1/endpoints/approvals/README.md`
- `/backend/app/api/v1/endpoints/auth/README.md`
- `/backend/app/api/v1/endpoints/controls/README.md`
- `/backend/app/api/v1/endpoints/controls/crud/README.md`
- `/backend/app/api/v1/endpoints/dashboard/README.md`
- `/backend/app/api/v1/endpoints/departments/README.md`
- `/backend/app/api/v1/endpoints/issues/README.md`
- `/backend/app/api/v1/endpoints/issues/_shared/README.md`
- `/backend/app/api/v1/endpoints/issues/crud/README.md`
- `/backend/app/api/v1/endpoints/kris/README.md`
- `/backend/app/api/v1/endpoints/kris/crud/README.md`
- `/backend/app/api/v1/endpoints/reports/README.md`
- `/backend/app/api/v1/endpoints/reports/unified_exports/README.md`
- `/backend/app/api/v1/endpoints/risk_questionnaires/README.md`
- `/backend/app/api/v1/endpoints/riskhub/README.md`
- `/backend/app/api/v1/endpoints/risks/README.md`
- `/backend/app/api/v1/endpoints/risks/crud/README.md`
- `/backend/app/api/v1/endpoints/users/README.md`
- `/backend/app/api/v1/endpoints/vendor_dependencies/README.md`
- `/backend/app/api/v1/endpoints/vendor_incidents/README.md`
- `/backend/app/api/v1/endpoints/vendor_slas/README.md`
- `/backend/app/api/v1/endpoints/vendors/README.md`
- `/backend/app/core/README.md`
- `/backend/app/core/_permissions/README.md`
- `/backend/app/core/_snapshot_metrics/README.md`
- `/backend/app/core/settings/README.md`
- `/backend/app/db/README.md`
- `/backend/app/i18n/README.md`
- `/backend/app/integrations/README.md`
- `/backend/app/integrations/vendor_signals/README.md`
- `/backend/app/middleware/README.md`
- `/backend/app/middleware/rate_limit/README.md`
- `/backend/app/models/README.md`
- `/backend/app/schemas/README.md`
- `/backend/app/services/README.md`
- `/backend/app/services/_access_workflow/README.md`
- `/backend/app/services/_admin_telemetry/README.md`
- `/backend/app/services/_approval_execution/README.md`
- `/backend/app/services/_auth_session_workflow/README.md`
- `/backend/app/services/_authorization_capabilities/README.md`
- `/backend/app/services/_control_execution/README.md`
- `/backend/app/services/_directory_sync/README.md`
- `/backend/app/services/_issue_register/README.md`
- `/backend/app/services/_issue_workflow/README.md`
- `/backend/app/services/_kri_history/README.md`
- `/backend/app/services/_monitoring_status/README.md`
- `/backend/app/services/_orphaned_items/README.md`
- `/backend/app/services/_quarterly_comparison/README.md`
- `/backend/app/services/_reporting/README.md`
- `/backend/app/services/_risk_questionnaires/README.md`
- `/backend/app/services/_riskhub_config/README.md`
- `/backend/app/services/_vendor_links/README.md`
- `/backend/app/services/_vendor_workflow/README.md`
- `/backend/app/services/outbox/README.md`
- `/backend/app/services/outbox/handlers/README.md`

NOTE: `backend/app/services/_register_listings/` does **not** have a README
(verified via `find … -name "README.md"`; there are six python modules:
`__init__.py, controls.py, issues.py, kris.py, lifecycle.py, risks.py,
vendors.py`). This is the basis for the audit's S8.1 reject reason being
**not** a missing _register_listings README — see Section 4 for full
analysis.

#### Backend code-tree directories WITHOUT README that the audit references
- `backend/app/services/_register_listings/` (directory exists, no README,
  but is referenced as canonical authority in
  `docs/security/authorization-capability-contract.md:110, 121, 128, 166,
  168, 169` and `docs/adr/ADR-007-bounded-context-taxonomy.md:13`).
- `backend/app/services/_auth_session/` (referenced in
  `docs/security/authorization-capability-contract.md:131`,
  `docs/security/authorization-capability-contract.json:87`); no README found.
- `backend/app/services/_dashboard_metrics/`, `_org_chart/`,
  `_entity_mutation_lifecycle/`, `_vendor_governance/`, `_approval_queue/`,
  `_notification_inbox/`, `_directory_identity/`, `_identity_access_lifecycle/`,
  `_config/`, `_deadline_execution/`, `_activity_log_query/`, `_auth_session/`
  — none have READMEs (per `find` output).

### Frontend
- `/frontend/README.md`
- `/frontend/public/README.md`
- `/frontend/public/docs/README.md`
- `/frontend/scripts/README.md`
- `/frontend/scripts/cleanup/README.md`
- `/frontend/scripts/i18n/README.md`
- `/frontend/scripts/quality/README.md`
- `/frontend/scripts/runtime/README.md`

#### Frontend code-tree READMEs (full list)
- `/frontend/src/README.md`
- `/frontend/src/__tests__/README.md`
- `/frontend/src/assets/README.md`
- `/frontend/src/authz/README.md`
- `/frontend/src/components/__tests__/README.md`
- `/frontend/src/components/access/README.md`
- `/frontend/src/components/activity-log/README.md`
- `/frontend/src/components/control-form/README.md`
- `/frontend/src/components/controls/README.md`
- `/frontend/src/components/dashboard/README.md`
- `/frontend/src/components/dashboard/__tests__/README.md`
- `/frontend/src/components/documentation/README.md`
- `/frontend/src/components/documentation/__tests__/README.md`
- `/frontend/src/components/executions/README.md`
- `/frontend/src/components/forms/README.md`
- `/frontend/src/components/governance/README.md`
- `/frontend/src/components/history/README.md`
- `/frontend/src/components/issues/README.md`
- `/frontend/src/components/issues/__tests__/README.md`
- `/frontend/src/components/issues/remediation/README.md`
- `/frontend/src/components/kri-form/README.md`
- `/frontend/src/components/kri/README.md`
- `/frontend/src/components/kris/README.md`
- `/frontend/src/components/layout/README.md`
- `/frontend/src/components/layout/__tests__/README.md`
- `/frontend/src/components/linking/README.md`
- `/frontend/src/components/notifications/README.md`
- `/frontend/src/components/notifications/__tests__/README.md`
- `/frontend/src/components/reports/README.md`
- `/frontend/src/components/risk-form/README.md`
- `/frontend/src/components/riskhub/README.md`
- `/frontend/src/components/riskhub/roles/README.md`
- `/frontend/src/components/risks/README.md`
- `/frontend/src/components/risks/__tests__/README.md`
- `/frontend/src/components/risks/detail-overview/README.md`
- `/frontend/src/components/risks/risk-questionnaire-detail/README.md`
- `/frontend/src/components/settings/README.md`
- `/frontend/src/components/settings/__tests__/README.md`
- `/frontend/src/components/tables/README.md`
- `/frontend/src/components/tables/__tests__/README.md`
- `/frontend/src/components/ui/README.md`
- `/frontend/src/components/users/README.md`
- `/frontend/src/components/vendor-form/README.md`
- `/frontend/src/components/vendors/README.md`
- `/frontend/src/config/README.md`
- `/frontend/src/constants/README.md`
- `/frontend/src/contexts/README.md`
- `/frontend/src/contexts/__tests__/README.md`
- `/frontend/src/contexts/auth/README.md`
- `/frontend/src/hooks/README.md`
- `/frontend/src/i18n/README.md`
- `/frontend/src/i18n/__tests__/README.md`
- `/frontend/src/i18n/locales/{cs,en}/README.md`
- `/frontend/src/lib/README.md`
- `/frontend/src/pages/README.md`
- `/frontend/src/pages/__tests__/README.md`
- `/frontend/src/pages/admin-console/README.md`
- `/frontend/src/pages/admin-console/sections/README.md`
- `/frontend/src/pages/admin-console/sections/audit/README.md`
- `/frontend/src/pages/admin-console/sections/ops/README.md`
- `/frontend/src/pages/{approvals,controls,dashboard,departments,detail,issues,issues/issue-detail,kris,login,risks,shared,users,vendors}/README.md`
- `/frontend/src/quality/README.md`
- `/frontend/src/quality/__tests__/README.md`
- `/frontend/src/routing/README.md`
- `/frontend/src/services/__tests__/README.md`
- `/frontend/src/services/admin/README.md`
- `/frontend/src/services/api/README.md`
- `/frontend/src/services/api/schemas/README.md`
- `/frontend/src/services/api/schemas/entities/README.md`
- `/frontend/src/services/session/README.md`
- `/frontend/src/types/README.md`
- `/frontend/src/utils/README.md`

### docs/ tree (excluding `adr/` and `security/`)

Top-level constraint docs:
- `/docs/README.md`
- `/docs/AUTHZ_LIST_POLICY.md`
- `/docs/BUSINESS_LOGIC.md`
- `/docs/DOCUMENTATION_TREE.md`
- `/docs/E2E_TESTING.md`
- `/docs/GLOSSARY.md`
- `/docs/LOCALIZATION.md`
- `/docs/PERFORMANCE_BASELINE.md`
- `/docs/TESTING.md`

Subtrees (explicit; no opinion offered):
- `/docs/admin/` and `/docs/admin-cs/`: 9 EN + 9 CS admin runbook MDs.
- `/docs/agent/`: 8 agent-policy docs (README, ENDPOINT_INVARIANTS, EXECUTION_PROTOCOL,
  TIMEZONE_POLICY, PYTEST_RUNTIME_NOTES, FRONTEND_DISPLAY_GUARDRAILS,
  CODEX_WORKING_RULES, SKILLS_RESOLUTION, AGENTS_DOC_COVERAGE).
- `/docs/assets/`, `/docs/assets/readme/`: README screenshot manifest.
- `/docs/audits/`: README + 1 audit (`entra-audit-2026-04-20.md`).
- `/docs/deployment/`: 7 deployment docs.
- `/docs/development/`: 1 README.
- `/docs/quality/`: 8 quality/baseline docs.
- `/docs/reference/`: 7 reference docs (LEGACY_PATH_MAP, README_COVERAGE_POLICY,
  topology audits, permission filtering summary, readme_coverage).
- `/docs/user/` and `/docs/user-cs/`: 14 EN + 14 CS user manuals.
- (`docs/adr/` and `docs/security/` deferred to Agent 5.)

---

## 3. What Each Critical Doc Constrains

For every code-tree doc the audit's deferred items touch, this section
documents what the README pins.

### Backend service READMEs (organized by audit-finding relevance)

#### `backend/app/services/_quarterly_comparison/README.md` (S8.1 anchor)
- `:1`: "# backend/app/services/_quarterly_comparison".
- `:5`: "Internal helpers for the dashboard quarterly comparison service".
- `:9-12`: lists `changes.py, period_metrics.py, periods.py, snapshots.py`.
- `:16`: **load-bearing constraint** — "Keep
  `backend/app/services/quarterly_comparison_service.py` as the public service
  entrypoint."
- The developer's S8.1 reject explicitly cites this file:line as evidence the
  facade must remain. See `developer answer.md:659`: "Evidence reviewed: …
  `backend/app/services/_quarterly_comparison/README.md:16`".

#### `backend/app/services/_vendor_links/README.md` (S5.1 / vendor link finding context)
- `:1`: "# backend/app/services/_vendor_links".
- `:5`: "Shared vendor link workflow across risk, control, and KRI target types".
- `:9`: "`workflow.py` - target adapters plus list, link, and unlink operations".
- `:13`: "Keep public vendor link endpoints stable. Link visibility,
  active-vendor validation, duplicate prevention, and archive metadata should
  flow through this package."

#### `backend/app/services/_auth_session_workflow/README.md` (#71 / S7.8 context)
- `:1`: "# backend/app/services/_auth_session_workflow".
- `:5`: "Shared service-layer workflow for admin auth/session operations".
- `:14`: "Admin session endpoints should use this package for active-session
  projection, self-revoke protection, target-user locking, refresh-token
  revocation, token-version bumps, and activity logging".

#### `backend/app/services/_risk_questionnaires/README.md` (S8.5 context)
- `:5`: "Internal helpers for risk questionnaire policy, loading, validation,
  and workflow actions".
- `:16`: "Keep `backend/app/services/risk_questionnaire_service.py` as the
  compatibility facade".

#### `backend/app/services/_authorization_capabilities/README.md` (S6.6 / #60 context)
- `:5`: "Resource-specific backend capability builders used by the public
  authorization capability facade".
- `:21`: "Keep `backend/app/services/authorization_capabilities.py` as the
  stable facade".

#### `backend/app/services/_admin_telemetry/README.md`
- `:5`: "Internal projection helpers for admin operations telemetry".
- `:13`: "Admin routes remain responsible for platform-admin guards. This
  package should only shape already-authorized operational telemetry payloads".

#### `backend/app/services/_riskhub_config/README.md`
- `:5`: "Shared service-layer workflow for Risk Hub role and department
  configuration".
- `:15`: "Risk Hub config endpoints should use this package for protected
  role/department invariants…".

#### `backend/app/services/_vendor_workflow/README.md`
- `:5`: "Shared service-layer policy for vendor visibility, ownership
  exceptions, lifecycle authority, and report scoping".

#### `backend/app/services/_access_workflow/README.md`
- `:5`: "Shared service-layer policy for access-user lifecycle and editable
  access fields".

#### `backend/app/services/_control_execution/README.md`
- `:5`: "Shared service-layer workflow for control execution creation,
  execution capabilities, and linked-risk visibility".

#### `backend/app/services/_monitoring_status/README.md`
- `:5-7`: "Shared backend derivation package for canonical control and KRI
  monitoring status, including typed result objects and config-backed thresholds".
- `:18-20`: "This package is the source of truth for monitoring-status derivation
  used by API serializers, filters, stats, and exports".

#### `backend/app/services/outbox/README.md`
- `:5`: "Transactional outbox package split by responsibility".
- `:9-19`: lists `store.py`, `dispatcher.py`, `registry.py`, `handlers/`,
  `payloads.py` with one-line owner per file.
- `:22-23`: "Persistence/claim logic and handler execution must stay separated.
  Non-Postgres runtimes are treated as single-worker only…".

#### `backend/app/services/outbox/handlers/README.md`
- `:5`: "Per-domain transactional outbox handlers".
- `:21`: "Retry vs dead-letter policy is owned by
  `backend/app/services/outbox/dispatcher.py`, not by these handler modules".
- `:22`: "Domain handler modules are registered through the outbox registry".

### Backend endpoint READMEs (audit-relevant subset)

Most endpoint READMEs are auto-generated boilerplate ("Keep this README updated
when responsibilities or structure in this folder change") and only list the
package contents. They become load-bearing when the audit deletes a file
mentioned, because the README will go stale.

Specific endpoint READMEs that **lock specific names**:
- `backend/app/api/v1/endpoints/auth/README.md:26-31`: lists 5 security
  invariants ("bearer auth accepts only RiskHub access tokens", refresh
  cookie-only, `/auth/csrf` is the only CSRF-seeding endpoint, etc.).
- `backend/app/api/v1/endpoints/users/README.md:25-31`: explicit per-file
  semantics ("`lookup.py` is the authenticated picker/search primitive",
  "`_lifecycle.py` contains the Admin-only guard", "`directory.py` is the
  explicit paginated directory contract"). Renaming any of those files
  requires a README change.
- `backend/app/api/v1/endpoints/vendor_dependencies/README.md:9`: "(empty)"
  reserved package.
- `backend/app/api/v1/endpoints/vendor_incidents/README.md:9`: "(empty)"
  reserved package.
- `backend/app/api/v1/endpoints/vendor_slas/README.md:9`: "(empty)"
  reserved package.

`backend/app/api/v1/endpoints/risk_questionnaires/README.md:9-15` enumerates
contents (`_shared.py`, `clarifications.py`, `inbox.py`, `questionnaire.py`,
`risk_routes.py`) — does not mention the sibling
`backend/app/api/v1/endpoints/riskhub_questionnaires.py` file.

`backend/app/api/v1/endpoints/riskhub/README.md:9-19`: lists
`approval_scenarios.py, departments.py, global_config.py, permissions.py,
public_config.py, risk_types.py, roles.py` — also no mention of the
sibling `riskhub_questionnaires.py` (which is a single file, not a package).

### Frontend READMEs (deferred-item-relevant)

#### `frontend/src/contexts/README.md` (FE-N5 / #66 anchor)
- `:5`: "Folder for `frontend/src/contexts` implementation assets".
- `:9-12`: contents list: `__tests__/, AuthContext.tsx,
  DashboardFilterContext.tsx, ThemeContext.tsx`.
- `:16`: "Keep this README updated when responsibilities or structure in this
  folder change".

#### `frontend/src/contexts/auth/README.md` (FE-N5 / #66 detail)
- `:5`: "Focused auth-provider helpers used by `AuthContext.tsx`".
- `:9-16`: lists per-file roles (`permissions.ts`, `useAuthActions.ts`,
  `useAuthBootstrap.ts`, `usePreferenceHydration.ts`).
- `:20`: "Keep `AuthContext.tsx` as composition glue."
- `:21-23`: "The canonical client auth state lives in
  `frontend/src/services/session/store.ts`. … `frontend/src/services/session/
  manager.ts` owns the allowed session-state transitions … do not reintroduce
  a second auth cache."

#### `frontend/src/services/session/README.md` (#71 / S7.8 anchor)
- `:1`: "## Session Services".
- `:3-4`: "This package is the single frontend boundary for auth-session state
  and session-specific side effects".
- `:6-10`: list of responsibilities: storing/reading current auth session,
  bootstrap-time session hydration, refresh and logout suppression hints,
  refresh-only silent session recovery.
- `:12-13`: "Keep transport concerns in `frontend/src/services/api/` and
  `authApi.ts`. Keep React-specific orchestration in
  `frontend/src/contexts/auth/`."

#### `frontend/src/components/governance/README.md` (#45 / BE-N8 ownership context)
- `:9-12`: contents: `index.ts, OrphanedItemsTable.tsx, OrphanQuickViewModal.tsx,
  ResolveOrphanModal.tsx`.

#### `frontend/src/components/dashboard/README.md` (#68 / FE-N8 anchor)
- `:9-24`: contents listing including `QuarterlyComparisonWidget.tsx`,
  `KRIBreachWidget.tsx`, `KRIStatusWidget.tsx`, `IssuesSummaryCard.tsx`,
  `IssueAgingChart.tsx`, etc.
- `:28-30`: "`KRIStatusWidget.tsx` owns the dashboard KRI drill-down
  contract: overdue -> `/kris?monitoring_status=not_submitted`,
  upcoming -> `/kris?timeliness_status=due_soon`."

#### `frontend/src/components/linking/README.md`
- `:24-26`: "`LinkManagementDialog` remains the public compatibility component
  outside this folder".

#### `frontend/src/components/risks/risk-questionnaire-detail/README.md`
- `:1`: "# Risk Questionnaire Detail Module".
- `:3-5`: "module contains the `RiskQuestionnaireDetail` implementation split
  from `frontend/src/components/risks/RiskQuestionnaireDetail.tsx` to
  preserve the existing public import path".

### Top-level docs that constrain code

#### `docs/README.md`
- `docs/README.md:78-89` (Architecture Locks section): repeats the lock TOML
  registry list (`_capabilities_all_allowlist.toml`,
  `_endpoint_commit_allowlist.toml`, `_archive_allowlist.toml`,
  `_naming_allowlist.toml`, `_audit_matrix.toml`).
- `docs/README.md:91-102` (Authorization Capability Contract): pins
  `docs/security/authorization-capability-contract.{md,json}`,
  `docs/security/capability-catalog.json`,
  `backend/app/api/v1/endpoints/_reserved_modules.toml`,
  `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`,
  `tests/backend/pytest/test_risks.py`.
- `docs/README.md:104-112` (Migration Rehearsal): "ADR-005, ADR-002, ADR-009,
  ADR-010".
- `docs/README.md:111-112`: **vendor.status / #70 anchor** —
  "`backend/app/services/outbox/dispatcher.py`. `ControlStatus.inactive` remains
  a non-archive lifecycle state; vendor `inactive` is not retained as a
  lifecycle status."
- `docs/README.md:120-123` (Boundary Notes): canonical doc trees vs `.planning/phases/*`
  archival.

#### `docs/DOCUMENTATION_TREE.md`
- `docs/DOCUMENTATION_TREE.md:14-39`: tree map showing every required canonical
  README (`AGENTS.md`, all `docs/*/README.md`, `.planning/README.md`).
- `docs/DOCUMENTATION_TREE.md:67-74` (Architecture Locks): same TOML list as
  AGENTS.md/docs/README.md.
- `docs/DOCUMENTATION_TREE.md:75-81`: pins authorization-capability-contract
  and the canonical authz invariant test path.
- `docs/DOCUMENTATION_TREE.md:82-84`: outbox dispatcher path + ControlStatus.inactive.
- `docs/DOCUMENTATION_TREE.md:86-89`: ADR-001/002/005/010 anchors.
- `docs/DOCUMENTATION_TREE.md:124-126` (Reachability Contract): "Canonical
  leaf documents under `docs/` and `.planning/codebase/` must be reachable
  through markdown links from at least one root entrypoint … within 3 hops".

#### `docs/agent/README.md`
- `docs/agent/README.md:7-9`: declares canonical scope as `docs/` and
  `.planning/codebase/`.
- `docs/agent/README.md:14-21`: lists 7 canonical agent topic docs by name.

#### `docs/TESTING.md`
- `docs/TESTING.md:19`: lists per-suite paths including
  `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py` (S8.5 anchor).
- `docs/TESTING.md:23, 175, 238, 251`: vendor link test path
  `tests/backend/pytest/test_vendor_links.py`.
- `docs/TESTING.md:74`: "SQLite/non-Postgres outbox dispatch is intentionally
  single-worker only…".

#### `docs/BUSINESS_LOGIC.md`
- `docs/BUSINESS_LOGIC.md:619`: "POST /api/v1/vendors/{id}/restore … `is_archived=false`,
  clear archive metadata (`status='active'` as backward-compat alias)" — the
  only doc reference to vendor `status` field as a backward-compat alias.

#### `docs/AUTHZ_LIST_POLICY.md`, `docs/PERFORMANCE_BASELINE.md`,
`docs/E2E_TESTING.md`, `docs/LOCALIZATION.md`, `docs/GLOSSARY.md`
- Top-level policy docs; generally referenced from `docs/README.md:34-44`.
- Not deep-checked for finding-specific anchors; spot-check showed no direct
  references to S8.1, S8.5, S5.7, S7.8, S6.6, S5.9, BE-N8, FE-N5, FE-N8.

#### `docs/adr/ADR-007-bounded-context-taxonomy.md` (referenced in finding #74)
- `:13`: "Architecture sweeps use seven bounded contexts: `_riskhub_config`,
  `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`,
  `_approval_execution`, `_entity_mutation_lifecycle`, and `_kri_history`."
  — locks `_register_listings/` as a recognized context (S8.1 evidence).

#### `docs/adr/ADR-005-archivable-mixin-schema-contract.md` (#70 / vendor.status)
- `:13-19`: "Vendor `inactive` is treated as legacy archive state and
  normalized into `Vendor.is_archived`".
- `:17`: "`ControlStatus.inactive` retention (v5.3+)".

#### `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` (#69, #70)
- `:11-30`: rehearsal contract; `:25`: "`vendors.status='inactive'` rows
  become `status='active'` with `is_archived=true`."

### Planning-tree code-binding docs

#### `.planning/codebase/CONCERNS.md`
- `:8-9`: lists "Risk questionnaire lifecycle, clarification, compare-mode,
  and one-open-questionnaire invariant: `…/risk_questionnaire_service.py`,
  `…/_risk_questionnaires/`, `…/risk_questionnaires/`,
  `backend/app/api/v1/endpoints/riskhub_questionnaires.py`,
  `frontend/src/components/risks/risk-questionnaire-detail/`" — **second
  doc anchor naming `riskhub_questionnaires.py` as load-bearing** (S8.5).
- `:14`: "Committee quarterly snapshot semantics: `…/quarterly_comparison_service.py`,
  `…/_quarterly_comparison/`, `…/dashboard/quarterly.py`" — **second doc
  anchor naming the quarterly facade as load-bearing** (S8.1).
- `:15`: vendor-link concern: `frontend/src/components/linking/`,
  `backend/app/services/_vendor_links/`,
  `backend/app/api/v1/endpoints/vendor_links.py`.
- `:20`: "Admin auth/session workflow and telemetry:
  `backend/app/services/_auth_session_workflow/`, `…/_admin_telemetry/`,
  `backend/app/api/v1/endpoints/admin/console.py`,
  `frontend/src/pages/admin-console/sections/AdminConsoleOpsPanels.tsx`".
- `:40`: "Client auth/session state is centralized in the in-memory
  `sessionStore`; keep `frontend/src/services/bootstrapSessionCache.ts` as
  a compatibility layer only and prevent new duplicate auth-state adapters".

#### `.planning/codebase/CONVENTIONS.md`
- `:22`: "Large services may be split into internal packages under
  `backend/app/services/_*/` with a public facade module that re-exports
  stable symbols (`…/approval_execution_service.py`,
  `…/risk_questionnaire_service.py`, `…/quarterly_comparison_service.py`,
  `…/_approval_execution/`, `…/_issue_register/`, `…/_vendor_links/`,
  `…/_admin_telemetry/`, `…/_issue_workflow/`, `…/_kri_history/`,
  `…/_risk_questionnaires/`, `…/_quarterly_comparison/`)" — **third doc
  anchor blessing the quarterly_comparison_service.py facade pattern** (S8.1).

#### `.planning/codebase/STRUCTURE.md`
- `:25`: enumerates internal helper packages including `_quarterly_comparison`,
  `_risk_questionnaires`, `_auth_session_workflow`.

#### `.planning/codebase/TESTING.md`
- `:70`: "Backend questionnaire workflow: `cd backend && ./venv/bin/pytest -q
  …/test_riskhub_questionnaires.py`" — third doc anchor for `riskhub_
  questionnaires` as a live test suite.

### docs/security/ (Agent 5 territory; only cross-references noted)

The audit's S5.1 / C-N2 (#13) and S7.5 / S7.6 / S5.7 (#55, #56, #70) require
contract sync in:
- `docs/security/authorization-capability-contract.md:121-122` (vendor link
  citations: `vendor_link_helpers.py`).
- `docs/security/authorization-capability-contract.md:131` (auth-session: cites
  `frontend/src/contexts/AuthContext.tsx`, `_auth_session/`).
- `docs/security/authorization-capability-contract.md:159` (vendor links).
- `docs/security/authorization-capability-contract.md:166, 168, 169` (mention
  `_register_listings/` as production-owned modules).
- `docs/security/authorization-capability-contract.json:55, 87, 103, 139, 478,
  479, 484, 491, 501, 502, 506, 510, 692, 694` (parallel JSON citations).
- `docs/security/capability-catalog.json` (D-N2 #15: `access_user` capability
  surface absence).
- (Full enumeration deferred to Agent 5.)

---

## 4. Audit-Finding Reference Verification

### S8.5 — `riskhub_questionnaires` (developer Reject)

Doc anchors that lock the file (developer's reject evidence at
`developer answer.md:189`):

- `AGENTS.md:162`: "`app.api.v1.endpoints.riskhub.get_cro_user` (used by
  `backend/app/api/v1/endpoints/riskhub_questionnaires.py`)" — the AGENTS
  invariant references the file by path.
- `docs/agent/ENDPOINT_INVARIANTS.md:13`: same invariant repeated.
- `.planning/codebase/CONCERNS.md:9`: lists the file as load-bearing for
  questionnaire lifecycle.
- `.planning/codebase/TESTING.md:70` (and `docs/TESTING.md:19`): the test
  suite `test_riskhub_questionnaires.py` is documented as a backend
  questionnaire workflow check.
- `tests/backend/pytest/api/v1/README.md:25`: "`test_riskhub_questionnaires.py`"
  — README enumerates the test file.

### S8.1 — `quarterly_comparison` (developer Reject)

Doc anchors that lock the facade (developer's reject evidence at
`developer answer.md:659`):

- `backend/app/services/_quarterly_comparison/README.md:16`: "Keep
  `backend/app/services/quarterly_comparison_service.py` as the public service
  entrypoint" — the package README **explicitly preserves** the facade.
- `.planning/codebase/CONVENTIONS.md:22`: lists `quarterly_comparison_service.py`
  as a blessed facade pattern.
- `.planning/codebase/CONCERNS.md:14`: names it as a high-risk surface.
- `.planning/codebase/STRUCTURE.md:25`: lists `_quarterly_comparison` as a
  recognized helper package.
- `.planning/codebase/ARCHITECTURE.md:42`: "quarterly comparison
  period/snapshot/change helpers (`backend/app/services/_quarterly_comparison/`)".

### S5.2 / #69 — Vendor links (deferred)

- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:11-19, 27-39`:
  Archivable mixin contract.
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:11-30`:
  forward-only migration rehearsal contract.
- `backend/app/services/_vendor_links/README.md:1-13`: vendor-link package
  contract.
- `docs/security/authorization-capability-contract.md:121-122`: cites
  `vendor_link_helpers.py` and `_vendor_links/` as backend authority.
- `.planning/codebase/CONCERNS.md:15`: vendor-link concern entry.

### S5.7 / #70 — `Vendor.status` (deferred)

- `docs/README.md:111-112`: vendor `inactive` is not retained as a lifecycle
  status.
- `docs/DOCUMENTATION_TREE.md:84`: "`ControlStatus.inactive`" anchor.
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`: vendor
  `inactive` is legacy archive state.
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`:
  migration sequencing.
- `docs/BUSINESS_LOGIC.md:619`: "`status='active'` as backward-compat alias".

### S7.8 / #71 — Frontend session module (deferred)

- `frontend/src/services/session/README.md:1-13`: package boundary contract.
- `frontend/src/contexts/auth/README.md:21-23`: pins
  `services/session/store.ts` as canonical auth state.
- `docs/security/authorization-capability-contract.md:131`: AUTHZ-AUTH-SESSION
  row cites `frontend/src/services/session/`.

### FE-N5 / #66 — `AuthContext` (deferred)

- `frontend/src/contexts/README.md:9-12`: lists `AuthContext.tsx` as a
  primary context provider.
- `frontend/src/contexts/auth/README.md:5, 20`: "Keep `AuthContext.tsx` as
  composition glue".
- `docs/security/authorization-capability-contract.md:131`: AUTHZ-AUTH-SESSION
  cites `frontend/src/contexts/AuthContext.tsx`.
- `.planning/codebase/CONVENTIONS.md:43`: "Auth state and permissions sourced
  from `AuthContext` (`frontend/src/contexts/AuthContext.tsx`)".

### S5.9 / #62 — KRI vendor assignment (deferred)

- `docs/security/authorization-capability-contract.md:121-122`: cites
  `_vendor_links/` as canonical link workflow.
- `backend/app/services/_vendor_links/README.md:13`: "Link visibility,
  active-vendor validation, duplicate prevention, and archive metadata
  should flow through this package".

### S6.6 / #60 — `PrivilegeContext` (deferred)

- `backend/app/services/_authorization_capabilities/README.md:5, 21`:
  "Keep `…/authorization_capabilities.py` as the stable facade".
- `AGENTS.md:191-205`: RBAC and Business Logic Guardrails — backend capability
  metadata authority.

### BE-N8 / #45 — Ownership resolver (deferred)

- `AGENTS.md:191-205`: RBAC and Business Logic Guardrails.
- `backend/app/core/_permissions/README.md:9-16`: lists `entity_access.py`,
  `evaluation.py`, `issues.py`, `ownership.py`, `scoping.py`, `sensitive.py`
  as the permission internal modules.

### FE-N8 / #68 — `WidgetShell` (deferred)

- `frontend/src/components/dashboard/README.md:9-30`: lists every dashboard
  widget by name and pins KRI drill-down query strings.

### BE-N7 / #40 — Outbox dispatch tracking (status: developer **deferred**
in audit table; the user mentioned this is being reordered)

- `AGENTS.md:230`: "Outbox worker transaction ownership is consolidated in
  `backend/app/services/outbox/dispatcher.py`; `…/store.py` flushes only".
- `docs/README.md:111`: "`backend/app/services/outbox/dispatcher.py`".
- `docs/DOCUMENTATION_TREE.md:83`: "`backend/app/services/outbox/dispatcher.py`".
- `docs/adr/ADR-002-service-owned-transactions.md:15`: "Outbox transaction
  ownership is consolidated in `backend/app/services/outbox/dispatcher.py`".
- `docs/adr/ADR-002-service-owned-transactions.md:44`: "consolidated into
  `backend/app/services/outbox/dispatcher.py:24-25,37-38`".
- `docs/TESTING.md:74`: outbox dispatch single-worker constraint.
- `docs/deployment/reference.md:205`: "outbox dispatch interval is fixed in
  code at 5 seconds".
- `backend/app/services/outbox/README.md:22-23`: persistence and dispatch
  separation.
- `backend/app/services/outbox/handlers/README.md:21`: retry vs dead-letter
  policy ownership.

### `_register_listings/` (referenced in S8.1 reject reason context)

- The directory does **not** have a README in the current tree (verified by
  `find … -name "README.md"`).
- It is referenced as canonical authority in
  `docs/security/authorization-capability-contract.md:110, 121, 128, 166, 168, 169`.
- `docs/adr/ADR-007-bounded-context-taxonomy.md:13`: lists `_register_listings`
  as one of the seven bounded contexts.
- `.planning/codebase/STRUCTURE.md:25`: lists `_register_listings` as a
  recognized helper package.
- `.planning/codebase/CONVENTIONS.md:22`: does **not** mention
  `_register_listings` (omission noted).

So the developer's S8.1 reject did **not** cite a `_register_listings` README
(none exists) — it cited the `_quarterly_comparison/README.md`. The phase
prompt's mention of "S8.1 reject reason" referencing `_register_listings/*`
appears to be a misalignment; the actual reject evidence is the quarterly
comparison facade README.

---

## 5. README & Lock Change Register — Per-Finding Doc Update Map

For every audit finding the resolution plan will touch, this section lists
the exact `file:line` doc updates required.

### Findings that REQUIRE doc update if implemented

#### Finding 10 / S8.5 (delete `riskhub_questionnaires.py`) — Reject
If the resolution plan **does** end up deleting the file, the following
docs must be updated atomically:
- `AGENTS.md:162` (drop the `riskhub_questionnaires.py` re-export note).
- `docs/agent/ENDPOINT_INVARIANTS.md:13` (same).
- `.planning/codebase/CONCERNS.md:9` (drop file from concerns list).
- `.planning/codebase/TESTING.md:70` and `docs/TESTING.md:19` (drop the
  test path).
- `tests/backend/pytest/api/v1/README.md:25` (drop test enumeration).

#### Finding 38 / S8.6 (move inline endpoint Pydantic models) — Accept w/ mod
If implementing for `riskhub_questionnaires.py`:
- All anchors above must remain valid (file is not deleted under this
  finding per the developer's modification).

#### Finding 13 / S5.1 + C-N2 (delete `vendor_link_helpers.py`) — Accept
- `docs/security/authorization-capability-contract.md:121, 122` (drop
  `vendor_link_helpers.py` from cited service_policy).
- `docs/security/authorization-capability-contract.json:55, 479, 502` (same).
- `AGENTS.md:205` (validator command remains).

#### Finding 24 / S3.4 (delete `kris/linked_vendors.py`) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:116-118` (drop barrel
  reference).
- `docs/security/authorization-capability-contract.json:389, 411` (same).

#### Finding 51 / S3.3 (delete `_kri_history/value_application.py`) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:117-118, 161` (update
  citations).
- `docs/security/authorization-capability-contract.json:389, 411` (same).

#### Finding 55 / S7.5 (delete `access_user_service.py` facade) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:109` (drop facade
  reference).
- `docs/security/authorization-capability-contract.json:106, 229` (same).

#### Finding 56 / S7.6 (delete `directory_identity_service.py`) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:109` (drop facade
  reference).
- `docs/security/authorization-capability-contract.json:229` (same).

#### Finding 61 / S7.7 (`graph_directory` package move) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:109` (update path).
- `docs/security/authorization-capability-contract.json:229` (same).
- Add new `backend/app/services/_graph_directory/README.md` alongside the move.

#### Finding 57 / S8.1 (delete `quarterly_comparison_service.py` facade) — Reject
If reordered to **delete** in the cleanest architecture (per phase prompt):
- `backend/app/services/_quarterly_comparison/README.md:16` (drop the
  "Keep …/quarterly_comparison_service.py as the public service entrypoint"
  line, OR rewrite it to point at the new entrypoint).
- `.planning/codebase/CONVENTIONS.md:22` (drop `quarterly_comparison_service.py`
  from facade list).
- `.planning/codebase/CONCERNS.md:14` (rewrite the committee snapshot concern).
- `.planning/codebase/ARCHITECTURE.md:42` (path probably already points at
  internal package — verify).

#### Finding 39 / S8.7 (real `AdminConsoleCapabilities` builder) — Accept w/ mod
- `docs/security/authorization-capability-contract.md:132` (verify path).
- `docs/security/authorization-capability-contract.json:719` (same).

#### Finding 40 / S8.11 (admin sub-router re-clustering) — Defer in audit
If reordered/implemented:
- `backend/app/api/v1/endpoints/admin/README.md:9-19` (rewrite contents listing).
- `AGENTS.md:157` (admin remains in package list).
- `docs/agent/ENDPOINT_INVARIANTS.md:7` (same).
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`
  (potentially).

#### Finding 45 / BE-N8 (ownership resolver factory) — Defer
If implemented:
- `backend/app/core/_permissions/README.md:9-16` (drop or rename the
  `ownership.py` entry depending on the factory's location).
- `AGENTS.md:191-205` (RBAC guardrails — verify still accurate).

#### Finding 60 / S6.6 (`PrivilegeContext`) — Defer
If implemented:
- `backend/app/services/_authorization_capabilities/README.md:5, 21` (update
  if facade behavior changes).
- `docs/security/authorization-capability-contract.md` (verify all per-row
  capability citations remain accurate).

#### Finding 62 / S5.9 (KRI vendor assignment to canonical workflow) — Defer
If implemented:
- `backend/app/services/_vendor_links/README.md:13` (extend coverage statement
  to include KRI assignment).
- `docs/security/authorization-capability-contract.md:121-122` (verify).

#### Finding 66 / FE-N5 (split `AuthContext`) — Defer
If implemented:
- `frontend/src/contexts/README.md:9-16` (update listing).
- `frontend/src/contexts/auth/README.md:5, 20` (rewrite "composition glue"
  framing).
- `docs/security/authorization-capability-contract.md:131` (update frontend_gate
  paths).
- `.planning/codebase/CONVENTIONS.md:43` (update auth-state import path).

#### Finding 68 / FE-N8 (`WidgetShell` + dashboard scoped query) — Defer
If implemented:
- `frontend/src/components/dashboard/README.md:9-30` (rewrite contents listing,
  potentially document `WidgetShell` as a new contract).

#### Finding 69 / S5.2 (vendor link mixin / polymorphic merge) — Defer
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:11-19, 27-39` (likely
  amendment).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:11-30` (likely
  amendment for the new migration).
- `backend/app/services/_vendor_links/README.md:5-13` (rewrite).
- `backend/app/models/README.md:9-25` (update if vendor-link models
  consolidate).
- `docs/security/authorization-capability-contract.md:121-122` (verify backend
  authority paths).

#### Finding 70 / S5.7 (drop `Vendor.status`) — Defer
- `docs/README.md:111-112` (drop or rewrite vendor `inactive` line).
- `docs/DOCUMENTATION_TREE.md:84` (verify).
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16` (rewrite).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30` (rewrite).
- `docs/BUSINESS_LOGIC.md:619` (drop `status='active'` backward-compat alias
  reference).

#### Finding 71 / S7.8 (frontend session module merge) — Defer
- `frontend/src/services/session/README.md:1-13` (rewrite contents).
- `frontend/src/contexts/auth/README.md:21-23` (update path references).
- `docs/security/authorization-capability-contract.md:131` (update
  frontend_gate session paths).

#### Finding 72 / S7.9 (ADR-011) — Accept
- Create `docs/adr/ADR-011-auth-scheme-and-session-model.md`.
- `docs/adr/README.md` (add to ADR index).
- `docs/DOCUMENTATION_TREE.md:86-89` (add ADR-011 anchor).
- `AGENTS.md:218-231` (add ADR-011 reference if it governs locks).
- `docs/README.md:104-112` (add ADR-011 reference).

#### Finding 73 / S3.12 (ADR-012) — Accept
- Create `docs/adr/ADR-012-kri-time-series.md`.
- `docs/adr/README.md` (add to index).
- `docs/DOCUMENTATION_TREE.md:86-89` (add anchor).

#### Finding 74 (ADR-007 amendment) — Accept
- `docs/adr/ADR-007-bounded-context-taxonomy.md:11-14` (amend).

### Findings that DO NOT require doc updates
(Per developer answer; the change is fully internal or only touches code
without crossing a doc lock.)

- Findings 11 (truth-in-naming `risk.process` → `risk.name`).
- Finding 12 (narrow `except Exception` in users summary).
- Findings 17, 18, 19, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 41, 42, 43, 44,
  46, 47, 48, 49, 50, 52, 53, 54, 58, 59, 63, 64, 65, 67 (mostly internal
  refactor, lock TOMLs may need updates per developer answers).
- Finding 14 (issues outbox-only notification cleanup; lock changes only).
- Finding 16 (legacy-excel tombstone removal; doc anchors are in tests, not
  doc tree).

### Findings that REQUIRE TOML-lock updates only
- Finding 17 (S2.1) — `_monitoring_response` shim: lock TOML.
- Finding 21 (S2.6) — `load_link` keyword-only.
- Finding 49 (S2.2) — control execution monitoring wrapper.
- Finding 50 (S3.2) — `_kri_history/submission.py`.
- Finding 52 (S3.5) — `_kri_history/correction_plans.py`.
- Finding 53 (S4.1) — issue workflow service collapse.
- Finding 58 (S8.3) — orphaned item facade.

These touch
`tests/backend/pytest/architecture/_*.toml` and
`tests/backend/pytest/test_architecture_deepening_contracts.py` rather than
markdown.

---

## 6. Cross-Cutting Doc Surfaces Worth Knowing

### Doc validation harness pinned by `docs/README.md:60-71`
- `python3 scripts/check_docs_contract.py`
- `make -f scripts/Makefile docs-topology-consistency`
- `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q`
- `cd ../frontend && npm run test:run -- src/components/settings/__tests__/
  DocumentationSettings.test.tsx src/pages/__tests__/DocumentationPage.test.tsx
  src/components/documentation`
- `python3 scripts/tools/docs_tree_audit.py --scope canonical
  --max-root-hops 3 --fail-on-unreachable`
- `python3 scripts/tools/docs_tree_audit.py --scope full`
- `python3 scripts/tools/readme_coverage.py audit`
- `python3 scripts/tools/structure_metrics_guard.py`

### README coverage policy
- `docs/reference/README_COVERAGE_POLICY.md` exists; its rules govern when a
  README is required.
- `docs/reference/readme_coverage.md` provides the current inventory snapshot.

### Docs-topology guardrail
- `docs/DOCUMENTATION_TREE.md:124-126`: 3-hop reachability invariant.
- Implication: any new file added under `docs/` or `.planning/codebase/`
  (e.g. ADR-011) must be linked from a root entrypoint.

### `docs/AUTHZ_LIST_POLICY.md`
- Listed as canonical core doc (`docs/README.md:42`).
- Behavior contract for list scoping; touched by any change in
  `_register_listings/`, `_permissions/`, or per-row capability shape.

### `docs/agent/AGENTS_DOC_COVERAGE.md`
- The coverage-tracking sibling to AGENTS.md (`docs/agent/README.md:12`).
- Any AGENTS.md section rewrite must also update this file.

### Test READMEs that double as code-binding docs
- `tests/backend/pytest/api/v1/README.md:25` enumerates
  `test_riskhub_questionnaires.py` (S8.5 anchor).
- `tests/backend/README.md`, `tests/frontend/README.md` — generally directory
  scaffolding only; auto-generated README boilerplate.

### Auto-generated README boilerplate identifier
Many service / endpoint READMEs follow the pattern:
```
# <path>

## Purpose

Folder for `<path>` implementation assets.

## Contents

- `__init__.py`
- `<file>`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
```

These auto-generated READMEs **become stale** the moment a file is added,
removed, or renamed in the directory. Audit findings that delete a file
listed in any "Contents" section of an auto-generated README require the
README's contents-list to be regenerated. The
`scripts/tools/readme_coverage.py audit` validator likely catches this.

---

*End of context map. Compiled by Agent 8 — pure current-state mapping. Doc
references reflect the working tree at branch `main` commit `1ee872a4`.*
