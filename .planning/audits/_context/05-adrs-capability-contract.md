# Context Pack 05 — ADRs and Capability Contract (Current State)

Phase 1 inventory only. No verification of audit findings; mapping only.

Working directory anchored at `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Every quote is `<= 15 words` and cited by `file:line`. ADR file paths in `docs/adr/`; lock tests in `tests/backend/pytest/architecture/`; capability artifacts in `backend/app/services/_authorization_capabilities/`, `backend/app/schemas/`, `frontend/src/authz/`, `frontend/src/services/api/schemas/`, and `docs/security/`.

## ADR Index (`docs/adr/README.md:5-16`)

> "ADR-001 Capabilities Module Unification ... ADR-010 Postgres Migration Rehearsal Contract"
> (`docs/adr/README.md:7-16`)

ADRs 001-010, no superseded entries; no ADR-011 or ADR-012 file present yet (audit raises one as proposal #74).

---

## ADR-001 Capabilities Module Unification (`docs/adr/ADR-001-capabilities-module-unification.md`)

- **Status**: "Accepted" (`ADR-001:5`).
- **Decision (paraphrase)**: "Create one public Capabilities Module Interface" with `Capabilities.can(action, resource, *, instance=None)` for service decisions, FastAPI dependencies as endpoint adapters, per-resource builders as private internals; frontend route gates consume backend `GET /api/v1/me/capabilities`; "role-string logic remains only as a temporary compatibility fallback" (`ADR-001:13`).
- **Migration**: "`_authorization_capabilities` package will be promoted to a public import path" (`ADR-001:23`).
- **Invariant tests** (`ADR-001:30-34`):
  - "Route capability snapshot ... must not silently weaken" — `tests/backend/pytest/architecture/test_w3_gate_snapshot.py:26-32` (`route_map[("GET", "/risks")] == "risks:read"` etc.).
  - "No direct per-resource capability imports outside the Module internals" — enforced via `tests/backend/pytest/architecture/test_w10_capabilities_all_allowlist_red.py:29-33` (`__all__` parity with `_capabilities_all_allowlist.toml`).
  - "`validate_authz_capability_contract.py` verifies backend builder, Pydantic schema, frontend schema, and docs alignment" — `scripts/security/validate_authz_capability_contract.py:149-167` plus `authz_contract_validator/runner.py:34-62`.
  - "Frontend route gates use `useAuthz().can(...)` rather than role-string booleans" — `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:24-29`, `:38-48`.
- **Sunset/expiry**: every entry in `_capabilities_all_allowlist.toml` carries `expires_at = "2026-09-01"` (`tests/backend/pytest/architecture/_capabilities_all_allowlist.toml:4,9,...,79`). Entries are tagged either `intent = "keep"` or `intent = "phase-3-deprecate"`.
- **Artifacts touched (every one)**:
  - Backend perimeter: `backend/app/services/_authorization_capabilities/perimeter.py:11-24` ("@dataclass(frozen=True) class Capabilities"; `def can(self, action, resource, *, instance=None)`).
  - Capabilities `__all__`: `backend/app/services/_authorization_capabilities/__init__.py:22-39`.
  - `MeCapabilities` builder: `backend/app/services/_authorization_capabilities/me.py:33-74` (`build_me_capabilities`).
  - Pydantic surfaces: `backend/app/schemas/user.py` (`MeCapabilities`), `backend/app/schemas/risk.py` (`RiskCapabilities`), `backend/app/schemas/control.py` (`ControlCapabilities`), `backend/app/schemas/kri.py` (`KRICapabilities`), `backend/app/schemas/issue.py` (`IssueCapabilities`), `backend/app/schemas/vendor.py` (`VendorCapabilities`) — referenced by `docs/security/capability-catalog.json:8-214`.
  - Frontend Zod schemas: `frontend/src/services/api/schemas/auth.ts` (`meCapabilitiesSchema`), `.../entities/{risks,controls,kris,issues,vendors}.ts` — referenced by `docs/security/capability-catalog.json`.
  - Frontend gate code: `frontend/src/authz/policy.ts:86-155` (`buildAuthz`), `frontend/src/authz/useAuthz.ts:7-18`, `frontend/src/authz/BusinessRouteGuards.tsx:18-36`, `frontend/src/routing/business.tsx` (route nav predicates).
  - Frontend invariant test home: `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:14-85`.

---

## ADR-002 Service-Owned Transactions (`docs/adr/ADR-002-service-owned-transactions.md`)

- **Status**: "Accepted" (`ADR-002:5`).
- **Decision (paraphrase)**: "Service entrypoints own transaction completion. Endpoints act as adapters" (`ADR-002:13`); workers and schedulers are also service entrypoints. Outbox dispatcher owns the worker transaction; store flushes only.
- **Auth-flow exemption mechanism**: "Temporary auth endpoint commits are tracked in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`" (`ADR-002:15`).
- **Hard expiration**: "Auth-flow exemptions ... carry `expires_at = 2026-09-01`" (`ADR-002:40`); the lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date.
- **Allowlist contents** (`tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`): 8 entries, all `expires_at = "2026-09-01"`:
  - `auth/sso.py:170` (line 4); `auth/refresh.py:177` (line 9); `auth/logout.py:101` (line 15); `auth/logout.py:132` (line 21); `auth/password.py:128` (line 27); `auth/_sso_helpers.py:48` (line 33); `auth/demo.py:67` (line 39); `auth/password.py:161` (line 45).
- **Invariant tests** (`ADR-002:32-36`):
  - Static ratchet on endpoint `await db.commit()` + auth allowlist expiration: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py:37-58` (`assert len(allowed) <= 8`, `auth_commit_sites <= allowed`, `date.fromisoformat(...) >= date.today()`).
  - Outbox store no-commit lock: `tests/backend/pytest/architecture/test_w4b_outbox_no_commit_in_store_red.py:14-25` (asserts no `await *.commit()` in `backend/app/services/outbox/store.py`).
  - Per-context atomicity tests: `test_w4_bc_a_riskhub_config_boundaries_red.py` ... `test_w4_bc_g_kri_history_boundaries_red.py` (one per ADR-007 context); plus per-context service ratchet locks `test_w12_riskhub_config_service_commit_ratchet_red.py:35-48`, `test_w12_vendor_governance_service_commit_ratchet_red.py` referencing `_riskhub_config_service_commit_allowlist.toml` and `_vendor_governance_service_commit_allowlist.toml`.
  - Outbox dispatcher consolidation: "outbox transaction ownership is consolidated in `backend/app/services/outbox/dispatcher.py`" (`ADR-002:15`); ADR cites `dispatcher.py:24-25,37-38` for `async with sessionmaker()` + `async with session.begin():` (`ADR-002:44`).
  - Handler idempotency: "Every outbox event must be enqueued with a stable `idempotency_key`" (`ADR-002:48`); enforced by `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` (asserts `idempotency_key` keyword present and non-empty for every `OutboxService.enqueue` call).

---

## ADR-003 Domain Exception Taxonomy (`docs/adr/ADR-003-domain-exception-taxonomy.md`)

- **Status**: "Accepted" (`ADR-003:5`).
- **Decision (paraphrase)**: "Introduce a domain exception taxonomy with FastAPI translation at the API layer" — `DomainError`, `NotFoundError`, `ConflictError`, `AuthorizationError`, `AuthenticationError`, `ValidationError`, `PreconditionFailed` (`ADR-003:13`). Projection registry lives in `backend/app/core/exceptions.py` (`EXCEPTION_REGISTRY`, `to_http_exception`, `is_retryable`, `audit_log_payload` — `ADR-003:15`).
- **Invariant tests** (`ADR-003:32-36`):
  - Per-context AST ban on `raise HTTPException` in service packages: e.g. `tests/backend/pytest/architecture/test_w4_bc_a_riskhub_config_boundaries_red.py:19-30` ("riskhub_config_services_do_not_raise_fastapi_http_exceptions"); same shape for `_w4_bc_b_..._w4_bc_g_*`.
  - Registry completeness: `tests/backend/pytest/architecture/test_w4_exception_registry_completeness_red.py:18-32` (`subclasses <= registered`).
- No expiry/sunset.

---

## ADR-004 UTC-Aware Datetime SSOT (`docs/adr/ADR-004-utc-aware-datetime-ssot.md`)

- **Status**: "Accepted" (`ADR-004:5`).
- **Decision (paraphrase)**: "Use `UtcAwareDatetime` as the schema-boundary type for every instant-like Pydantic datetime field" (`ADR-004:13`); runtime uses `utc_now()` and `coerce_utc()`; `datetime.utcnow()` remains banned outside reviewed exceptions.
- **Invariant tests** (`ADR-004:30-33`):
  - Bare `datetime` import ban in schemas: `tests/backend/pytest/architecture/test_w9_schema_datetime_ban.py:11-24` ("Use UtcAwareDatetime in schema boundaries").
- No expiry/sunset.

---

## ADR-005 Archivable Mixin Schema Contract (`docs/adr/ADR-005-archivable-mixin-schema-contract.md`)

- **Status**: "Accepted" (`ADR-005:5`).
- **Decision (paraphrase)**: "Add an `ArchivableMixin` with `is_archived`, `archived_at`, and `archived_by_id` for archive-capable entities" (`ADR-005:13`); query code uses Archivable Interface; status fields remain as compatibility aliases.
- **The seam (columns)**: `is_archived`, `archived_at`, `archived_by_id` (`ADR-005:13`); enforced as ORM attributes — `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py:79-97` asserts `KeyRiskIndicator` has all three plus `live`/`archived`/`mark_archived`/`mark_restored`.
- **`ControlStatus.inactive` retention**: "`is_archived = True` represents soft-deletion ... `inactive` is orthogonal" (`ADR-005:19`); consumers include `app.services._control_execution.workflow.is_executable`, `app.services._authorization_capabilities.controls`, `app.api.v1.endpoints.departments.detail`.
- **Invariant tests** (`ADR-005:36-39`):
  - Allowlist registry: `tests/backend/pytest/architecture/_archive_allowlist.toml` (4 entries; `_archivable.py`, `key_risk_indicator.py`, `add_archivable_columns.py`, `unify_archive_state.py`).
  - Lock test: `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py:18-22` (`archive_allowlist_registry_is_present_and_scoped`); `:25-39` asserts register listings call `archived_clause(`; `:42-51` asserts `def live(`/`archived(`/`mark_archived(`/`mark_restored(`; `:54-58` asserts vendor capabilities use `is_archived` not `"inactive"` literal; `:61-76` bans archive status literals on lifecycle enums.
- No expiry/sunset.

---

## ADR-006 Snapshot Equivalence-Class Testing Policy (`docs/adr/ADR-006-snapshot-equivalence-class-testing-policy.md`)

- **Status**: "Accepted" (`ADR-006:5`).
- **Decision (paraphrase)**: "Use snapshot tests over equivalence classes before behavior-preserving refactors" (`ADR-006:13`); snapshots redact unstable fields; rebaselines need explicit ADR justification.
- **Invariant tests** (`ADR-006:30-33`): snapshot fixture redaction; listing equivalence snapshots; audit snapshots. (No discrete file path inside the ADR.)
- No expiry/sunset.

---

## ADR-007 Bounded Context Taxonomy (`docs/adr/ADR-007-bounded-context-taxonomy.md`)

- **Status**: "Accepted" (`ADR-007:5`).
- **Decision (paraphrase)**: "Architecture sweeps use seven bounded contexts" (`ADR-007:13`).
- **Canonical seven contexts** (`ADR-007:13`):
  1. `_riskhub_config`
  2. `_identity_access_lifecycle`
  3. `_vendor_governance`
  4. `_register_listings`
  5. `_approval_execution`
  6. `_entity_mutation_lifecycle`
  7. `_kri_history`
- **Audit's proposed amendment (#74)** (`.planning/audits/2026-05-09-deepening-audit.md:2107-2108,2257-2271`):
  - "ADR-007 amendment — three context categories" (line 2107).
  - Status: "Proposed (amends ADR-007)" (line 2259).
  - Three secondary categories:
    1. **Read-shape contexts**: `_register_listings`, `_monitoring_status`, `_monitoring_response` (line 2261).
    2. **Workflow-paired contexts**: `_approval_queue`/`_approval_execution`, `_issue_register`/`_issue_workflow`, `_vendor_links`/`_vendor_governance` (line 2261).
    3. **Adapter contexts**: `_directory_identity`, `_directory_sync`, `graph_directory_*`, `_admin_telemetry`, `_activity_log_query` (line 2261).
  - Decision (paraphrase, line 2263): "ADR-007's taxonomy is extended with three secondary categories ... seven-context list remains the canonical write-side enumeration."
  - Proposed enforcement (line 2271): "Extend `test_w7_bounded_context_disjointness.py` ... new TOMLs: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`."
- **Invariant tests** (`ADR-007:30-33`):
  - Per-context HTTPException ban: `test_w4_bc_{a,b,c,d,e,f,g}_*_boundaries_red.py` (one file per context; e.g. `test_w4_bc_a_riskhub_config_boundaries_red.py:19-30`).
  - Per-context atomicity tests (per ADR-007:32) — same file family.
  - File-disjointness check: implied existence of `test_w7_bounded_context_disjointness.py` (referenced by audit but not seen in this directory listing — only `test_w6_bc_d_register_listing_centralization.py` and `test_w7_audit_*` were enumerated).
- No expiry/sunset on the ADR itself.

---

## ADR-008 Risk Threshold SSOT (`docs/adr/ADR-008-risk-threshold-ssot.md`)

- **Status**: "Accepted" (`ADR-008:5`).
- **Decision (paraphrase)**: "Risk threshold evaluation must go through the configured threshold Interface" (`ADR-008:13`). Backend uses `get_config_int` with `ConfigDefaults`; frontend uses `useRiskThresholds()` and `riskScoreVariantClass()`.
- **Invariant tests** (`ADR-008:30-33`):
  - Threshold-literal lint (>= 5/10/15/16): `ADR-008:31`.
  - Dashboard threshold contract: `tests/backend/pytest/architecture/test_dashboard_threshold_contract_red.py:18-49` (asserts no `RISK_LEVEL_RANGES` constant, no `ConfigDefaults`/`build_risk_level_ranges` imports, no `build_risk_level_condition` function in `dashboard/_shared.py`).
  - Doc alignment: `tests/backend/pytest/test_w2_doc_contract_alignment_red.py:12` ("`critical_risk_min_net_score` | 16 | Critical risk threshold").
- No expiry/sunset.

---

## ADR-009 Reserved Surfaces Convention (`docs/adr/ADR-009-reserved-surfaces-convention.md`)

- **Status**: "Accepted" (`ADR-009:5`).
- **Decision (paraphrase)**: "Reserved surfaces must be declared in `_reserved_modules.toml`, documented in `docs/BUSINESS_LOGIC.md`, and annotated at the code declaration site" (`ADR-009:13`).
- **Registry**: `backend/app/api/v1/endpoints/_reserved_modules.toml` (8 entries):
  - 4 activity entity types: `VENDOR_ASSESSMENT`, `VENDOR_INCIDENT`, `VENDOR_SLA`, `VENDOR_REMEDIATION` (lines 5-34).
  - 1 role: `CONTROL_OWNER` (line 38).
  - 3 permissions: `vendor_contracts:read`, `vendor_contracts:write`, `controls:approve` (lines 46-65).
- **Invariant tests** (`ADR-009:30-33`): enforced by `tests/backend/pytest/test_w2_doc_contract_alignment_red.py:44-67` (`test_reserved_surfaces_registry_covers_code_and_docs`) — asserts the 8 reserved tuples are subset of registry, asserts `Reserved: ...` comment markers in `activity_log.py`, `role.py`, `rbac_seed_contract.py`. Cross-link in `tests/backend/pytest/architecture/test_w1_docs_cross_link_red.py`.
- No expiry/sunset.

---

## ADR-010 Postgres Migration Rehearsal Contract (`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`)

- **Status**: "Accepted" (`ADR-010:5`).
- **Decision (paraphrase)**: "rehearse them on a refreshed staging clone ... Rollback is snapshot restore only" (`ADR-010:13`).
- **Forward-only migrations covered** (`ADR-010:22-26`):
  - `risks.status='archived'` → `status='active'` + `is_archived=true`.
  - `controls.status='archived'` → `status='active'` + `is_archived=true`.
  - `vendors.status='inactive'` → `status='active'` + `is_archived=true`.
  - `approval_scenarios.approver_roles` → JSON/JSONB.
- **`downgrade()` stub** (`ADR-010:30`): "Alembic `downgrade()` for these revisions raises `NotImplementedError` and points here."
  - Concrete example (archive unification): `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`:
    > `raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")`
  - Concrete example (approver_roles JSONB): `backend/alembic/versions/i4j5k6l7m8n9_approver_roles_to_jsonb.py:45-48`:
    > `raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")`
- **Invariant tests** (`ADR-010:32-37`):
  - Alembic head clean: `tests/backend/pytest/architecture/test_w12_alembic_clean_diff_red.py:16-34` ("`alembic check`" + `"No new upgrade operations detected"`).
  - JSONB contract: `tests/backend/pytest/architecture/test_w5_approval_scenario_roles_json_contract_red.py:16-40` (asserts `JSON().with_variant(JSONB(), "postgresql")`, asserts `raise NotImplementedError`, asserts `ADR-010` token in migration).
- No expiry/sunset.

---

## Capability Contract — `docs/security/capability-catalog.json`

### Top-level shape

> `{"version": "1.0", "last_reviewed": "2026-05-03", "owner": "RiskHub Maintainer", "description": ..., "surfaces": [...]}` (`capability-catalog.json:1-216`)

- **`surfaces`**: 7 entries (`capability-catalog.json:7-215`):
  1. `capabilities` (interface surface; method-only) — `interface = {"path": "backend/app/services/_authorization_capabilities/perimeter.py", "class": "Capabilities", "method": "can"}` (`:8-14`).
  2. `me_capabilities` — backend `MeCapabilities` (`backend/app/schemas/user.py`) ↔ frontend `meCapabilitiesSchema` (`frontend/src/services/api/schemas/auth.ts`); 18 fields (`:15-45`).
  3. `risk` — `RiskCapabilities` ↔ `riskCapabilitiesSchema`; 19 fields (`:46-77`).
  4. `control` — `ControlCapabilities` ↔ `controlCapabilitiesSchema`; 20 fields (`:78-110`).
  5. `kri` — `KRICapabilities` ↔ `kriCapabilitiesSchema`; 23 fields (`:111-146`).
  6. `issue` — `IssueCapabilities` ↔ `issueCapabilitiesSchema`; 28 fields (`:147-187`).
  7. `vendor` — `VendorCapabilities` ↔ `vendorCapabilitiesSchema`; 14 fields (`:188-214`).

Each non-interface surface has shape:
```
{ "id", "backend": {"path", "class"}, "frontend": {"path", "schema"}, "fields": [<bool field names>] }
```

The catalog is described as "Validator catalog ... checks field-shape drift only" (`capability-catalog.json:5`) — the markdown contract remains the source of action semantics.

### Per-row capability home (frontend invariant home)

Per the codebase guidance: "per-row capabilities remain on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`" (`CLAUDE.md`).

### Frontend invariant test home

`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:14-85` — four assertions:
- `:15-22` no fallback `?? hasPermission(` in `buildAuthz`.
- `:24-29` business routes use `authz.can('read', 'issues')` not `hasPermission(`.
- `:31-36` strict mode reads `meCapabilities.resource_permissions[key] === true`.
- `:38-48` business route resources are exactly `{controls, risks, issues, vendors, departments}`.

---

## `validate_authz_capability_contract.py` — what it checks

CLI entry: `scripts/security/validate_authz_capability_contract.py:170-175`. Delegates to `authz_contract_validator.runner.run_validation` (`scripts/security/authz_contract_validator/runner.py:12-62`). Pipeline:

1. **Existence pre-check** (`runner.py:35-43`): `authorization-capability-contract.md`, `authorization-capability-contract.json`, `capability-catalog.json` must exist.
2. **`validate_manifest`** (`authz_contract_validator/contract_manifest.py:137-219`):
   - Required action fields (`REQUIRED_ACTION_FIELDS = ("id", "surface", "action", "actor_scope", "backend_authority", "service_policy", "response_capability", "frontend_gate", "tests", "status", "findings")` — `contract_manifest.py:15-27`).
   - Status must be in `{"authoritative", "local_fallback", "needs_review"}` (`contract_manifest.py:29`).
   - Action `id` must match `\bAUTHZ-[A-Z0-9-]+\b` (`contract_manifest.py:30`); duplicates rejected.
   - `tests` list non-empty; every test path must exist on disk (`contract_manifest.py:178-186`).
   - `sensitive_change_paths` strings must exist on disk (`contract_manifest.py:188-190`).
   - Path references in `backend_authority`/`service_policy`/`response_capability`/`frontend_gate` extracted via `PATH_REFERENCE_RE = re.compile(r"\b(?:backend|frontend)/[A-Za-z0-9_./-]+")` (`contract_manifest.py:31`); each must exist (`contract_path_missing` finding) and must be covered by `sensitive_change_paths` (`authority_path_not_sensitive` finding) — `contract_manifest.py:192-212`.
   - Discovery cross-check via `discovery.validate_discovered_authz_paths` (`contract_manifest.py:214-217`).
3. **`discovery.validate_discovered_authz_paths`** (`authz_contract_validator/discovery.py:43-104`):
   - Backend endpoint scan via regex `BACKEND_ENDPOINT_AUTHZ_PATTERN` matching `require_permission|require_business_permission|require_any_permission|can_read_*|ensure_can_*|can_resolve_approvals|_require_*` (`discovery.py:17-23`).
   - Backend service/schema scan via `BACKEND_CAPABILITY_PATTERN = r"\b(capabilities|[A-Za-z0-9_]+Capabilities)\b"` (`discovery.py:24`).
   - Frontend scan via `FRONTEND_GATE_DISCOVERY_PATTERN = r"\b(PermissionGate|useAuthz|hasPermission|resolveCapabilityFlag|RouteGuard)\b"` (`discovery.py:25-27`).
   - Each discovery must be covered by both contract action paths AND `sensitive_change_paths`, else `discovered_authz_path_not_contractual` / `discovered_authz_path_not_sensitive` (`discovery.py:79-102`); `DISCOVERY_ALLOWLIST` (`discovery.py:28-33`) currently exempts `frontend/src/hooks/useUsersPageFilters.ts` only.
4. **`validate_capability_catalog`** (`authz_contract_validator/capability_catalog.py:143-230`):
   - Top-level shape: must be JSON object with non-empty `surfaces` list (`capability_catalog.py:150-155`).
   - Each surface needs unique `id`; if it has `interface` key it must point to a Python class+method that exist (`_validate_interface_surface`, `capability_catalog.py:233-246`).
   - Otherwise must have `backend.{path,class}` + `frontend.{path,schema}` + non-empty `fields[]` (string list).
   - Backend: parses Python class body, extracts `field: bool` and `field: dict[str, bool]` patterns (`BACKEND_BOOL_FIELD_PATTERN` and `BACKEND_BOOL_DICT_FIELD_PATTERN`, `capability_catalog.py:13-18`). Set must equal catalog `fields` — emits `capability_catalog_backend_field_missing` / `..._extra` (`:269-276`).
   - Frontend: parses TS schema body via `passthroughObject(...)` brace-matched extraction, regex `z.boolean()` + `z.record(z.string(), z.boolean())` (`capability_catalog.py:19-24, 112-140`). Same equality check (`:299-306`).
5. **`validate_markdown`** (`authz_contract_validator/markdown_validation.py:84-138`):
   - Required sections: `## Purpose`, `## Architecture Principles`, `## Vocabulary`, `## Maintenance Rule`, `## Contract Matrix`, `## Capability Gap Register`, `## Evidence Map`, `## Required Verification`, `## Out Of Scope` (`markdown_validation.py:11-21`).
   - Contract Matrix headers fixed (`MATRIX_FIELD_MAP`, `markdown_validation.py:23-35`).
   - For every action ID present in both manifest and markdown, every header field cell must equal the manifest value after `normalize_markdown_cell` (`:113-137`).
6. **`validate_business_route_nav_context`** (`scripts/security/authz_contract_manifest.py:66-77` — `BUSINESS_ROUTE_NAV_EXPECTATIONS`):
   - 10 named business routes (`approvals`, `controls`, `risks`, `issues`, `kris`, `vendors`, `departments`, `governance`, `activity-log`, `risk-hub`); each pinned to an exact `isVisible` expression like `({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'controls')` (`authz_contract_manifest.py:67-77`).
7. **Diff-aware** (`runner.py:56-60`):
   - `validate_doc_touch` (`contract_manifest.py:222-252`): if any changed file matches `sensitive_change_paths` (and, for frontend `.ts`/`.tsx`, contains an `FRONTEND_AUTHZ_TOKEN_PATTERN` token in the diff hunk), both `contract.md` AND `contract.json` must also be touched, else `authz_contract_not_updated` (`contract_manifest.py:241-251`).
   - `validate_frontend_local_gate_classifications` (`authz_contract_validator/frontend_local_gates.py`): per-file allowed-pattern allowlist (`scripts/security/authz_contract_manifest.py:13-63` `FRONTEND_LOCAL_GATE_CLASSIFICATIONS`) — only `frontend/src/authz/policy.ts`, `useAuthz.ts`, `routing/business.tsx`, `components/layout/Sidebar.tsx`, `hooks/usePermissions.ts` may use local gates; each is constrained to a regex set.

### Backend `Capabilities.can` ↔ catalog ↔ frontend useAuthz invariant relationship

- Backend authority: `Capabilities.can(action, resource, *, instance=None)` — `backend/app/services/_authorization_capabilities/perimeter.py:20-24`:
  > `return check_permission(self.user, resource, action)`
- Session payload: `MeCapabilities` flat schema; built by `build_me_capabilities` — `backend/app/services/_authorization_capabilities/me.py:33-74`. The loop at `me.py:40-43` projects `_RESOURCE_PERMISSION_CHECKS` (8 pairs at `me.py:11-20`) into `resource_permissions = {"<resource>:<action>": <bool>}`.
- Catalog binds `MeCapabilities` to frontend `meCapabilitiesSchema` (`docs/security/capability-catalog.json:15-45`) and pins the 18 expected boolean fields including `resource_permissions`.
- Frontend strict path: `frontend/src/authz/policy.ts:104-107`:
  > `const can = (action, resource): boolean => meCapabilities.resource_permissions[resource:action] === true;`
- Frontend invariant test pins this seam: `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:31-36` (`expect(buildAuthzBody).toContain('meCapabilities.resource_permissions[key] === true')`).
- Resource permission key parity is locked separately by `tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72` — runtime keys must equal the literal set `{risks:read, controls:read, issues:read, vendors:read, departments:read, users:read, users:write, activity_log:read}` AND each key must be referenced by at least one `AUTHZ-` action in `authorization-capability-contract.json`.
- Committee parity (legacy fallback): `tests/backend/pytest/architecture/test_w12_committee_authz_parity_red.py:25-34` pins the backend `can_view_risk_committee` body and the frontend `canViewCommittee` literal expression.

### Manifest top-level (`docs/security/authorization-capability-contract.json:1-30`)

- Keys: `version`, `last_reviewed`, `last_architecture_refactor_reviewed`, `architecture_refactor_notes` (history log), `owner`, `capability_catalog` (file pointer), `status_values`, `principles`, `sensitive_change_paths`, `actions`.
- `actions` count: 27 `AUTHZ-` IDs (grep count of `"AUTHZ-"` = 27).
- `sensitive_change_paths`: 137 entries (`contract.json:31-168`) covering backend endpoints/schemas/services/scripts and frontend authz-relevant trees.

---

## Cross-cutting allowlists referenced by the locks

| Allowlist file | Driving lock | Purpose |
|---|---|---|
| `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` | `test_w5_endpoint_commit_ratchet_red.py` | ADR-002 auth-flow exemptions (8 entries, `expires_at = 2026-09-01`) |
| `tests/backend/pytest/architecture/_archive_allowlist.toml` | `test_w8b_archivable_encapsulation_red.py:18-22` | ADR-005 archive-state direct-access exemptions (4 entries) |
| `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` | `test_w10_capabilities_all_allowlist_red.py:29-33` | ADR-001 capabilities `__all__` (16 names; 12 `phase-3-deprecate`, 4 `keep`; all `expires_at = 2026-09-01`) |
| `tests/backend/pytest/architecture/_naming_allowlist.toml` | (referenced from CLAUDE.md) | Naming exemption registry |
| `tests/backend/pytest/architecture/_riskhub_config_service_commit_allowlist.toml` | `test_w12_riskhub_config_service_commit_ratchet_red.py` | ADR-002 per-context service-commit exemptions |
| `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml` | `test_w12_vendor_governance_service_commit_ratchet_red.py` | ADR-002 per-context service-commit exemptions |
| `backend/app/api/v1/endpoints/_reserved_modules.toml` | `test_w2_doc_contract_alignment_red.py:44-67` | ADR-009 reserved surfaces registry (8 entries) |

---

## Sunset / expiry summary

| Date | What expires |
|---|---|
| `2026-09-01` | Auth-flow endpoint commit allowlist (`_endpoint_commit_allowlist.toml`, all 8 entries) — ADR-002 |
| `2026-09-01` | Capabilities `__all__` allowlist (`_capabilities_all_allowlist.toml`, all 16 entries) — ADR-001 (12 marked `phase-3-deprecate`, 4 `keep`) |

No other ADR carries a hard expiry. ADR-005, ADR-007, ADR-009 are open-ended; ADR-010 is permanent forward-only. The audit's proposed ADR-007 amendment (#74) is `Status: Proposed` only and not in any TOML.

