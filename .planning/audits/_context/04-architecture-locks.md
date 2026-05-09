# Phase 1 Context Map: Architecture Invariant Tests + TOML Registries

Authoritative reference for which architecture lock to update for which kind of code change. Pure current-state mapping — no audit verification.

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`

---

## 1. Makefile Target

**File:** `scripts/Makefile:134-135`
```
test-architecture-locks:
	cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/architecture ../tests/backend/pytest/test_w0_harness_contract_red.py --no-cov
```

The target runs **two** sets of tests:
1. Everything under `tests/backend/pytest/architecture/`
2. The single file `tests/backend/pytest/test_w0_harness_contract_red.py` (harness contract, snapshot fixture)

---

## 2. TOML Registries — Full Current Contents

### 2.1 `tests/backend/pytest/architecture/_archive_allowlist.toml`

Path: `tests/backend/pytest/architecture/_archive_allowlist.toml`
4 `[[paths]]` entries with `path` + `rationale` keys:

| # | path | rationale |
|---|---|---|
| 1 | `backend/app/models/_archivable.py` | "Archivable Module owns the archive-state Interface and predicates." |
| 2 | `backend/app/models/key_risk_indicator.py` | "KRI owns its archived_by ORM relationship while delegating archive columns and helper methods to ArchivableMixin." |
| 3 | `backend/alembic/versions/g2h3i4j5k6l7_add_archivable_columns.py` | "Schema migration introducing archive columns." |
| 4 | `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py` | "Forward-only data migration normalizing legacy archive statuses." |

Header: `_archive_allowlist.toml:1-2` "Temporary exceptions for the Archivable invariant lock. Keep this list shrinking; each entry must name why direct archive-state access is still unavoidable."

### 2.2 `tests/backend/pytest/architecture/_naming_allowlist.toml`

Path: `tests/backend/pytest/architecture/_naming_allowlist.toml`
- `_naming_allowlist.toml:5` `paths = []`
- Header: `_naming_allowlist.toml:1-3` "Temporary exceptions for persistence naming-convention locks. The current target is empty; keep this registry present so any future exception carries an explicit rationale and can be removed deliberately."

### 2.3 `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml`

Path: `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml`
16 `[[public_names]]` entries — frozen ordered `__all__` for `backend/app/services/_authorization_capabilities/__init__.py`. Each has `name`, `intent`, `expires_at`. All entries expire `2026-09-01`.

Order matters (test asserts `_module_all_names(CAPABILITIES_INIT) == public_names`):

| # | name | intent | expires_at |
|---|---|---|---|
| 1 | `Capabilities` | keep | 2026-09-01 |
| 2 | `approval_capabilities` | phase-3-deprecate | 2026-09-01 |
| 3 | `approval_scenario_capabilities` | phase-3-deprecate | 2026-09-01 |
| 4 | `build_me_capabilities` | keep | 2026-09-01 |
| 5 | `can_view_loaded_vendor` | phase-3-deprecate | 2026-09-01 |
| 6 | `can_view_vendor_link` | phase-3-deprecate | 2026-09-01 |
| 7 | `control_capabilities` | phase-3-deprecate | 2026-09-01 |
| 8 | `department_capabilities` | phase-3-deprecate | 2026-09-01 |
| 9 | `has_capability` | keep | 2026-09-01 |
| 10 | `issue_capabilities` | phase-3-deprecate | 2026-09-01 |
| 11 | `kri_capabilities` | phase-3-deprecate | 2026-09-01 |
| 12 | `risk_capabilities` | phase-3-deprecate | 2026-09-01 |
| 13 | `risk_type_capabilities` | phase-3-deprecate | 2026-09-01 |
| 14 | `require_capability` | keep | 2026-09-01 |
| 15 | `role_capabilities` | phase-3-deprecate | 2026-09-01 |
| 16 | `vendor_capabilities` | phase-3-deprecate | 2026-09-01 |

### 2.4 `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`

Path: `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`
8 `[[allowlist]]` entries (cap is `<= 8` per test). Each has `file`, `line`, `rationale`, `expires_at = "2026-09-01"`.

| # | file | line | rationale |
|---|---|---|---|
| 1 | `backend/app/api/v1/endpoints/auth/sso.py` | 170 | "SSO exchange currently commits activity-log and JTI rotation state inside the auth flow." |
| 2 | `backend/app/api/v1/endpoints/auth/refresh.py` | 177 | "Refresh flow currently commits JTI rotation state inside the auth flow." |
| 3 | `backend/app/api/v1/endpoints/auth/logout.py` | 101 | "Logout flow currently commits token-version invalidation inside the auth flow." |
| 4 | `backend/app/api/v1/endpoints/auth/logout.py` | 132 | "Logout-all flow currently commits token-version invalidation inside the auth flow." |
| 5 | `backend/app/api/v1/endpoints/auth/password.py` | 128 | "Password login currently commits failed-login lockout state inside the auth flow." |
| 6 | `backend/app/api/v1/endpoints/auth/_sso_helpers.py` | 48 | "Failed SSO exchange currently commits audit state mid-flow." |
| 7 | `backend/app/api/v1/endpoints/auth/demo.py` | 67 | "Demo auth bootstrap currently commits demo-session state inside the auth flow." |
| 8 | `backend/app/api/v1/endpoints/auth/password.py` | 161 | "Password login currently commits successful login activity and JTI state inside the auth flow." |

### 2.5 `tests/backend/pytest/architecture/_riskhub_config_service_commit_allowlist.toml`

Path: `tests/backend/pytest/architecture/_riskhub_config_service_commit_allowlist.toml`
2 `[[allowlist]]` entries (cap is `<= 2` per test). All `expires_at = "2026-09-01"`.

| # | file | line | rationale |
|---|---|---|---|
| 1 | `backend/app/services/_riskhub_config/lifecycle.py` | 103 | "RiskHub config lifecycle owns terminal config mutation transactions for endpoint adapters." |
| 2 | `backend/app/services/_riskhub_config/lifecycle.py` | 161 | "RiskHub config no-op lifecycle helper is a terminal endpoint service entrypoint." |

### 2.6 `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml`

Path: `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml`
4 `[[allowlist]]` entries (cap is `<= 4` per test). All `expires_at = "2026-09-01"`. All point at `backend/app/services/_vendor_governance/lifecycle.py`.

| # | file | line | rationale |
|---|---|---|---|
| 1 | `backend/app/services/_vendor_governance/lifecycle.py` | 46 | "Vendor archive lifecycle is currently a terminal service entrypoint that commits archive state and audit together." |
| 2 | `backend/app/services/_vendor_governance/lifecycle.py` | 91 | "Vendor restore lifecycle is currently a terminal service entrypoint that commits restore state and audit together." |
| 3 | `backend/app/services/_vendor_governance/lifecycle.py` | 117 | "Vendor status lifecycle is currently a terminal service entrypoint that commits status state and audit together." |
| 4 | `backend/app/services/_vendor_governance/lifecycle.py` | 136 | "Vendor criticality lifecycle is currently a terminal service entrypoint that commits criticality state and audit together." |

### 2.7 `tests/backend/pytest/_get_db_override_whitelist.toml`

Path: `tests/backend/pytest/_get_db_override_whitelist.toml`
Single key `allowed_files` with one entry:
```
allowed_files = [
  "tests/backend/pytest/conftest.py",
]
```
Consumer: `tests/backend/pytest/architecture/test_w11a_dependency_override_discipline_red.py:13`

### 2.8 `backend/app/core/audit/_audit_matrix.toml`

Path: `backend/app/core/audit/_audit_matrix.toml`
**38 `[[adapter]]` entries** (`module`, `function`, `entity_type`, `action`; some include `rationale`).

Header: `_audit_matrix.toml:1-5` "W7 audit adapter matrix. Derived from docs/BUSINESS_LOGIC.md §9.1 plus adapter-level restore/status helpers needed by the current workflow surfaces. Reserved vendor extended domains are intentionally excluded until those product domains ship."

Modules covered (count → entries):
- `risk` (4): risk_created/CREATE, risk_updated/UPDATE, risk_archived/ARCHIVE, risk_restored/UPDATE
- `control` (4): control_created/CREATE, control_updated/UPDATE, control_archived/ARCHIVE, control_restored/UPDATE
- `kri` (7): kri_created/CREATE, kri_updated/UPDATE, kri_archived/ARCHIVE, kri_restored/UPDATE, kri_value_created (KRI_VALUE)/CREATE, kri_history_corrected (KRI_VALUE)/UPDATE, kri_value_mutation_updated/UPDATE
- `vendor` (6): vendor_created/CREATE, vendor_updated/UPDATE, vendor_archived/ARCHIVE, vendor_restored/UPDATE, vendor_link_created (VENDOR_LINK)/CREATE w/ rationale, vendor_link_deleted (VENDOR_LINK)/DELETE w/ rationale
- `issue` (13): issue_created/CREATE, issue_updated/UPDATE, issue_status_changed/STATUS_CHANGE, issue_linked/LINK, issue_unlinked/UNLINK, issue_remediation_created (ISSUE_REMEDIATION)/CREATE, issue_remediation_updated (ISSUE_REMEDIATION)/UPDATE, issue_remediation_status_changed (ISSUE_REMEDIATION)/STATUS_CHANGE, issue_exception_created (ISSUE_EXCEPTION)/CREATE, issue_exception_updated (ISSUE_EXCEPTION)/UPDATE, issue_exception_approved (ISSUE_EXCEPTION)/APPROVE, issue_exception_status_changed (ISSUE_EXCEPTION)/STATUS_CHANGE
- `approval` (4): approval_created (APPROVAL)/CREATE, approval_approved/APPROVE, approval_rejected/REJECT, approval_cancelled/CANCEL

Consumer: `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:13`

### 2.9 `backend/app/api/v1/endpoints/_reserved_modules.toml`

Path: `backend/app/api/v1/endpoints/_reserved_modules.toml`
**8 `[[reserved]]` entries** (`kind`, `name`, `surface`, `reason`, `code`, `docs`).

Header: `_reserved_modules.toml:1-2` "Reserved platform surfaces that are intentionally present in enums/seeds/docs before their full product workflows are implemented."

| kind | name |
|---|---|
| activity_entity_type | VENDOR_ASSESSMENT |
| activity_entity_type | VENDOR_INCIDENT |
| activity_entity_type | VENDOR_SLA |
| activity_entity_type | VENDOR_REMEDIATION |
| role | CONTROL_OWNER |
| permission | vendor_contracts:read |
| permission | vendor_contracts:write |
| permission | controls:approve |

Consumer: `tests/backend/pytest/test_w2_doc_contract_alignment_red.py:45`

---

## 3. Architecture Test Files — Per-File Map

All files live in `tests/backend/pytest/architecture/` unless noted. Every file declares `pytestmark = pytest.mark.contract` (enforced by `test_w11b_test_infra_polish_red.py:32-43`).

### 3.1 `__init__.py`
- Single docstring: "Architecture invariant-lock tests."

### 3.2 `test_authz_contract_doc_drift_red.py`
- **Function:** `test_strict_capabilities_docs_reference_canonical_config_and_invariant_paths`
- **TOML consumed:** none. Reads `docs/security/authorization-capability-contract.md`.
- **Assertion shape:** snapshot equality (substring presence/absence).
- **Asserts:** absent `/api/v1/config/flags` and `frontend/tests/frontend/...`; present `/auth/config` and `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`.
- **What change updates it:** any rename/move of the FE invariant test path or the `/auth/config` endpoint requires updating the contract doc.

### 3.3 `test_dashboard_threshold_contract_red.py`
- **Functions:** `test_dashboard_shared_has_no_static_risk_level_ranges`, `test_dashboard_shared_has_no_default_threshold_imports`, `test_dashboard_shared_has_no_default_threshold_predicate_builder`
- **TOML consumed:** none. AST-parses `backend/app/api/v1/endpoints/dashboard/_shared.py`.
- **Assertion shape:** name-blocklist (forbids assignments `RISK_LEVEL_RANGES`; imports `ConfigDefaults`, `build_risk_level_ranges`; function `build_risk_level_condition`).
- **What change updates it:** introducing those symbols in `dashboard/_shared.py` requires renaming or moving them.

### 3.4 `test_makefile_postgres_lane_red.py`
- **Function:** `test_default_backend_test_target_excludes_postgres_marked_tests`
- **TOML consumed:** none. Reads `scripts/Makefile`.
- **Assertion shape:** snapshot/regex equality.
- **Asserts:** `make test` command matches `^test:\n\t(?P<command>.+)$` and contains `-m "not postgres and not benchmark"`.
- **What change updates it:** changing the Makefile `test:` target requires preserving the postgres/benchmark exclusion.

### 3.5 `test_residual_type_cleanup_contract_red.py`
- **Functions (5):** `test_register_listing_plan_annotations_stay_parameterized`, `test_domain_error_handler_adapter_does_not_reraise_exception`, `test_kri_archive_response_uses_status_constant`, `test_kri_breach_notification_warning_message_is_bounded`, `test_audit_log_activity_return_type_is_not_any`
- **TOML consumed:** none. AST + text reads of `_register_listings/`, `main.py`, `_entity_mutation_lifecycle/archive_plans.py`, `_kri_history/direct_application.py`, `core/audit/types.py`.
- **Assertion shape:** snapshot equality (forbidden substrings; required substrings).
- **What change updates it:** weakening any of these typing/string-bound contracts requires changing the test in step.

### 3.6 `test_w10_capabilities_all_allowlist_red.py`
- **Function:** `test_capabilities_public_exports_match_allowlist`
- **TOML consumed:** `_capabilities_all_allowlist.toml`
- **Assertion shape:** snapshot equality with ORDER preserved (`_module_all_names(CAPABILITIES_INIT) == public_names`).
- **What change updates it:** any add/remove/reorder of `__all__` in `backend/app/services/_authorization_capabilities/__init__.py` requires updating `_capabilities_all_allowlist.toml` in matching order.

### 3.7 `test_w11_docs_index_completeness_red.py`
- **Function:** `test_review_closure_documentation_index_records_accepted_paths_and_decisions`
- **TOML consumed:** none. Reads `docs/README.md`, `docs/DOCUMENTATION_TREE.md`, `AGENTS.md`, `CLAUDE.md`.
- **Assertion shape:** required substring presence.
- **Asserts presence of (9 needles):** `ADR-002`, `ADR-005`, `ADR-010`, `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`, `tests/backend/pytest/test_risks.py`, `backend/app/services/outbox/dispatcher.py`, `ControlStatus.inactive`, `tests/backend/pytest/architecture/_archive_allowlist.toml`, `tests/backend/pytest/architecture/_naming_allowlist.toml`.
- **What change updates it:** removing or renaming any of those references in any of the four docs requires updating both the docs and this list.

### 3.8 `test_w11a_dependency_override_discipline_red.py`
- **Function:** `test_only_whitelisted_files_override_get_db`
- **TOML consumed:** `tests/backend/pytest/_get_db_override_whitelist.toml`
- **Assertion shape:** offender-list-empty (allowlist membership).
- **What change updates it:** adding a new `dependency_overrides[get_db]` block in any `tests/backend/pytest/**/*.py` file requires adding the file to `allowed_files` in the whitelist.

### 3.9 `test_w11b_test_infra_polish_red.py`
- **Functions (3):** `test_architecture_tests_are_marked_contract`, `test_no_unapproved_subprocess_importability_checks_remain`, `test_dead_kri_history_endpoint_facades_are_removed`
- **TOML consumed:** none. Hardcoded Python set:
  - `ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS = {"tests/backend/pytest/api/v1/test_issue_register_projection.py", "tests/backend/pytest/test_install_script_contracts.py"}`
  - `DEAD_KRI_HISTORY_FACADES = {history_corrections.py, history_helpers.py, history_listing.py, history_loading.py, history_submission.py, history_value_application.py}` (all under `backend/app/api/v1/endpoints/kris/`).
- **Assertion shape:** allowlist membership; required absence; required `pytest.mark.contract` on all `tests/backend/pytest/architecture/test_*.py` plus `test_architecture_deepening_contracts.py`.
- **What change updates it:** new architecture test files must declare `pytestmark = pytest.mark.contract`; new subprocess importability tests outside the two approved files require updating the Python set in this test.

### 3.10 `test_w12_alembic_clean_diff_red.py`
- **Function:** `test_alembic_chain_is_clean(alembic_live_db)`
- **TOML consumed:** none. Runs `python -m alembic check`.
- **Assertion shape:** subprocess return-code 0 + output contains "No new upgrade operations detected".
- **What change updates it:** any model/schema change requires generating an Alembic migration so the diff is clean.

### 3.11 `test_w12_committee_authz_parity_red.py`
- **Function:** `test_can_view_committee_legacy_frontend_matches_backend_permission_rule`
- **TOML consumed:** none. Reads `backend/app/core/_permissions/evaluation.py` and `frontend/src/authz/policy.ts`.
- **Assertion shape:** required substring presence in both backend `can_view_risk_committee` body and frontend `policy.ts`.
- **What change updates it:** any change to backend committee-view permission logic requires updating frontend mirror in step.

### 3.12 `test_w12_issue_status_automation_lock_red.py`
- **Function:** `test_automated_issue_status_assignments_are_allowlisted`
- **TOML consumed:** none. Hardcoded Python set:
  ```
  ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS = {
    ("backend/app/services/_kri_history/corrections.py", "closed"),
    ("backend/app/services/issue_deadline_service.py", "in_progress"),
  }
  ```
- **Assertion shape:** snapshot equality (set of `(rel_path, status)`).
- **Skips:** any path under `/_issue_workflow/`.
- **What change updates it:** any new automated `issue.status = ...` assignment outside `_issue_workflow/` requires updating the set.

### 3.13 `test_w12_outbox_enqueue_idempotency_key_present_red.py`
- **Function:** `test_outbox_enqueue_calls_provide_non_empty_idempotency_key`
- **TOML consumed:** none. AST scan of `backend/app/`.
- **Assertion shape:** offender-list-empty + minimum count cap (`call_count >= 5`).
- **What change updates it:** every `OutboxService.enqueue(...)` (or `*outbox_service.enqueue(...)`) call must pass a non-None / non-empty `idempotency_key`.

### 3.14 `test_w12_resource_permissions_keys_match_capability_contract_red.py`
- **Function:** `test_runtime_resource_permission_keys_are_documented_by_capability_contract`
- **TOML consumed:** none. Reads `docs/security/authorization-capability-contract.json`.
- **Assertion shape:** snapshot equality (the hardcoded set of 8 keys) + every key has at least one `AUTHZ-...` action id in the contract.
- **Required keys:** `risks:read`, `controls:read`, `issues:read`, `vendors:read`, `departments:read`, `users:read`, `users:write`, `activity_log:read`.
- **What change updates it:** changing the runtime resource_permissions surface requires editing both the test set and the JSON contract together.

### 3.15 `test_w12_riskhub_config_service_commit_ratchet_red.py`
- **Functions (2):** `test_riskhub_config_service_commits_are_limited_to_transaction_owners`, `test_riskhub_config_service_commit_allowlist_entries_are_justified`
- **TOML consumed:** `_riskhub_config_service_commit_allowlist.toml`
- **Assertion shape:** ratchet — `commit_sites <= allowed` AND `len(commit_sites) <= 2`. Each entry must have non-empty `rationale` and `expires_at >= today()`.
- **What change updates it:** any new `await session.commit()` (or any `*.commit()`-style await) under `backend/app/services/_riskhub_config/` requires adding the (file, line) to the allowlist with rationale; cap stays ≤ 2.

### 3.16 `test_w12_vendor_governance_service_commit_ratchet_red.py`
- **Functions (2):** `test_vendor_governance_service_commits_are_limited_to_lifecycle_owners`, `test_vendor_governance_commit_allowlist_entries_are_justified`
- **TOML consumed:** `_vendor_governance_service_commit_allowlist.toml`
- **Assertion shape:** ratchet — `commit_sites <= allowed` AND `len(commit_sites) <= 4`. Entries must have rationale and unexpired `expires_at`.
- **What change updates it:** new commit sites under `backend/app/services/_vendor_governance/` require allowlist updates; cap stays ≤ 4.

### 3.17 `test_w1_docs_cross_link_red.py`
- **Functions (2):** `test_agent_docs_have_review_closure_headings`, `test_docs_index_cross_links_review_closure_surfaces`
- **TOML consumed:** none. Reads `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/DOCUMENTATION_TREE.md`.
- **Assertion shape:** required substring presence.
- **Required headings (in AGENTS.md and CLAUDE.md):** `## Architecture Locks`, `## Authorization Capability Contract`, `## client_factory`.
- **Required cross-link paths in docs/README + DOCUMENTATION_TREE:** `tests/backend/pytest/architecture/`, `tests/backend/pytest/_get_db_override_whitelist.toml`, `backend/app/api/v1/endpoints/_reserved_modules.toml`, `docs/security/authorization-capability-contract.md`, `docs/security/capability-catalog.json`.
- **What change updates it:** removing those headings or paths from any of the listed docs breaks the test.

### 3.18 `test_w3_gate_snapshot.py`
- **Function:** `test_endpoint_method_required_capability_map_includes_core_read_gates`
- **TOML consumed:** none. Walks FastAPI `api_router.routes`.
- **Assertion shape:** required mapping presence (4 routes).
- **Required map entries:** `(GET, /risks) → risks:read`, `(GET, /controls) → controls:read`, `(GET, /vendors) → vendors:read`, `(GET, /departments) → departments:read`.
- **What change updates it:** removing or weakening those route-level capability deps breaks the test.

### 3.19 `test_w4_bc_a_riskhub_config_boundaries_red.py`
- **Functions (2):** `test_riskhub_config_services_do_not_raise_fastapi_http_exceptions`, `test_riskhub_endpoints_do_not_own_raw_database_commits`
- **TOML consumed:** none. AST scan.
- **Targets:** `backend/app/services/_riskhub_config/` (no `raise HTTPException`); `backend/app/api/v1/endpoints/riskhub/` (no `await *.commit()`).
- **Assertion shape:** offender-list-empty.
- **What change updates it:** RiskHub config services must raise domain errors only; RiskHub endpoints must not own commits.

### 3.20 `test_w4_bc_b_identity_access_boundaries_red.py`
- **Functions (2):** `test_identity_access_lifecycle_services_do_not_raise_fastapi_http_exceptions`, `test_user_endpoints_do_not_own_raw_database_commits`
- **Targets:** `backend/app/services/_identity_access_lifecycle/`, `backend/app/api/v1/endpoints/users/`.

### 3.21 `test_w4_bc_c_vendor_governance_boundaries_red.py`
- **Functions (2):** `test_vendor_governance_services_do_not_raise_fastapi_http_exceptions`, `test_vendor_endpoints_do_not_own_raw_database_commits`
- **Targets:** explicit list `_vendor_governance/{lifecycle,links,policy}.py`, `services/kri_vendor_assignment.py`; `backend/app/api/v1/endpoints/vendors/` (no commits).

### 3.22 `test_w4_bc_d_register_listings_boundaries_red.py`
- **Function:** `test_register_listing_services_do_not_raise_fastapi_http_exceptions`
- **Target:** `backend/app/services/_register_listings/`.

### 3.23 `test_w4_bc_e_approval_execution_boundaries_red.py`
- **Function:** `test_approval_execution_services_do_not_raise_fastapi_http_exceptions`
- **Target:** `backend/app/services/_approval_execution/`.

### 3.24 `test_w4_bc_f_entity_mutation_boundaries_red.py`
- **Function:** `test_entity_mutation_lifecycle_services_do_not_raise_fastapi_http_exceptions`
- **Target:** `backend/app/services/_entity_mutation_lifecycle/`.

### 3.25 `test_w4_bc_g_kri_history_boundaries_red.py`
- **Function:** `test_kri_history_services_do_not_raise_fastapi_http_exceptions`
- **Target:** `backend/app/services/_kri_history/`.

### 3.26 `test_w4_exception_registry_completeness_red.py`
- **Functions (2):** `test_exception_registry_owns_http_retry_and_audit_projections`, `test_every_domain_error_subclass_is_registered`
- **TOML consumed:** none.
- **Assertion shape:** required `app.core.exceptions` exposes `to_http_exception`, `is_retryable`, `audit_log_payload`; every transitive `DomainError` subclass appears in `EXCEPTION_REGISTRY`.
- **What change updates it:** any new `DomainError` subclass must be registered in `EXCEPTION_REGISTRY`.

### 3.27 `test_w4b_outbox_no_commit_in_store_red.py`
- **Function:** `test_outbox_store_participates_in_caller_transactions`
- **Target:** `backend/app/services/outbox/store.py`.
- **Assertion shape:** offender-list-empty (no `await *.commit()`).

### 3.28 `test_w5_approval_scenario_roles_json_contract_red.py`
- **Functions (3):** `test_approval_scenario_approver_roles_uses_json_variant`, `test_approval_scenario_roles_helper_does_not_double_encode_json`, `test_approval_scenario_roles_migration_is_forward_only`
- **Targets:** `backend/app/models/approval_scenario.py`, `backend/app/services/_riskhub_config/approval_scenario_roles.py`, `backend/alembic/versions/i4j5k6l7m8n9_approver_roles_to_jsonb.py`.
- **Assertion shape:** required substring presence (`JSON().with_variant(JSONB(), "postgresql")`, `approver_roles: Mapped[list[str]]`, no `json.dumps`, `raise NotImplementedError`, `ADR-010`).

### 3.29 `test_w5_endpoint_commit_ratchet_red.py`
- **Functions (2):** `test_endpoint_database_commits_are_limited_to_auth_allowlist`, `test_auth_commit_allowlist_entries_are_complete_and_unexpired`
- **TOML consumed:** `_endpoint_commit_allowlist.toml`
- **Assertion shape:** ratchet — `len(allowed) <= 8`, `commit_sites <= allowed`, `len(commit_sites) <= len(allowed)`. Auth-prefixed sites must be subset of allowed. Entries must have rationale + non-expired `expires_at`.
- **What change updates it:** any new endpoint commit under `backend/app/api/v1/endpoints/` (especially under `auth/`) requires either eliminating it or adding to the 8-cap allowlist.

### 3.30 `test_w6_bc_d_register_listing_centralization.py`
- **Functions (2):** `test_kri_and_control_list_endpoints_are_thin_register_listing_adapters`, `test_vendor_listing_orchestration_lives_in_register_listings_module`
- **Forbidden snippets in `kris/crud/list.py` + `controls/crud/list.py`:** `from sqlalchemy import`, `serialize_kris`, `serialize_controls`, `load_total`, `get_control_group_entries`, `select(`, `func.`, `selectinload`.
- **Required:** `vendors/crud.py` imports `list_vendor_governance` from `_register_listings.vendors`; `_vendor_governance/listing.py` does not exist.

### 3.31 `test_w7_audit_adapter_completeness_red.py`
- **Function:** `test_audit_matrix_functions_exist`
- **TOML consumed:** `backend/app/core/audit/_audit_matrix.toml`
- **Assertion shape:** allowlist membership — every `(module, function)` in the TOML must exist as a `def` (sync or async) inside `backend/app/core/audit/<module>.py`.
- **What change updates it:** adding/removing a function from `core/audit/<module>.py` requires updating the TOML matrix.

### 3.32 `test_w7_audit_safe_entity_label_red.py`
- **Function:** `test_audit_activity_calls_pass_safe_entity_label`
- **Target:** all `backend/app/core/audit/*.py` (skip private `_*` and `__init__.py`).
- **Assertion shape:** offender-list-empty — every `log_activity(...)` / `log_activity_func(...)` call must include `safe_entity_label=` keyword.

### 3.33 `test_w8b_archivable_encapsulation_red.py`
- **Functions (5):** `test_archive_allowlist_registry_is_present_and_scoped`, `test_register_listings_use_archivable_clause_for_default_archive_filters`, `test_archivable_mixin_exposes_deep_interface`, `test_vendor_capabilities_use_archivable_state_not_inactive_status`, `test_archive_status_literals_are_not_model_lifecycle_values`, `test_key_risk_indicator_uses_archivable_contract`
- **TOML consumed:** `_archive_allowlist.toml`
- **Assertion shape:** allowlist membership scope (`startswith("backend/app/" or "backend/alembic/versions/")`) + required interface members + forbidden archive-as-status literals + KRI uses `ArchivableMixin`.
- **What change updates it:** any new module that needs direct archive-state access requires adding it to `_archive_allowlist.toml` with rationale, scoped under `backend/app/` or `backend/alembic/versions/`.

### 3.34 `test_w9_schema_datetime_ban.py`
- **Function:** `test_no_bare_datetime_import_in_schemas`
- **Target:** all files under `backend/app/schemas/`.
- **Assertion shape:** offender-list-empty — no `from datetime import datetime` (bare `datetime`); use `UtcAwareDatetime` instead.

### 3.35 `test_w0_harness_contract_red.py` (lives at `tests/backend/pytest/`, included by Make target)
- **Functions (7):** `test_alembic_live_harness_yields_head_revision`, `test_freezegun_active_in_utc`, `test_stable_uuid_is_deterministic`, `test_snapshot_round_trip`, `test_snapshot_fixture_uses_syrupy_assertion`, `test_redacting_snapshot_extension_redacts_sensitive_keys`, `test_redacting_snapshot_extension_uses_single_concrete_syrupy_leaf`, `test_frozen_clock_requires_freezegun_without_dead_module_fallback`
- **Snapshot:** `tests/backend/pytest/__snapshots__/test_w0_harness_contract_red.ambr` contains the `test_snapshot_round_trip` snapshot:
  ```
  dict({'created_at': '<redacted>', 'id': '<redacted>', 'name': 'RiskHub'})
  ```
- **Assertion shape:** snapshot equality (syrupy) + harness fixture contract (frozen clock @ `2026-05-07T12:00:00+00:00`, deterministic UUID7, no dead `ModuleNotFoundError`/`request.module`/`monkeypatch.setattr` fallback in `frozen_clock` fixture).

---

## 4. Cross-Reference: Tests That Live OUTSIDE `architecture/` But Touch These TOMLs

(Run on different Make targets but enforce the same registries.)

### 4.1 `tests/backend/pytest/test_w8a_persistence_contracts_red.py`
- **TOML consumed:** `_naming_allowlist.toml`
- **Functions (4):** `test_persistence_naming_allowlist_registry_exists`, `test_naming_allowlist_registry_is_present_and_parseable`, `test_control_risk_link_declares_database_unique_constraint`, `test_base_metadata_uses_explicit_naming_convention`, plus 2 postgres-marked: `test_issue_link_polymorphic_foreign_keys_are_indexed`, `test_issue_link_target_lookup_can_use_risk_index`.
- **Asserts (line 18):** `data.get("paths", []) == []` — empty list is the explicit invariant. To exempt a path you must change BOTH this assertion AND the TOML.

### 4.2 `tests/backend/pytest/test_w2_doc_contract_alignment_red.py`
- **TOML consumed:** `_reserved_modules.toml`
- **Functions (3):** `test_business_logic_docs_match_reserved_and_threshold_contracts`, `test_reserved_surfaces_registry_covers_code_and_docs`, `test_engineering_docs_link_new_architecture_surfaces`.
- **Asserts:** every reserved name appears in `docs/BUSINESS_LOGIC.md` with "Reserved" marker; `_reserved_modules.toml` covers all 8 entries; activity_log.py + role.py + rbac_seed_contract.py have inline "Reserved: ..." markers; `docs/README.md` + `docs/DOCUMENTATION_TREE.md` link the architecture surfaces.

### 4.3 `tests/backend/pytest/test_architecture_deepening_contracts.py`
- 1423 lines, 49+ test functions covering deeper architecture decomposition contracts (not invariant-lock tests against TOMLs, but flagged by `test_w11b_test_infra_polish_red.py:32-43` as architecture-tier — must carry `pytestmark = pytest.mark.contract`).
- Sample function names: `test_risk_questionnaire_routes_use_lifecycle_interface`, `test_directory_identity_facade_uses_lifecycle_module`, `test_corrective_architecture_gate_rejects_shallow_split_modules`, `test_quarterly_comparison_service_is_composition_facade`, etc.

---

## 5. Decision Table — Which Lock To Update

| Code change | Lock(s) to update |
|---|---|
| Add a `def` to `backend/app/core/audit/{risk,control,kri,vendor,issue,approval}.py` | `_audit_matrix.toml` (W7) |
| Reserve a new enum/role/permission before its workflow ships | `_reserved_modules.toml` + `docs/BUSINESS_LOGIC.md` reserved-marker section |
| Add new `OutboxService.enqueue(...)` call site | none (must pass `idempotency_key` non-empty) |
| Add `await session.commit()` in `backend/app/api/v1/endpoints/auth/*` | `_endpoint_commit_allowlist.toml` (cap ≤ 8, expires 2026-09-01) |
| Add `await session.commit()` in `backend/app/services/_riskhub_config/` | `_riskhub_config_service_commit_allowlist.toml` (cap ≤ 2) |
| Add `await session.commit()` in `backend/app/services/_vendor_governance/` | `_vendor_governance_service_commit_allowlist.toml` (cap ≤ 4) |
| Touch direct archive-state access (model, mixin, alembic version) | `_archive_allowlist.toml` |
| Add or re-order any `__all__` member in `_authorization_capabilities/__init__.py` | `_capabilities_all_allowlist.toml` (ordered) |
| Add `dependency_overrides[get_db]` block in test file | `tests/backend/pytest/_get_db_override_whitelist.toml` |
| Add subprocess importability check (`subprocess.run([sys.executable, "-c", ...])`) in pytest | hardcoded `ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS` set in `test_w11b_test_infra_polish_red.py` |
| Add new automated `issue.status = ...` outside `_issue_workflow/` | hardcoded `ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS` set in `test_w12_issue_status_automation_lock_red.py` |
| Add a new `DomainError` subclass | `EXCEPTION_REGISTRY` in `app.core.exceptions` |
| Add a new architecture invariant test file | declare `pytestmark = pytest.mark.contract` so `test_w11b` passes |
| Add new resource-permission key to `build_me_capabilities` runtime | hardcoded set + `docs/security/authorization-capability-contract.json` action ids in `test_w12_resource_permissions_keys_match_capability_contract_red.py` |
| Add new heading or required path to docs cross-links | `docs/README.md`, `docs/DOCUMENTATION_TREE.md`, `AGENTS.md`, `CLAUDE.md` |
| Persistence naming exception | `_naming_allowlist.toml` AND `test_w8a_persistence_contracts_red.py:18` (currently `paths == []`) |

---

## 6. Notes On Caps and Expiries (Verified vs Audit Claims)

- `_endpoint_commit_allowlist.toml`: 8 entries, test asserts `len(allowed) <= 8`. All `expires_at = "2026-09-01"`. ✓ matches audit
- `_riskhub_config_service_commit_allowlist.toml`: 2 entries, test asserts `len(commit_sites) <= 2`. ✓ matches audit
- `_vendor_governance_service_commit_allowlist.toml`: 4 entries, test asserts `len(commit_sites) <= 4`. ✓ matches audit
- `_naming_allowlist.toml`: `paths = []` (currently empty). ✓ matches audit
- All `expires_at` dates are `2026-09-01`. Today is `2026-05-09` → all currently in-window.

---

## 7. File Inventory Summary

Architecture invariant test files (count = 35 under `tests/backend/pytest/architecture/`):
- `__init__.py` (1)
- `test_authz_contract_doc_drift_red.py`
- `test_dashboard_threshold_contract_red.py`
- `test_makefile_postgres_lane_red.py`
- `test_residual_type_cleanup_contract_red.py`
- `test_w10_capabilities_all_allowlist_red.py`
- `test_w11_docs_index_completeness_red.py`
- `test_w11a_dependency_override_discipline_red.py`
- `test_w11b_test_infra_polish_red.py`
- `test_w12_alembic_clean_diff_red.py`
- `test_w12_committee_authz_parity_red.py`
- `test_w12_issue_status_automation_lock_red.py`
- `test_w12_outbox_enqueue_idempotency_key_present_red.py`
- `test_w12_resource_permissions_keys_match_capability_contract_red.py`
- `test_w12_riskhub_config_service_commit_ratchet_red.py`
- `test_w12_vendor_governance_service_commit_ratchet_red.py`
- `test_w1_docs_cross_link_red.py`
- `test_w3_gate_snapshot.py`
- `test_w4_bc_a_riskhub_config_boundaries_red.py`
- `test_w4_bc_b_identity_access_boundaries_red.py`
- `test_w4_bc_c_vendor_governance_boundaries_red.py`
- `test_w4_bc_d_register_listings_boundaries_red.py`
- `test_w4_bc_e_approval_execution_boundaries_red.py`
- `test_w4_bc_f_entity_mutation_boundaries_red.py`
- `test_w4_bc_g_kri_history_boundaries_red.py`
- `test_w4_exception_registry_completeness_red.py`
- `test_w4b_outbox_no_commit_in_store_red.py`
- `test_w5_approval_scenario_roles_json_contract_red.py`
- `test_w5_endpoint_commit_ratchet_red.py`
- `test_w6_bc_d_register_listing_centralization.py`
- `test_w7_audit_adapter_completeness_red.py`
- `test_w7_audit_safe_entity_label_red.py`
- `test_w8b_archivable_encapsulation_red.py`
- `test_w9_schema_datetime_ban.py`

Plus `test_w0_harness_contract_red.py` at `tests/backend/pytest/` (included via Makefile target).

TOML registries scoped to architecture invariant locks (count = 9):
- `_archive_allowlist.toml`
- `_naming_allowlist.toml`
- `_capabilities_all_allowlist.toml`
- `_endpoint_commit_allowlist.toml`
- `_riskhub_config_service_commit_allowlist.toml`
- `_vendor_governance_service_commit_allowlist.toml`
- `_get_db_override_whitelist.toml` (one level up)
- `_audit_matrix.toml` (under `backend/app/core/audit/`)
- `_reserved_modules.toml` (under `backend/app/api/v1/endpoints/`)
