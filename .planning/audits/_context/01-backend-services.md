# Phase 1 Context Map – Backend Services (Bounded Contexts + Top-Level Modules)

Pure structural snapshot of the seven bounded-context packages plus the top-level service modules implicated by the audit. **No verification, no opinion.** Every line cites `file:line` and quotes ≤15 words from the file.

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. All paths absolute.

Total Python files in the 12 mapped trees: **125** (`find ... -name "*.py" | wc -l`).

---

## 1. `backend/app/services/_riskhub_config/`

### 1.1 File inventory (5 modules + `__init__`)
- `backend/app/services/_riskhub_config/__init__.py` (42 lines)
- `backend/app/services/_riskhub_config/lifecycle.py` (206 lines)
- `backend/app/services/_riskhub_config/departments.py` (173 lines)
- `backend/app/services/_riskhub_config/global_config.py` (204 lines)
- `backend/app/services/_riskhub_config/roles.py` (54 lines)
- `backend/app/services/_riskhub_config/approval_scenario_roles.py` (22 lines)
- `backend/app/services/_riskhub_config/README.md`

### 1.2 Public exports (`__init__.py`)
Lazy-loaded `__getattr__` re-export table:
- `backend/app/services/_riskhub_config/__init__.py:3` — `_EXPORTS = {`
- `backend/app/services/_riskhub_config/__init__.py:14-16` — `ConfigAuditPlan`, `ConfigEntityDefinition`, `ConfigLifecycleOutcome`
- `backend/app/services/_riskhub_config/__init__.py:17-22` — `build_config_audit_plan`, `run_config_create/_update/_noop_update/_delete/_restore`
- `backend/app/services/_riskhub_config/__init__.py:4-13` — department helpers (`department_capabilities`, `department_*_audit_plan`, `department_to_read`, `get_department_dependency_counts`, `load_department_for_update`, `validate_department_manager`)
- `backend/app/services/_riskhub_config/__init__.py:23-26` — role helpers (`load_role_for_update`, `role_capabilities`, `role_to_read`, `validate_permission_ids`)
- `backend/app/services/_riskhub_config/__init__.py:32` — `def __getattr__(name: str):` (PEP 562 lazy import)

### 1.3 Top-level definitions per module
- `lifecycle.py:14` — `ConfigLifecycleStatus = Literal["created", ...]`
- `lifecycle.py:18` — `class ConfigEntityDefinition:`
- `lifecycle.py:24` — `class ConfigAuditPlan:` w/ `as_log_kwargs` (line 36)
- `lifecycle.py:54` — `class ConfigLifecycleOutcome:`
- `lifecycle.py:62` — `def build_config_audit_plan(...)`
- `lifecycle.py:87` — `async def _run_config_lifecycle(...)`
- `lifecycle.py:115` — `async def run_config_create(...)`
- `lifecycle.py:135` — `async def run_config_update(...)`
- `lifecycle.py:155` — `async def run_config_noop_update(...)`
- `lifecycle.py:168` — `async def run_config_delete(...)`
- `lifecycle.py:188` — `async def run_config_restore(...)`
- `departments.py:20` — `class DepartmentDependencyCounts:` w/ `blocks_delete` (line 30)
- `departments.py:43` — `def department_to_read(department, counts)`
- `departments.py:61` — `def _department_audit_plan(...)`
- `departments.py:80,84,88,92` — `department_create_audit_plan` / `_update_` / `_delete_` / `_restore_audit_plan`
- `departments.py:101` — `async def load_department_for_update(...)`
- `departments.py:114` — `async def validate_department_manager(...)`
- `departments.py:123` — `async def get_department_dependency_counts(...)`
- `global_config.py:20` — `RISK_THRESHOLD_KEYS = {...}`
- `global_config.py:27` — `async def ensure_total_assets_value_config(...)`
- `global_config.py:56` — `def serialize_global_config(...)`
- `global_config.py:79` — `async def list_all_global_configs(...)`
- `global_config.py:94` — `async def list_global_config_category(...)`
- `global_config.py:107` — `def _threshold_validation_detail(...)`
- `global_config.py:116` — `def validate_global_config_value(...)`
- `global_config.py:145` — `async def _load_risk_threshold_values(...)`
- `global_config.py:158` — `async def update_global_config(...)`
- `roles.py:13` — `def role_to_read(role, *, user_count=None)`
- `roles.py:28` — `async def load_role_for_update(...)`
- `roles.py:44` — `async def validate_permission_ids(...)`
- `approval_scenario_roles.py:7` — `DEFAULT_APPROVER_ROLES = ["risk_manager", "cro"]`
- `approval_scenario_roles.py:10` — `def get_approval_scenario_roles(scenario)`
- `approval_scenario_roles.py:20` — `def set_approval_scenario_roles(scenario, roles)`

### 1.4 Internal patterns / shims
- `_EXPORTS` mapping plus `__getattr__` (lines 3–41) — lazy facade.
- `_department_audit_plan` (departments.py:61) is the shared private builder; four public functions wrap it.
- `_run_config_lifecycle` (lifecycle.py:87) is the central commit/log helper; `run_config_*` (create/update/noop/delete/restore) all delegate to it.

### 1.5 Cross-imports (this package imports from)
- `roles.py:10` — `from app.services._authorization_capabilities import role_capabilities`
- `lifecycle.py:12` — `from app.services._config.lookup import clear_config_cache`
- `departments.py:14` — `from app.services._authorization_capabilities import department_capabilities`
- `departments.py:15` — `from app.services._org_chart import validate_department_manager_membership`

### 1.6 Cross-imports (other code imports from this package)
- `backend/app/services/approval_scenario_policy.py:13` — `from app.services._riskhub_config.approval_scenario_roles import get_approval_scenario_roles`
- `backend/app/services/_authorization_capabilities/riskhub_config.py:17` — `from app.services._riskhub_config.departments import DepartmentDependencyCounts`
- API endpoints in `backend/app/api/v1/endpoints/riskhub/` use `app.services._riskhub_config` symbols.

### 1.7 Transaction commit sites
- `backend/app/services/_riskhub_config/lifecycle.py:103` — `await db.commit()`
- `backend/app/services/_riskhub_config/lifecycle.py:161` — `await db.commit()` (inside `run_config_noop_update`)

### 1.8 Capability / policy seams
- `roles.py:10` imports `role_capabilities`; `roles.py:24` calls `role_capabilities(role, ...)`.
- `departments.py:14` imports `department_capabilities`; `departments.py:57` calls it inside `department_to_read`.

---

## 2. `backend/app/services/_identity_access_lifecycle/`

### 2.1 File inventory (8 modules + `__init__`)
- `backend/app/services/_identity_access_lifecycle/__init__.py` (19 lines)
- `lifecycle.py` (16 lines)
- `access_scope.py` (119 lines)
- `directory_import.py` (155 lines)
- `execution.py` (76 lines)
- `policy.py` (78 lines)
- `profile_updates.py` (176 lines)
- `projection.py` (27 lines)
- `contracts.py` (33 lines)

### 2.2 Public exports (`__init__.py`)
- `backend/app/services/_identity_access_lifecycle/__init__.py:1-9` — re-exports `AccessProfileUpdateOutcome`, `AccessScopePlan`, `IdentityImportOutcome`, `create_user_profile`, `import_directory_identity`, `update_access_profile`, `update_user_profile`.
- `__init__.py:11-19` — `__all__ = [...]` matching above.

### 2.3 Top-level definitions
- `contracts.py:11` — `class IdentityImportOutcome:` (frozen dataclass)
- `contracts.py:19` — `class AccessProfileUpdateOutcome:` (statuses: `"applied", "blocked", "orphan_flagged", "break_glass_required"`)
- `contracts.py:27` — `class AccessScopePlan:`
- `lifecycle.py:1` — `from .access_scope import update_access_profile`
- `access_scope.py:35` — `def normalize_access_scope_update(update_data)`
- `access_scope.py:40` — `async def update_access_profile(...)`
- `directory_import.py:26` — `def _is_external_id_integrity_error(exc)`
- `directory_import.py:31` — `async def resolve_safe_default_role(db)`
- `directory_import.py:44` — `async def resolve_role_for_directory_import(...)`
- `directory_import.py:58` — `async def import_directory_identity(...)`
- `execution.py:15` — `async def log_user_update_and_commit(...)`
- `execution.py:49` — `async def commit_directory_import(...)`
- `execution.py:72` — `async def load_directory_import_user(...)`
- `policy.py:14` — `def is_global_privileged_user(user)`
- `policy.py:18` — `async def ensure_remaining_global_privileged_user(...)`
- `policy.py:41` — `def ensure_sso_local_field_update_allowed(...)`
- `policy.py:55` — `def ensure_directory_reenable_allowed(...)`
- `policy.py:60` — `async def ensure_role_change_keeps_privileged_access(...)`
- `profile_updates.py:33` — `async def flag_orphaned_items_for_deactivation(...)`
- `profile_updates.py:42` — `async def create_user_profile(...)`
- `profile_updates.py:92` — `async def update_user_profile(...)`
- `projection.py:9` — `def build_directory_import_response(...)`

### 2.4 Internal patterns
- Three commit gateways centralised in `execution.py`: `log_user_update_and_commit` (line 15), `commit_directory_import` (line 49), and the inline `await db.commit()` in `profile_updates.py:85` for the create-user path.
- `policy.py` is purely synchronous policy/check helpers.

### 2.5 Cross-imports (this package imports from)
- `policy.py:10` — `from app.services._access_workflow import ADMIN_PRIVILEGED_ROLES`
- `policy.py:11` — `from app.services.directory_identity_service import requires_break_glass_for_reenable`
- `directory_import.py:14` — `from app.services.ad_deprovision_service import ADDeprovisionService`
- `directory_import.py:15` — `from app.services.directory_identity_service import (DirectoryIdentityConflictError, apply_directory_profile, resolve_directory_email)`
- `profile_updates.py:15` — `from app.services._org_chart import (acquire_org_chart_lock, clear_manager_references_for_inactive_user, validate_dept_manager_dept_change, validate_no_manager_cycle)`
- `profile_updates.py:21` — `from app.services.orphaned_item_service import OrphanedItemService`
- `access_scope.py:14` — `from app.services._access_workflow import (PLATFORM_ADMIN_FIELDS, authorize_access_update_fields, is_platform_admin)`
- `access_scope.py:19` — `from app.services._org_chart import (acquire_org_chart_lock, validate_dept_manager_dept_change, validate_no_manager_cycle)`

### 2.6 Cross-imports (other code imports from this package)
- `backend/app/services/access_user_service.py` (re-export facade), `backend/app/api/v1/endpoints/users/...` consumers (per Bash grep `from app.services._identity_access_lifecycle`).

### 2.7 Transaction commit sites
- `backend/app/services/_identity_access_lifecycle/execution.py:38` — `await db.commit()` (in `log_user_update_and_commit`)
- `backend/app/services/_identity_access_lifecycle/execution.py:69` — `await db.commit()` (in `commit_directory_import`)
- `backend/app/services/_identity_access_lifecycle/profile_updates.py:85` — `await db.commit()` (in `create_user_profile`)

### 2.8 Capability/policy seams
- `policy.py:14` `is_global_privileged_user`, `policy.py:18` `ensure_remaining_global_privileged_user`, `policy.py:41` `ensure_sso_local_field_update_allowed`, `policy.py:55` `ensure_directory_reenable_allowed`, `policy.py:60` `ensure_role_change_keeps_privileged_access` (purely policy gates).
- `access_scope.py:55` calls `is_platform_admin(user)`; `access_scope.py:59` `authorize_access_update_fields(...)`.

---

## 3. `backend/app/services/_vendor_governance/`

### 3.1 File inventory (4 modules + `__init__` + reports stub)
- `__init__.py` (5 lines): `from . import links, reports`
- `lifecycle.py` (143 lines)
- `links.py` (118 lines)
- `policy.py` (110 lines)
- `projection.py` (113 lines)
- `reports.py` (12 lines, contains only `VendorReportDefinition` dataclass)

### 3.2 Public exports
- `_vendor_governance/__init__.py:5` — `__all__ = ["links", "reports"]` (re-exports submodules only).

### 3.3 Top-level definitions
- `lifecycle.py:23` — `async def create_vendor_detail(...)`
- `lifecycle.py:55` — `async def read_vendor_detail(...)`
- `lifecycle.py:65` — `async def update_vendor_detail(...)`
- `lifecycle.py:100` — `async def archive_vendor_detail(...)`
- `lifecycle.py:120` — `async def restore_vendor_detail(...)`
- `links.py:14` — `VendorLink: TypeAlias = VendorRiskLink | VendorControlLink | VendorKRILink`
- `links.py:15` — `VendorLinkModel: TypeAlias = type[VendorRiskLink] | ...`
- `links.py:19` — `class VendorLinkAccessPlan:`
- `links.py:26` — `class VendorLinkedResourceProjection:`
- `links.py:33` — `async def get_vendor(...)`
- `links.py:38` — `async def require_vendor_access(...)` (capability seam)
- `links.py:65` — `async def get_existing_link(...)`
- `links.py:81` — `async def ensure_link_absent(...)`
- `links.py:92` — `async def create_vendor_link(...)`
- `links.py:105` — `async def delete_vendor_link(...)`
- `policy.py:14` — `async def load_vendor_with_deps(...)`
- `policy.py:23` — `async def assert_vendor_readable(...)`
- `policy.py:30` — `async def assert_vendor_update_allowed(...)`
- `policy.py:50` — `async def assert_vendor_governance_update_allowed(...)`
- `policy.py:73` — `async def assert_vendor_create_allowed(...)`
- `policy.py:88` — `async def assert_vendor_delete_allowed(...)`
- `policy.py:98` — `async def assert_vendor_archive_allowed(...)`
- `policy.py:105` — `async def assert_vendor_restore_allowed(...)`
- `projection.py:12` — `async def get_visible_vendor_risk_ids(...)`
- `projection.py:33` — `def serialize_vendor_linked_risks(...)`
- `projection.py:58` — `async def serialize_vendor_reads(...)`
- `projection.py:82` — `async def serialize_vendor_list_items(...)`
- `projection.py:111` — `def serialize_vendor_detail(...)`
- `reports.py:7` — `class VendorReportDefinition:`

### 3.4 Internal patterns
- `policy.py` provides `assert_vendor_*_allowed` (read/update/governance/create/delete/archive/restore) — multiple variants of one assertion shape.
- `links.py:38` `require_vendor_access` calls `require_capability(... "vendors", "read")` then optionally `has_capability("vendors", "write") or is_vendor_owner(...)`.

### 3.5 Cross-imports (this package imports from)
- `links.py:12` — `from app.services._authorization_capabilities import has_capability, require_capability`
- `policy.py:11` — `from app.services._vendor_workflow import load_vendor_for_update, validate_vendor_governance_assignment`

### 3.6 Cross-imports (other code imports from this package)
- `backend/app/services/_register_listings/vendors.py:23` — `from app.services._vendor_governance.projection import (...)`
- API endpoints `backend/app/api/v1/endpoints/vendors/lifecycle.py`, `crud.py`.

### 3.7 Transaction commit sites
- `backend/app/services/_vendor_governance/lifecycle.py:46` — `await db.commit()` (after `vendor_created`)
- `backend/app/services/_vendor_governance/lifecycle.py:91` — `await db.commit()` (after `vendor_updated`)
- `backend/app/services/_vendor_governance/lifecycle.py:117` — `await db.commit()` (after `vendor_archived`)
- `backend/app/services/_vendor_governance/lifecycle.py:136` — `await db.commit()` (after `vendor_restored`)

### 3.8 Capability/policy seams
- `links.py:38` — `require_capability(current_user, "vendors", "read")`
- `links.py:55` — `has_capability(current_user, "vendors", "write") or is_vendor_owner(...)`
- `policy.py:36, 45, 57, 89` — multiple `check_permission(current_user, "vendors", ...)` and `is_vendor_owner` checks.

---

## 4. `backend/app/services/_register_listings/`

### 4.1 File inventory (5 modules + `__init__`)
- `__init__.py` (3 lines): `from app.services._register_listings import lifecycle`
- `lifecycle.py` (90 lines)
- `controls.py` (595 lines)
- `issues.py` (261 lines)
- `kris.py` (421 lines)
- `risks.py` (461 lines)
- `vendors.py` (578 lines)

### 4.2 Public exports
- `_register_listings/__init__.py:3` — `__all__ = ["lifecycle"]`. Other modules are accessed by `app.services._register_listings.controls/issues/kris/risks/vendors`.

### 4.3 Top-level definitions (high-level)
- `lifecycle.py:18-19` — `TModel = TypeVar`, `TItem = TypeVar`
- `lifecycle.py:21` — `SerializeItems = Callable[...]`
- `lifecycle.py:22` — `RegisterListingDefinition = CollectionListingDefinition`
- `lifecycle.py:25` — `class RegisterListingCriteria:`
- `lifecycle.py:30` — `class RegisterSerializerContext:`
- `lifecycle.py:39` — `class RegisterListingPlan(Generic[TModel, TItem]):`
- `lifecycle.py:45` — `def _plan_register_listing(...)`
- `lifecycle.py:76` — `async def execute_register_listing_plan(...)`
- `risks.py:39-44` — `RISK_GROUP_*` sentinel strings + `RISK_SQL_GROUPS = {...}`
- `risks.py:47` — `class RiskListingCriteria:`
- `risks.py:55` — `def risk_group_entries(...)`
- `risks.py:76` — `def visible_risk_vendor_context(...)`
- `risks.py:93` — `async def load_risk_sql_groups(...)`
- `risks.py:168` — `def risk_group_value_filter(...)`
- `risks.py:198` — `def risk_in_memory_grouped_page(...)`
- `risks.py:208` — `def _plan_risk_listing(...)`
- `risks.py:258` — `async def plan_risk_listing(...)`
- `controls.py:47-53` — `CONTROL_GROUP_*` sentinels + `CONTROL_SQL_GROUPS`
- `controls.py:56` — `class ControlListingCriteria:`
- `controls.py:62` — `async def apply_control_department_scoping(...)`
- `controls.py:84` — `def apply_control_process_category_filters(...)`
- `controls.py:96` — `def group_value(value)`
- `controls.py:100` — `def control_group_entries(...)`
- `controls.py:137` — `async def visible_control_risk_context(...)`
- `controls.py:159` — `def visible_control_vendor_context(...)`
- `controls.py:176` — `async def load_control_sql_groups(...)`
- `controls.py:271` — `def control_group_filter(...)`
- `controls.py:322` — `def plan_control_listing(...)`
- `controls.py:382` — `async def build_control_listing_plan(...)`
- `kris.py:43-49` — `KRI_GROUP_*` sentinels + `KRI_SQL_GROUPS`
- `kris.py:52` — `class KRIListingCriteria:`
- `kris.py:58` — `async def can_create_kri_for_any_parent_risk(...)`
- `kris.py:72` — `def kri_group_entries(...)`
- `kris.py:106` — `def count_distinct_kri_if(condition)`
- `kris.py:110` — `def visible_kri_vendor_context(...)`
- `kris.py:127` — `async def load_kri_sql_groups(...)`
- `kris.py:217` — `def kri_group_filter(...)`
- `kris.py:241` — `def kri_in_memory_grouped_page(...)`
- `kris.py:250` — `def plan_kri_listing(...)`
- `kris.py:291` — `async def build_kri_listing_plan(...)`
- `issues.py:54` — `class IssueListingCriteria:` (with `capability_loader: Any = issue_capabilities`)
- `issues.py:63` — `async def plan_issue_listing(...)`
- `vendors.py:32-38` — `VENDOR_GROUP_*` sentinels
- `vendors.py:41` — `class VendorListingGovernance:`
- `vendors.py:48` — `class VendorListCriteria:`
- `vendors.py:69` — `def build_vendor_collection_capabilities(...)`
- `vendors.py:81` — `def merge_collection_filters(...)`
- `vendors.py:85` — `def coerce_vendor_list_criteria(...)`
- `vendors.py:155` — `def apply_vendor_list_filters(...)`
- `vendors.py:197` — `def vendor_order_column(...)`
- `vendors.py:209` — `def vendor_group_counts()`
- `vendors.py:229` — `def vendor_group_rows_to_reads(rows)`
- `vendors.py:242` — `async def visible_vendor_risk_context(...)`
- `vendors.py:266` — `def vendor_flag_membership_query(filtered_ids)`
- `vendors.py:298` — `async def load_vendor_sql_groups(...)`
- `vendors.py:391` — `def vendor_group_value_filter(...)`
- `vendors.py:429` — `def plan_vendor_listing(...)`
- `vendors.py:476` — `async def list_vendor_governance(...)`

### 4.4 Internal patterns
- Each per-resource module follows: GROUP-sentinel constants → `*_group_entries` → `load_*_sql_groups` → `*_group_filter` → `_plan_*_listing` → `build_*_listing_plan`/`plan_*_listing`. Significant **structural duplication** across `risks.py`, `controls.py`, `kris.py`, `vendors.py`, `issues.py`.
- `lifecycle.py:45` — single private `_plan_register_listing` helper consumed by all five sibling modules.

### 4.5 Cross-imports (this package imports from)
- `issues.py:31-32, 39, 48, 49` — `_collection_contracts`, `_collection_filters`, `_issue_register`, `authorization_capabilities`, `issue_visibility_service`.
- `kris.py:23-39` — `_authorization_capabilities.common`, `_collection_contracts`, `_collection_filters`, `_kri_history.value_application`, `_monitoring_response`, `_monitoring_status`, `authorization_capabilities`.
- `vendors.py:16-28` — `_collection_contracts`, `_collection_filters`, `_vendor_governance.projection`, `_vendor_workflow`.
- `controls.py:33-43` — `_authorization_capabilities.common`, `_collection_contracts`, `_collection_filters`, `_monitoring_response`, `_monitoring_status`, `authorization_capabilities`.
- `risks.py:27-29` — `_authorization_capabilities`, `_authorization_capabilities.common`, `_collection_contracts`.
- `lifecycle.py:7` — `from app.services._collection_contracts import (...)`.

### 4.6 Cross-imports (other code imports from this package)
- `app.services._register_listings` is reached via the bare facade module imported by `backend/app/api/v1/endpoints/{risks,controls,kris,vendors,issues}/crud/list.py`.

### 4.7 Transaction commit sites
- **None** in this package (read-only listing layer). `grep -rn "await.*commit" backend/app/services/_register_listings/` returns 0 hits.

### 4.8 Capability/policy seams
- `risks.py:397-402, 434` — `check_permission(current_user, "vendors", "read")`, `risk_capabilities(...)`.
- `controls.py:458-463, 498-506` — `check_permission(... "vendors", "read")`, `check_permission(... "controls", "write")`, `control_capabilities(...)`.
- `kris.py:59` — `check_permission(current_user, "risks", "write")`.
- `kris.py:366-371, 389-396` — `check_permission(... "vendors", "read")`, `kri_capabilities(...)`.
- `issues.py:91-95, 232-238` — `has_permission(current_user, "issues|reports|vendors", ...)`.
- `vendors.py:69-78` — `build_vendor_collection_capabilities(...)`.

---

## 5. `backend/app/services/_approval_execution/`

### 5.1 File inventory (15 .py files)
- `__init__.py` (10 lines)
- `authorization.py` (117 lines)
- `constants.py` (45 lines)
- `delete_side_effects.py` (101 lines)
- `edit_risk_control.py` (124 lines)
- `helpers.py` (78 lines)
- `kri_changes.py` (22 lines)
- `kri_generic_edit.py` (148 lines)
- `kri_history_correction.py` (126 lines)
- `kri_side_effects.py` (52 lines)
- `kri_value_submission.py` (104 lines)
- `loading.py` (47 lines)
- `logging.py` (24 lines)
- `resolution.py` (111 lines)
- `results.py` (37 lines)
- `side_effects.py` (38 lines)
- `staleness.py` (57 lines)
- `README.md`

### 5.2 Public exports (`__init__.py`)
- `_approval_execution/__init__.py:7` — `from . import resolution as resolution`
- `_approval_execution/__init__.py:9` — `__all__ = ["resolution"]`
- `__init__.py:1-5` — comment: "Public facade is `app.services.approval_execution_service`."

### 5.3 Top-level definitions (selected)
- `authorization.py:16` — `async def assert_can_approve(...)` (returns `(is_privileged, is_primary_approver, is_scenario_approver)` tuple)
- `authorization.py:60` — `def apply_status_transition(...)`
- `constants.py:3` — `EDITABLE_FIELDS = {"risk": {...}, "control": {...}, "kri": {...}}`
- `delete_side_effects.py:26` — `async def _apply_delete_side_effects(...)`
- `edit_risk_control.py:18` — `async def _apply_edit_risk_control(...)`
- `helpers.py:18` — `class AppliedFieldChanges:`
- `helpers.py:25` — `def missing_resource_auto_rejection(...)`
- `helpers.py:41` — `async def apply_whitelisted_pending_changes(...)`
- `kri_changes.py:10` — `def build_kri_changes(...)`
- `kri_generic_edit.py:25` — `async def _apply_kri_generic_edit(...)`
- `kri_history_correction.py:23` — `def _auto_reject_kri_approval(...)` (duplicated identical helper in kri_value_submission.py:23)
- `kri_history_correction.py:27` — `async def _apply_kri_history_correction(...)`
- `kri_side_effects.py:19` — `async def _apply_edit_kri(...)` (dispatcher: history_entry_id → correction; period_end+current_value → submission; else generic)
- `kri_value_submission.py:23` — `def _auto_reject_kri_approval(...)` (duplicate of one in kri_history_correction)
- `kri_value_submission.py:27` — `def _pending_change_new(value)`
- `kri_value_submission.py:33` — `async def _apply_kri_value_submission(...)`
- `loading.py:9` — `async def load_approval(...)`
- `loading.py:31` — `async def get_approval_department_id(...)`
- `logging.py:9` — `async def log_approval_approve(...)`
- `resolution.py:17` — `class ApprovalResolutionEventPlan:`
- `resolution.py:34` — `def approval_resolved_event_plan(...)`
- `resolution.py:45` — `def approval_cancelled_event_plan(...)`
- `resolution.py:57` — `def approval_escalated_event_plan(...)`
- `resolution.py:65` — `async def finalize_approval_resolution(...)`
- `resolution.py:94` — `async def finalize_approval_resolution_plan(...)`
- `results.py:9` — `class SideEffectOutcome(str, Enum):`
- `results.py:14` — `class SideEffectResult:`
- `results.py:28` — `def apply_auto_rejection(approval, result)`
- `side_effects.py:14` — `SIDE_EFFECT_HANDLERS: dict[(ApprovalActionType, ApprovalResourceType), SideEffectHandler] = {...}`
- `side_effects.py:24` — `async def apply_side_effects(...)`
- `staleness.py:18` — `def reject_stale_change(...)`
- `staleness.py:24` — `def reject_if_stale_pending_change(...)`
- `staleness.py:47` — `def reject_if_stale_value(...)`

### 5.4 Internal patterns / shims / duplicates
- **Duplicate `_auto_reject_kri_approval`**: identical 2-line helper at `kri_history_correction.py:23` and `kri_value_submission.py:23`.
- All side-effect entry points are private (`_apply_*`) and dispatched through `side_effects.py:14` `SIDE_EFFECT_HANDLERS` mapping.
- `kri_side_effects.py:45-51` performs ad-hoc payload sniffing to choose history-correction / value-submission / generic-edit branches.

### 5.5 Cross-imports (this package imports from)
- `authorization.py:9` — `from app.services.approval_scenario_policy import (can_view_approval_resource, scenario_allows_privileged_resolution, user_matches_approval_scenario_role)`
- `kri_value_submission.py:13` — `from app.services._kri_history.governance import (build_kri_value_mutation_changes, capture_kri_value_mutation_snapshot)`
- `kri_value_submission.py:45` — TYPE_CHECKING import `from app.services.kri_history_service import KRIHistoryService`
- `kri_generic_edit.py:12` — `from app.services._kri_history.governance import (...)`
- `kri_generic_edit.py:16` — `from app.services.kri_vendor_assignment import assign_vendors_to_kri, ensure_vendors_exist, normalize_vendor_ids`
- `kri_history_correction.py:13` — `from app.services._kri_history.governance import (...)`
- `kri_history_correction.py:36` — local import `from app.services.kri_history_service import KRIHistoryService`
- `kri_changes.py:4` — `from app.services._kri_history.governance import (KRIValueMutationSnapshot, build_kri_value_mutation_changes)`
- `resolution.py:10` — `from app.services.outbox import OutboxService`

### 5.6 Cross-imports (other code imports from this package)
- `backend/app/services/approval_execution_service.py:23-34` — imports `apply_status_transition`, `assert_can_approve`, `EDITABLE_FIELDS`, `get_approval_department_id`, `load_approval`, `log_approval_approve`, `finalize_approval_resolution_plan` and event plans, `apply_auto_rejection`, `apply_side_effects`.

### 5.7 Transaction commit sites
- `backend/app/services/_approval_execution/resolution.py:88` — `await db.commit()` (inside `finalize_approval_resolution`).

### 5.8 Capability/policy seams
- `authorization.py:30` — `is_privileged = can_resolve_approvals(current_user)`
- `authorization.py:33-34` — `scenario_match = user_matches_approval_scenario_role(approval, current_user)`, `privileged_scenario_match = scenario_allows_privileged_resolution(approval, current_user)`
- Side-effect modules read whitelist via `EDITABLE_FIELDS.get("risk|control|kri", set())`.

---

## 6. `backend/app/services/_entity_mutation_lifecycle/`

### 6.1 File inventory (7 modules + `__init__`)
- `__init__.py` (3 lines): `from app.services._entity_mutation_lifecycle import lifecycle` and `__all__ = ["lifecycle"]`
- `lifecycle.py` (126 lines)
- `approval_plans.py` (323 lines)
- `archive_plans.py` (301 lines)
- `contracts.py` (43 lines)
- `direct_apply.py` (203 lines)
- `policy.py` (233 lines)
- `projection.py` (56 lines)

### 6.2 Public exports (`lifecycle.py:114-126` `__all__`)
- `EntityApprovalPlan`, `EntityDirectApplyPlan`, `EntityMutationKind`, `EntityMutationOptions`, `EntityMutationOutcome`
- `archive_control_detail`, `archive_kri_detail`, `archive_risk_detail`
- `update_control_detail`, `update_kri_detail`, `update_risk_detail`

### 6.3 Top-level definitions
- `contracts.py:10` — `EntityMutationKind = Literal["applied", "approval_queued", "no_op", "blocked"]`
- `contracts.py:13` — `class EntityMutationOutcome:`
- `contracts.py:19` — `class EntityMutationOptions:`
- `contracts.py:27` — `class EntityApprovalPlan:`
- `contracts.py:37` — `class EntityDirectApplyPlan:`
- `lifecycle.py:37` — `async def update_risk_detail(...)`
- `lifecycle.py:56` — `async def update_control_detail(...)`
- `lifecycle.py:81` — `async def update_kri_detail(...)`
- `policy.py:25` — `def raise_missing_permission(...)`
- `policy.py:29` — `async def validate_risk_type(...)`
- `policy.py:42` — `async def load_risk_or_404(...)`
- `policy.py:49` — `def assert_risk_update_access(...)`
- `policy.py:62` — `async def validate_risk_update_payload(...)`
- `policy.py:70` — `async def assert_no_pending_delete(...)`
- `policy.py:90` — `async def assert_no_existing_pending_delete_request(...)`
- `policy.py:110` — `async def load_control_or_404(...)`
- `policy.py:117` — `async def assert_control_update_access(...)`
- `policy.py:136` — `async def prepare_risk_update(...)`
- `policy.py:157` — `async def prepare_control_update(...)`
- `policy.py:186` — `async def prepare_kri_update(...)`
- `approval_plans.py:33` — `def build_pending_changes(...)`
- `approval_plans.py:43` — `def build_priority_risk_change_set(...)`
- `approval_plans.py:54` — `async def first_high_risk_linked_risk(...)`
- `approval_plans.py:62` — `async def create_risk_edit_approval_if_required(...)`
- `approval_plans.py:154` — `async def create_control_edit_approval_if_required(...)`
- `approval_plans.py:253` — `async def create_kri_edit_approval_if_required(...)`
- `archive_plans.py:38` — `async def assert_can_request_delete_risk(...)`
- `archive_plans.py:56` — `async def assert_can_request_delete_control(...)`
- `archive_plans.py:72` — `async def assert_can_request_delete_kri(...)`
- `archive_plans.py:95` — `async def archive_risk_detail(...)`
- `archive_plans.py:171` — `async def archive_control_detail(...)`
- `archive_plans.py:240` — `async def archive_kri_detail(...)`
- `direct_apply.py:26` — `def risk_score_change_set(...)`
- `direct_apply.py:45` — `async def reload_risk_with_relationships(...)`
- `direct_apply.py:58` — `async def reload_control_with_relationships(...)`
- `direct_apply.py:71` — `async def reload_kri_with_relationships(...)`
- `direct_apply.py:86` — `async def apply_risk_update_directly(...)`
- `direct_apply.py:129` — `async def apply_control_update_directly(...)`
- `direct_apply.py:165` — `async def apply_kri_update_directly(...)`
- `projection.py:20` — `async def serialize_risk_mutation_response(...)`
- `projection.py:31` — `async def serialize_control_mutation_response(...)`
- `projection.py:42` — `async def serialize_kri_mutation_response(...)`

### 6.4 Internal patterns
- Three parallel risk/control/kri update branches (policy → approval → direct apply); see `lifecycle.py:37-111`.
- `archive_plans.py` repeats a 3-pass "risk/control/kri archive request" pattern with tracebacks: each calls `mark_archived` + audit + `db.commit()` followed by `db.rollback()` on failure.
- `policy.py:70` `assert_no_pending_delete` and `policy.py:90` `assert_no_existing_pending_delete_request` are near-duplicates — same query shape, different exception types (`ConflictError` vs `ValidationError`).

### 6.5 Cross-imports (this package imports from)
- `archive_plans.py:32` — `from app.services._authorization_capabilities import require_capability`
- `archive_plans.py:35` — `from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy`
- `direct_apply.py:21` — `from app.services._kri_history.value_application import visible_linked_vendors`
- `direct_apply.py:22` — `from app.services.authorization_capabilities import control_capabilities, kri_capabilities, risk_capabilities`
- `direct_apply.py:23` — `from app.services.kri_vendor_assignment import assign_vendors_to_kri`
- `policy.py:22` — `from app.services.kri_vendor_assignment import normalize_vendor_ids, validate_assignable_vendors`
- `approval_plans.py:30` — `from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy`
- `projection.py:12` — `from app.services._monitoring_response import (...)`

### 6.6 Cross-imports (other code imports from this package)
- `backend/app/api/v1/endpoints/risks/crud/{archive,update}.py`, `controls/crud/{archive,update}.py`, `kris/crud/{archive,update}.py` import the `lifecycle` facade.

### 6.7 Transaction commit sites
- `backend/app/services/_entity_mutation_lifecycle/archive_plans.py:118` — `await db.commit()` (risk archive)
- `archive_plans.py:191` — `await db.commit()` (control archive)
- `archive_plans.py:260` — `await db.commit()` (KRI archive)
- `direct_apply.py:111` — `await db.commit()` (risk direct apply)
- `direct_apply.py:147` — `await db.commit()` (control direct apply)
- `direct_apply.py:187` — `await db.commit()` (KRI direct apply)

### 6.8 Capability/policy seams
- `archive_plans.py:44` `require_capability(current_user, "risks", "delete")`; `:62` `controls,delete`; `:78` `risks,delete`.
- `policy.py:50, 52, 124, 127` — `check_permission(... "risks|controls", "write")`, `check_department_access(...)`.
- `approval_plans.py:69, 162, 267` — `if can_resolve_approvals(current_user): return None`.

---

## 7. `backend/app/services/_kri_history/`

### 7.1 File inventory (18 files + `__init__`)
- `__init__.py` (5 lines): docstring only — *no exports*.
- `approval_intake.py` (193 lines)
- `clock.py` (8 lines): `def today()` returning `utc_now().date()`
- `constants.py` (3 lines): `REPORTING_GRACE_DAYS = 15`
- `correction_plans.py` (15 lines): `class KriCorrectionDraft` and `build_kri_correction_plan`
- `corrections.py` (140 lines)
- `direct_application.py` (219 lines)
- `governance.py` (260 lines)
- `intake.py` (57 lines)
- `loading.py` (41 lines)
- `logging.py` (5 lines): `logger = logging.getLogger("app.services.kri_history_service")`
- `periods.py` (113 lines)
- `projection.py` (28 lines)
- `queries.py` (215 lines)
- `recording.py` (140 lines)
- `service.py` (121 lines): `class KRIHistoryService`
- `submission.py` (22 lines): wrapper around `create_kri_submission_approval`
- `value_application.py` (8 lines): exports `apply_kri_value_directly`, `run_best_effort_notification`, `visible_linked_vendors`
- `workflow.py` (51 lines)
- `README.md`

### 7.2 Public exports (`__init__.py`)
- `_kri_history/__init__.py:1-4` — docstring only: *"Public API is exposed via `app.services.kri_history_service`."*
- No `__all__`. Each subscriber imports explicit symbols from sub-modules.

### 7.3 Top-level definitions (selected)
- `governance.py:25` — `class KRIValueMutationTarget(Protocol):`
- `governance.py:36` — `class KRIValueMutationSnapshot:`
- `governance.py:43` — `class KriValueGovernanceOutcome:`
- `governance.py:50` — `class KriCorrectionExecutionPlan:`
- `governance.py:58` — `class KriHistoryProjection:`
- `governance.py:66` — `def capture_kri_value_mutation_snapshot(kri)`
- `governance.py:74` — `def build_kri_value_mutation_changes(...)`
- `governance.py:88` — `def build_kri_value_history_activity_changes(...)`
- `governance.py:100` — `def describe_kri_limit_breach(...)`
- `governance.py:113` — `async def record_kri_value_governance(...)`
- `governance.py:130` — `async def list_kri_history_projection(...)`
- `governance.py:187` — `async def _create_kri_history_correction_approval(...)`
- `governance.py:208` — `async def correct_kri_history_governance(...)`
- `intake.py:18` — `class KRIValueIntakeMode(StrEnum):`
- `intake.py:23` — `def select_kri_value_intake_mode(...)`
- `intake.py:29` — `async def record_kri_value_intake(...)`
- `recording.py:25` — `class DuplicateKRIPeriodError(ValueError):`
- `recording.py:29` — `async def record_value(...)`
- `corrections.py:19` — `AUTO_CLOSED_KRI_BREACH_NOTE = "Auto-closed because corrected KRI breach is now within limits."`
- `corrections.py:26` — `async def _close_retracted_kri_breach_issues(...)`
- `corrections.py:68` — `async def apply_history_correction(...)`
- `direct_application.py:30` — `def visible_linked_vendors(...)`
- `direct_application.py:46` — `async def run_best_effort_notification(...)`
- `direct_application.py:66` — `async def run_best_effort_notification_batch(...)`
- `direct_application.py:83` — `def format_kri_breach_notification_warning(...)`
- `direct_application.py:92` — `async def apply_kri_value_directly(...)`
- `approval_intake.py:30` — `async def create_kri_submission_approval(...)`
- `approval_intake.py:128` — `async def create_kri_history_correction_approval(...)`
- `loading.py:11` — `async def _load_kri_with_risk_or_404(...)`
- `loading.py:33` — `async def _assert_kri_submit_access(...)`
- `workflow.py:13` — `async def ensure_can_read_history(...)`
- `workflow.py:18` — `async def ensure_can_submit_value(...)`
- `workflow.py:26` — `async def can_request_history_correction(...)`
- `workflow.py:37` — `async def ensure_can_request_history_correction(...)`
- `workflow.py:42` — `async def history_capabilities(...)`
- `workflow.py:48` — `def latest_closed_period_end(kri)`
- `service.py:32` — `class KRIHistoryService:` — wraps `record_value`, `get_history`, `apply_history_correction`, etc.
- `correction_plans.py:7` — `class KriCorrectionDraft:`
- `correction_plans.py:13` — `def build_kri_correction_plan(...)`
- `submission.py:9` — `async def _create_kri_submission_approval(...)` — single-line wrapper for `create_kri_submission_approval`
- `value_application.py:1-7` — `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors`

### 7.4 Internal patterns / shims / re-exports
- **`submission.py:9` `_create_kri_submission_approval`** is a 13-line near-trivial wrapper that simply delegates to `create_kri_submission_approval` from `approval_intake.py`.
- **`value_application.py`** exists only to re-export 3 symbols from `direct_application.py`.
- **`governance.py:113` `record_kri_value_governance`** delegates to `intake.record_kri_value_intake` (lazy import inside function body, line 120).
- **`governance.py:187` `_create_kri_history_correction_approval`** is a thin wrapper around `approval_intake.create_kri_history_correction_approval`.
- `governance.py:146-150` performs deferred imports `from app.services.kri_history_service import KRIHistoryService` (inside `list_kri_history_projection`).
- `governance.py:216-217` deferred imports inside `correct_kri_history_governance`.
- `KRIHistoryService` (`service.py:32`) is a static-method shell (no instance state); `__call__` raises NotImplementedError.

### 7.5 Cross-imports (this package imports from)
- `recording.py:12` — `from app.services._monitoring_status.kris import classify_kri_breach`
- `corrections.py:15` — `from app.services._monitoring_status.kris import classify_kri_breach`
- `approval_intake.py:24` — `from app.services.approval_scenario_policy import apply_approval_scenario_snapshot, load_approval_scenario_policy`
- `direct_application.py:16` — `from app.services.authorization_capabilities import kri_capabilities`
- `direct_application.py:101-102` — local imports `from app.services.kri_history_service import KRIHistoryService`, `from app.services.notification_service import NotificationService`
- `governance.py:146-150` and `:216-217` — deferred imports of `kri_history_service`, `approval_scenario_policy`
- `projection.py:10` — `from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response`

### 7.6 Cross-imports (other code imports from this package)
- `backend/app/services/approval_execution_service.py` (transitively via `_approval_execution`).
- `backend/app/services/_approval_execution/{kri_changes,kri_generic_edit,kri_history_correction,kri_value_submission}.py` import from `_kri_history.governance`.
- `backend/app/services/_register_listings/kris.py:31` — `from app.services._kri_history.value_application import visible_linked_vendors`
- `backend/app/services/_entity_mutation_lifecycle/direct_apply.py:21` — `from app.services._kri_history.value_application import visible_linked_vendors`
- `backend/app/services/_authorization_capabilities/kris.py:15` — `from app.services._kri_history.workflow import can_request_history_correction`

### 7.7 Transaction commit sites
- `backend/app/services/_kri_history/direct_application.py:57` — `await db.commit()` (inside `run_best_effort_notification` when `commit_on_success=True`)
- `direct_application.py:77` — `await db.commit()` (inside `run_best_effort_notification_batch`)
- `direct_application.py:171` — `await db.commit()` (inside `apply_kri_value_directly`)
- `governance.py:246` — `await db.commit()` (inside `correct_kri_history_governance`)

### 7.8 Capability/policy seams
- `workflow.py:13` `ensure_can_read_history` (calls `can_read_kri_id`)
- `workflow.py:18` `ensure_can_submit_value` (calls `is_kri_reporting_owner`, `has_permission(... "kri", "submit")`, `check_department_access`)
- `workflow.py:26` `can_request_history_correction` (calls `has_permission("risks", "write")`)
- `governance.py:238` `if can_resolve_approvals(current_user) or not scenario_policy.requires_approval:`
- `intake.py:42` `mode = select_kri_value_intake_mode(can_resolve=can_resolve_approvals(current_user))`

---

## 8. `backend/app/services/_issue_workflow/`

### 8.1 File inventory (16 modules + `__init__`)
- `__init__.py` (5 lines): docstring only.
- `assignment.py` (62 lines)
- `closure.py` (64 lines)
- `contracts.py` (35 lines)
- `exception_selection.py` (81 lines)
- `exceptions.py` (138 lines)
- `execution.py` (276 lines)
- `lifecycle.py` (33 lines)
- `loading.py` (71 lines)
- `outbox.py` (60 lines)
- `remediation.py` (164 lines)
- `serialization.py` (42 lines)
- `service.py` (56 lines)
- `source_validation.py` (131 lines)
- `transitions.py` (96 lines)
- `update_plans.py` (114 lines)
- `README.md`

### 8.2 Public exports
- `_issue_workflow/__init__.py:1-4` — *"Public API is exposed via `app.services.issue_workflow_service`."* No `__all__`.
- `lifecycle.py:20-33` — re-exports `IssueExceptionSelection`, `IssueOutboxPlan`, `IssueUpdatePlan`, `IssueWorkflowOutcome`, `approve_exception_detail`, `assign_issue_detail`, `close_issue_detail`, `request_exception_detail`, `revoke_exception_detail`, `start_remediation_detail`, `update_issue_detail`, `update_remediation_progress_detail`.

### 8.3 Top-level definitions
- `contracts.py:13` — `class IssueWorkflowOutcome(Generic[TResponse]):`
- `contracts.py:18` — `class IssueUpdatePlan:`
- `contracts.py:24` — `class IssueExceptionSelection:`
- `contracts.py:29` — `class IssueOutboxPlan:`
- `service.py:25` — `class IssueWorkflowService:` (static-method shell, lines 33-44 wrap `assign_issue`, `start_remediation`, `update_progress`, `request_exception`, `approve_exception`, `revoke_exception`, `close_issue`)
- `transitions.py:11` — `def _conflict(detail)`
- `transitions.py:15` — `def _status_value(value)`
- `transitions.py:20` — `def _is_remediation_complete(remediation)`
- `transitions.py:29` — `def _completion_updates(...)`
- `transitions.py:40` — `def _ensure_issue_not_closed(...)`
- `transitions.py:45-63` — `ISSUE_TRANSITIONS`, `REMEDIATION_TRANSITIONS` dicts
- `transitions.py:66` — `def _ensure_issue_transition(...)`
- `transitions.py:76` — `def _ensure_remediation_transition(...)`
- `transitions.py:86` — `def _get_or_init_remediation(...)`
- `assignment.py:16` — `async def assign_issue(...)`
- `closure.py:14` — `async def close_issue(...)`
- `exceptions.py:22` — `async def request_exception(...)`
- `exceptions.py:60` — `async def approve_exception(...)`
- `exceptions.py:92` — `async def revoke_exception(...)`
- `exception_selection.py:12` — `async def select_exception_for_approval(...)`
- `exception_selection.py:46` — `async def select_exception_for_revocation(...)`
- `remediation.py:29` — `async def start_remediation(...)`
- `remediation.py:75` — `async def update_progress(...)`
- `loading.py:22` — `async def get_issue_with_relations(...)`
- `loading.py:50` — `async def get_readable_issue_or_404(...)`
- `loading.py:59` — `async def get_writable_issue_or_404(...)`
- `loading.py:68-70` — `_get_issue_with_relations = get_issue_with_relations` etc. (module-private aliases)
- `outbox.py:9` — `async def enqueue_issue_outbox(...)`
- `outbox.py:20` — `def issue_assigned_outbox_plan(...)`
- `outbox.py:34` — `def issue_exception_requested_outbox_plan(...)`
- `outbox.py:47` — `def issue_exception_approved_outbox_plan(...)`
- `serialization.py:18` — `active_exception = _active_exception`
- `serialization.py:21` — `async def serialize_exception_with_user_names(...)`
- `serialization.py:28` — `async def serialize_refreshed_issue(...)`
- `serialization.py:41` — `_serialize_exception_with_user_names = serialize_exception_with_user_names` (alias)
- `source_validation.py:16` — `async def validate_user_exists(...)`
- `source_validation.py:24` — `async def ensure_owner_assignable(...)`
- `source_validation.py:45` — `async def issue_link_department_ids(...)`
- `source_validation.py:89` — `async def resolve_vendor_department_and_access(...)`
- `update_plans.py:16` — `CONCRETE_SOURCE_TYPES = {"control_execution", "kri_breach"}`
- `update_plans.py:19` — `def source_type_value(source_type)`
- `update_plans.py:23` — `async def build_issue_update_plan(...)`
- `execution.py:52` — `async def update_issue_detail(...)`
- `execution.py:105` — `async def assign_issue_detail(...)`
- `execution.py:135` — `async def start_remediation_detail(...)`
- `execution.py:153` — `async def update_remediation_progress_detail(...)`
- `execution.py:175` — `async def close_issue_detail(...)`
- `execution.py:194` — `async def request_exception_detail(...)`
- `execution.py:218` — `async def approve_exception_detail(...)`
- `execution.py:254` — `async def revoke_exception_detail(...)`

### 8.4 Internal patterns / **shims / duplicates** (heavy audit attention)
- **`source_validation.py:117-120` private aliases**:
  - `_ensure_owner_assignable = ensure_owner_assignable`
  - `_issue_link_department_ids = issue_link_department_ids`
  - `_resolve_vendor_department_and_access = resolve_vendor_department_and_access`
  - `_validate_user_exists = validate_user_exists`
- **`source_validation.py:89-114` `resolve_vendor_department_and_access`** is **duplicated verbatim** in `_issue_register/source_mutation.py:28-53`. Same SQL, same exceptions.
- `serialization.py:18` — `active_exception = _active_exception` (alias to `_issue_register.serialization._active_exception`).
- `serialization.py:41` — `_serialize_exception_with_user_names = serialize_exception_with_user_names` (back-alias).
- `loading.py:68-70` — module-level shim aliases `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404`.

### 8.5 Cross-imports (this package imports from)
- `source_validation.py:9` — `from app.services._issue_register.source_mutation import (clear_issue_source_links, ensure_issue_source_link, resolve_issue_source_metadata)`
- `serialization.py:8` — `from app.services._issue_register import serialize_issue_read_for_actor`
- `serialization.py:9-13` — `from app.services._issue_register.serialization import (_active_exception, _serialize_exception_with_user_names as _register_serialize_exception_with_user_names)`
- `outbox.py:6` — `from app.services.outbox import OutboxService`
- `execution.py:49` — `from app.services.issue_workflow_service import IssueWorkflowService` (re-imports the public facade through the package's own subdirectory)

### 8.6 Cross-imports (other code imports from this package)
- `backend/app/services/issue_workflow_service.py:1` — single-line facade.
- `backend/app/services/issue_deadline_service.py`, `backend/app/api/v1/endpoints/issues/{workflow,exceptions,...}.py` consume the facade and `_issue_workflow.lifecycle` re-exports.

### 8.7 Transaction commit sites (heavy audit attention)
All inside `_issue_workflow/execution.py`:
- `execution.py:99` — `await db.commit()` (update_issue_detail)
- `execution.py:131` — `await db.commit()` (assign_issue_detail)
- `execution.py:149` — `await db.commit()` (start_remediation_detail)
- `execution.py:171` — `await db.commit()` (update_remediation_progress_detail)
- `execution.py:190` — `await db.commit()` (close_issue_detail)
- `execution.py:212` — `await db.commit()` (request_exception_detail)
- `execution.py:248` — `await db.commit()` (approve_exception_detail)
- `execution.py:272` — `await db.commit()` (revoke_exception_detail)
**Total: 8 explicit commits in execution.py.**

### 8.8 Capability/policy seams
- `loading.py:50, 59` — `can_read_issue_id`, `can_write_issue_id`.
- `update_plans.py:39` — `if not can_access_department_id(current_user, new_dept_id):`
- `source_validation.py:32-37` — `is_issue_owner_assignable_to_department(...)` central gate.
- `source_validation.py:101` — `if row is None or not await can_read_vendor_id(db, current_user, vendor_id):`

---

## 9. `backend/app/services/_issue_register/`

### 9.1 File inventory (6 modules + `__init__`)
- `__init__.py` (49 lines)
- `constants.py` (8 lines)
- `grouping.py` (253 lines)
- `linked_context.py` (199 lines)
- `projection.py` (56 lines)
- `serialization.py` (372 lines)
- `source_mutation.py` (249 lines)
- `README.md`

### 9.2 Public exports (`__init__.py`)
- `_issue_register/__init__.py:1-2` — `from . import projection as projection`, `from . import source_mutation as source_mutation`
- `__init__.py:3-16` — re-exports `ISSUE_GROUP_*` constants and `issue_group_*`/`issue_*_context_subquery`/`load_issue_sql_groups` from `grouping`
- `__init__.py:17` — `from .projection import serialize_issue_read_for_actor, serialize_issue_summaries_for_actor`
- `__init__.py:18-24` — `from .source_mutation import (ResolvedIssueSource, clear_issue_source_links, ensure_issue_source_link, resolve_contextual_issue_source, resolve_issue_source_metadata)`
- `__init__.py:26-48` — explicit `__all__` listing each name above.

### 9.3 Top-level definitions
- `constants.py:1-7` — `UNKNOWN_USER_LABEL`, `UNKNOWN_DEPARTMENT_LABEL`, `UNKNOWN_RISK_LABEL`, `UNKNOWN_CONTROL_LABEL`, `UNKNOWN_EXECUTION_LABEL`, `UNKNOWN_KRI_LABEL`, `UNKNOWN_VENDOR_LABEL`.
- `grouping.py:20-25` — `ISSUE_GROUP_*` sentinels and `ISSUE_SQL_GROUPS`.
- `grouping.py:28` — `def issue_context_values(...)`
- `grouping.py:44` — `def issue_group_entries(...)`
- `grouping.py:72` — `def count_distinct_issue_if(condition)`
- `grouping.py:76` — `async def issue_risk_context_subquery(...)`
- `grouping.py:129` — `def issue_vendor_context_subquery(...)`
- `grouping.py:147` — `async def load_issue_sql_groups(...)`
- `grouping.py:227` — `def issue_group_fallback_value(group_by)`
- `grouping.py:237` — `def issue_group_filter(...)`
- `linked_context.py:28` — `class IssueLinkedVisibility:`
- `linked_context.py:36` — `class IssueLinkedContextDefinition:`
- `linked_context.py:43` — `class IssueRegisterPlan:`
- `linked_context.py:49` — `class IssueSourceMutationPlan:`
- `linked_context.py:56` — `def label_or_fallback(value, fallback)`
- `linked_context.py:62` — `def link_display(...)`
- `linked_context.py:103` — `def source_type_value(...)`
- `linked_context.py:107` — `def link_matches_issue_source(...)`
- `linked_context.py:118` — `def issue_source_link(issue)`
- `linked_context.py:130` — `def link_risks(link)`
- `linked_context.py:156` — `def issue_link_candidate_ids(...)`
- `linked_context.py:187` — `async def build_issue_linked_visibility(...)`
- `projection.py:19` — `async def serialize_issue_summaries_for_actor(...)`
- `projection.py:42` — `async def serialize_issue_read_for_actor(...)`
- `serialization.py:47` — `def _active_exception(issue)`
- `serialization.py:63` — `def _serialize_issue_link(...)`
- `serialization.py:93` — `def _serialize_issue_source_link(...)`
- `serialization.py:110` — `def _issue_source_display(...)`
- `serialization.py:127` — `def _serialize_remediation(...)`
- `serialization.py:151` — `def _serialize_exception(...)`
- `serialization.py:177` — `def _serialize_risk_context(...)`
- `serialization.py:189` — `def _serialize_issue_risk_contexts(...)`
- `serialization.py:208` — `def _serialize_issue_vendor_contexts(...)`
- `serialization.py:240` — `async def _resolve_user_name(...)`
- `serialization.py:246` — `async def _serialize_exception_with_user_names(...)`
- `serialization.py:276` — `def _serialize_issue_summary(...)`
- `serialization.py:331` — `def _serialize_issue_read(...)`
- `source_mutation.py:16` — `class ResolvedIssueSource:`
- `source_mutation.py:24` — `def _source_type_value(source_type)`
- `source_mutation.py:28` — `async def resolve_vendor_department_and_access(...)`
- `source_mutation.py:56` — `async def issue_link_department_ids(...)`
- `source_mutation.py:100` — `async def resolve_contextual_issue_source(...)`
- `source_mutation.py:155` — `async def resolve_issue_source_metadata(...)`
- `source_mutation.py:207` — `async def ensure_issue_source_link(...)`
- `source_mutation.py:242` — `async def clear_issue_source_links(...)`

### 9.4 Internal patterns / **duplicates** (heavy audit attention)
- **`source_mutation.py:28-53` `resolve_vendor_department_and_access`** is duplicated verbatim in `_issue_workflow/source_validation.py:89-114`.
- **`source_mutation.py:56-97` `issue_link_department_ids`** is duplicated verbatim in `_issue_workflow/source_validation.py:45-86`.
- `serialization.py` makes heavy use of underscore-prefixed module-private functions; the package exposes `serialize_issue_read_for_actor` / `serialize_issue_summaries_for_actor` (in `projection.py`) as the public entry points.

### 9.5 Cross-imports (this package imports from)
- `grouping.py:18` — `from app.services._collection_contracts import CollectionGroupEntry`
- `projection.py:9` — `from app.services._issue_register.linked_context import build_issue_linked_visibility`
- `projection.py:10-13` — `from app.services._issue_register.serialization import (_serialize_issue_read, _serialize_issue_summary)`
- `projection.py:14` — `from app.services.authorization_capabilities import issue_capabilities`

### 9.6 Cross-imports (other code imports from this package)
- `_issue_workflow/source_validation.py:9` — imports `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata`.
- `_issue_workflow/serialization.py:8-13` — imports `serialize_issue_read_for_actor`, `_active_exception`, `_serialize_exception_with_user_names`.
- `_register_listings/issues.py:39` — imports grouping/serialization helpers.
- `backend/app/api/v1/endpoints/issues/_shared/serialization.py` consumes projection helpers.

### 9.7 Transaction commit sites
- **None** (all mutations performed via `db.flush()` only; commits happen in `_issue_workflow.execution`).

### 9.8 Capability/policy seams
- `linked_context.py:94-99` — `check_permission(current_user, "vendors", "read")` and `can_read_vendor`.
- `linked_context.py:187-198` — `build_issue_linked_visibility` calls `visible_risk_ids`, `visible_control_ids`, `visible_kri_ids`, `visible_vendor_ids`.
- `serialization.py:213` — `if current_user is None or not check_permission(current_user, "vendors", "read"):`

---

## 10. `backend/app/services/_control_execution/`

### 10.1 File inventory (7 modules + `__init__`)
- `__init__.py` (52 lines)
- `access.py` (90 lines)
- `capabilities.py` (3 lines, pure re-export shim)
- `link_governance.py` (208 lines)
- `link_policy.py` (106 lines)
- `monitoring.py` (12 lines)
- `projection.py` (229 lines)
- `workflow.py` (157 lines)
- `README.md`

### 10.2 Public exports (`__init__.py`)
- `_control_execution/__init__.py:3` — `from .capabilities import control_capabilities`
- `__init__.py:4-18` — `from .link_governance import (ControlExecutionListOutcome, ControlExecutionProjection, ControlRiskAccessDecision, ControlRiskLinkOutcome, create_control_execution_projection, create_control_risk_link, create_risk_control_link, delete_control_risk_link, delete_risk_control_link, list_control_execution_projections, list_control_risk_links, list_risk_control_links, read_control_execution_projection)`
- `__init__.py:19-27` — `from .workflow import (calculate_next_scheduled, control_is_executable, create_execution_record, linked_risk_names_for_visible_ids, load_control_for_execution, load_execution_with_context, visible_linked_risk_names)`
- `__init__.py:29-51` — `__all__` enumerates all of the above.

### 10.3 Top-level definitions
- `access.py:18` — `class ControlRiskAccessDecision:`
- `access.py:25` — `async def load_control_for_link(...)`
- `access.py:32` — `async def load_risk_for_link(...)`
- `access.py:39` — `async def assert_control_readable_for_link(...)`
- `access.py:50` — `async def assert_control_writable_for_link(...)`
- `access.py:55` — `async def risk_link_access_decision(...)`
- `access.py:75` — `async def assert_risk_writable_for_link(...)`
- `capabilities.py:1-3` — `from app.services.authorization_capabilities import control_capabilities; __all__ = ["control_capabilities"]` (full file)
- `link_governance.py:38` — `async def list_control_risk_links(...)`
- `link_governance.py:66` — `async def create_control_risk_link(...)`
- `link_governance.py:95` — `async def delete_control_risk_link(...)`
- `link_governance.py:115` — `async def list_risk_control_links(...)`
- `link_governance.py:145` — `async def create_risk_control_link(...)`
- `link_governance.py:174` — `async def delete_risk_control_link(...)`
- `link_governance.py:194-208` — module `__all__` list
- `link_policy.py:14` — `class ControlRiskLinkPlan:`
- `link_policy.py:22` — `async def load_link_for_control(...)`
- `link_policy.py:35` — `async def load_link_for_risk(...)`
- `link_policy.py:48` — `async def reload_link_for_control_response(...)`
- `link_policy.py:61` — `async def reload_link_for_risk_response(...)`
- `link_policy.py:74` — `async def assert_link_does_not_exist(...)`
- `link_policy.py:84` — `async def create_control_risk_link_outcome(...)` (commits inline)
- `link_policy.py:103` — `async def delete_control_risk_link_plan(...)` (commits inline)
- `monitoring.py:9` — `async def load_control_execution_monitoring_context(...)`
- `projection.py:32` — `class ControlExecutionProjection:`
- `projection.py:41` — `class ControlRiskLinkOutcome:`
- `projection.py:47` — `class ControlExecutionListOutcome:`
- `projection.py:54` — `def apply_execution_scope_and_filters(...)`
- `projection.py:81` — `def linked_risk_candidate_ids(...)`
- `projection.py:91` — `def control_owner_name(...)`
- `projection.py:97` — `def projection_for_execution(...)`
- `projection.py:111` — `async def list_control_execution_projections(...)`
- `projection.py:169` — `async def read_control_execution_projection(...)`
- `projection.py:184` — `async def create_control_execution_projection(...)`
- `projection.py:198` — `async def redact_links_for_visible_risks(...)`
- `projection.py:215` — `async def visible_risk_control_links(...)`
- `workflow.py:19` — `def calculate_next_scheduled(...)`
- `workflow.py:38` — `def control_is_executable(control)`
- `workflow.py:42` — `async def load_control_for_execution(...)`
- `workflow.py:73` — `async def create_execution_record(...)`
- `workflow.py:108` — `async def load_execution_with_context(...)`
- `workflow.py:127` — `async def visible_linked_risk_names(...)`
- `workflow.py:145` — `def linked_risk_names_for_visible_ids(...)`

### 10.4 Internal patterns / **shims**
- **`capabilities.py`** is a 3-line shim that re-exports `control_capabilities` from the global `authorization_capabilities` facade rather than from `_authorization_capabilities/controls.py`.
- `link_governance.py:38-191` and `link_policy.py:84-105` between them split the link-CRUD surface; both modules issue commits.

### 10.5 Cross-imports (this package imports from)
- `capabilities.py:1` — `from app.services.authorization_capabilities import control_capabilities`
- `link_governance.py:11-26` — `from app.services._control_execution.{access,link_policy,monitoring,projection} import (...)`
- `monitoring.py:6` — `from app.services._monitoring_response import MonitoringResponseContext, load_monitoring_response_context`
- `projection.py:23-29` — `from app.services._control_execution.workflow import (...)`, `from app.services._monitoring_response import MonitoringResponseContext`

### 10.6 Cross-imports (other code imports from this package)
- `_authorization_capabilities/controls.py:67` — local import `from app.services._control_execution.workflow import control_is_executable` (inside function body)
- `backend/app/api/v1/endpoints/{controls/executions,executions,controls/linking,risks/control_links}.py` consume the package facade.

### 10.7 Transaction commit sites
- `backend/app/services/_control_execution/workflow.py:103` — `await db.commit()` (inside `create_execution_record`)
- `backend/app/services/_control_execution/link_policy.py:96` — `await db.commit()` (inside `create_control_risk_link_outcome`)
- `backend/app/services/_control_execution/link_policy.py:105` — `await db.commit()` (inside `delete_control_risk_link_plan`)

### 10.8 Capability/policy seams
- `access.py:39-72` — `is_control_owner`, `check_department_access`, `is_risk_kri_reporting_owner`, `is_risk_control_owner`.
- `link_governance.py:121-124` — `check_permission(current_user, "controls", "read")`, `can_read_risk_id(...)`.
- `projection.py:122` — `visibility_clause = control_visibility_clause(current_user)`.

---

## 11. `backend/app/services/_notification_approval_helpers.py` (top-level module)

### 11.1 Inventory
- Single file, 102 lines.

### 11.2 Public exports (no `__all__`)
- `approval_action_label(approval)` — line 12
- `load_approval_notification_candidates(db)` — line 16
- `load_scenario_approval_notification_candidates(db, approval)` — line 35
- `can_user_view_approval_resource(db, user, approval)` — line 72
- `eligible_approval_notification_recipients(db, approval, *, exclude_user_id=None)` — line 82

### 11.3 Internal patterns
- Pure helper module (no commits, no scheduled work) used for notification recipient discovery.
- Lines 9 — `from app.services.approval_scenario_policy import RISK_OWNER_APPROVER_ROLE, scenario_roles_for_approval`.

### 11.4 Cross-imports
- Imported by: `backend/app/services/notification_service.py:13`.

### 11.5 Commit sites: **none**.

### 11.6 Capability/policy seams
- Line 4 — `from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id`.
- Lines 73-79 — branch on `approval.resource_type` to dispatch the right `can_read_*_id` predicate.

---

## 12. `backend/app/services/approval_scenario_policy.py` (top-level module)

### 12.1 Inventory
- Single file, 142 lines.

### 12.2 Public exports
- Lines 15-17 — constants `RISK_OWNER_APPROVER_ROLE = "risk_owner"`, `PRIVILEGED_APPROVER_ROLE_ORDER = ("risk_manager", "cro")`, `PRIVILEGED_APPROVER_ROLES`.
- Lines 18-27 — `TIER_CAPABLE_SCENARIO_KEYS = {"risk_delete", "risk_edit_priority", "control_delete", "kri_delete", "kri_edit", "control_edit", "kri_value_submit", "kri_history_correction"}`.
- Line 30 — `class ApprovalScenarioPolicy:` (frozen dataclass).
- Line 37 — `def normalize_approval_scenario_roles(...)`.
- Line 66 — `async def load_approval_scenario_policy(...)`.
- Line 97 — `def apply_approval_scenario_snapshot(approval, policy)`.
- Line 107 — `def scenario_roles_for_approval(approval)`.
- Line 114 — `def user_matches_approval_scenario_role(approval, user)` (returns `bool | None`; None for legacy approvals).
- Line 125 — `def scenario_allows_privileged_resolution(approval, user)`.
- Line 134 — `async def can_view_approval_resource(db, user, approval)`.

### 12.3 Internal patterns
- `can_view_approval_resource` (line 134) duplicates the logic in `_notification_approval_helpers.py:72` `can_user_view_approval_resource` — **two near-identical async helpers** with different names but the same body (branch on `approval.resource_type` → call `can_read_*_id`).

### 12.4 Cross-imports
- Importers (per Bash grep):
  - `backend/app/services/approval_execution_service.py:16`
  - `backend/app/services/_approval_execution/authorization.py:9`
  - `backend/app/services/_authorization_capabilities/approvals.py:6`
  - `backend/app/services/_entity_mutation_lifecycle/{approval_plans,archive_plans}.py`
  - `backend/app/services/_kri_history/approval_intake.py:24`
  - `backend/app/services/_kri_history/governance.py:216` (deferred)
  - `backend/app/services/_approval_queue/execution.py:11`
  - `backend/app/services/_notification_approval_helpers.py:9`
  - `backend/app/services/notification_visibility.py:21`
  - `backend/app/services/approval_queue_visibility.py:10`
  - `backend/app/api/v1/endpoints/approvals/detail.py:13`
  - `backend/app/api/v1/endpoints/riskhub/approval_scenarios.py:14`

### 12.5 Commit sites: **none**.

### 12.6 Capability/policy seams
- Lines 10-12 — `from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id`.
- Lines 119-122, 131 — role-name comparison against scenario snapshot.

---

## 13. `backend/app/services/approval_execution_service.py` (top-level module)

### 13.1 Inventory
- Single file, 250 lines.

### 13.2 Public exports
- Line 36 — `__all__ = ["EDITABLE_FIELDS", "approve_request_workflow", "cancel_request_workflow", "reject_request_workflow"]`.
- Line 39 — `async def approve_request_workflow(db, approval_id, current_user, resolution_notes)`.
- Line 67 — `async def reject_request_workflow(db, approval_id, current_user, resolution_notes)`.
- Line 107 — `async def cancel_request_workflow(db, approval_id, current_user)`.
- Lines 162, 186, 215, 241 — private helpers `_apply_approved_resolution`, `_apply_escalation_resolution`, `_assert_can_reject`, `_reload_approval`.

### 13.3 Internal patterns
- Acts as the public facade re-exporting `EDITABLE_FIELDS` from `_approval_execution.constants` (line 24) and dispatching workflows through `_approval_execution.{authorization,loading,logging,resolution,results,side_effects}` (lines 23-34).
- Each workflow uses `finalize_approval_resolution_plan(...)` from `_approval_execution.resolution` to wrap commit + outbox emission.

### 13.4 Cross-imports
- Importers: `backend/app/api/v1/endpoints/approvals/resolve.py` (lines 44, 76, 98).

### 13.5 Commit sites
- **None directly.** Commits happen inside `_approval_execution/resolution.py:88` via `finalize_approval_resolution_plan`.

### 13.6 Capability/policy seams
- Line 116 — `is_privileged = can_resolve_approvals(current_user)`.
- Lines 219-238 — `scenario_match = user_matches_approval_scenario_role(approval, current_user)`, `privileged_scenario_match = scenario_allows_privileged_resolution(approval, current_user)` and HTTPException 403 paths.

---

## 14. `backend/app/services/outbox/` (ADR-002)

### 14.1 File inventory (5 root modules + `handlers/` subpackage)
- `outbox/__init__.py` (20 lines) — re-exports `OUTBOX_BATCH_SIZE`, `OUTBOX_DISPATCH_INTERVAL_SECONDS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RECLAIM_AFTER`, `OutboxService`, `dispatch_pending_outbox_events`.
- `outbox/dispatcher.py` (111 lines)
- `outbox/errors.py` (28 lines): base `OutboxError`, `RetryableOutboxError`, `FatalOutboxError`, `OutboxPayloadError`, `OutboxDependencyError`, `OutboxDomainStateError`.
- `outbox/payloads.py` (122 lines): pydantic payload models + `OUTBOX_PAYLOAD_MODELS` registry.
- `outbox/registry.py` (35 lines): `OUTBOX_EVENT_HANDLERS` table.
- `outbox/store.py` (198 lines)
- `outbox/handlers/__init__.py` (2 lines)
- `outbox/handlers/common.py` (43 lines)
- `outbox/handlers/approvals.py` (80 lines)
- `outbox/handlers/issues.py` (116 lines)
- `outbox/handlers/questionnaires.py` (148 lines)
- `outbox/README.md`

### 14.2 Top-level definitions
- `store.py:14-17` — constants `OUTBOX_DISPATCH_INTERVAL_SECONDS = 5`, `OUTBOX_BATCH_SIZE = 50`, `OUTBOX_MAX_ATTEMPTS = 10`, `OUTBOX_RECLAIM_AFTER = timedelta(minutes=5)`.
- `store.py:18` — `NON_POSTGRES_OUTBOX_SINGLE_WORKER_ERROR = "Transactional outbox dispatch requires a single worker when the database dialect is not PostgreSQL"`.
- `store.py:23` — `_claimable_events_condition(now, reclaim_before)`.
- `store.py:32` — `class OutboxService:` with static methods:
  - `enqueue` (line 35)
  - `_claim_batch_postgres` (line 60)
  - `_claim_batch_fallback` (line 90)
  - `claim_batch` (line 119)
  - `mark_succeeded` (line 148)
  - `mark_dead_letter` (line 161)
  - `mark_retry` (line 174)
- `store.py:195` — `def ensure_outbox_runtime_supported(*, dialect_name, worker_count)`.
- `dispatcher.py:17` — `async def dispatch_pending_outbox_events(sessionmaker, *, batch_size=..., lock_owner="scheduler")`.
- `payloads.py:10` — `class OutboxPayloadModel(BaseModel):`
- `payloads.py:16-61` — payload classes `ApprovalRequestCreatedPayload`, `ApprovalRequestResolvedPayload`, `ApprovalRequestCancelledPayload`, `IssueAssignedPayload`, `IssueExceptionRequestedPayload`, `IssueExceptionApprovedPayload`, `QuestionnaireSentPayload`, `QuestionnaireSubmittedPayload`, `QuestionnaireClarificationRequestedPayload`.
- `payloads.py:64-74` — `OutboxPayload` union TypeAlias.
- `payloads.py:77-87` — `OUTBOX_PAYLOAD_MODELS` dict mapping event_type → payload class.
- `payloads.py:90` — `def get_outbox_payload_model(event_type)`.
- `payloads.py:94` — `def validate_outbox_payload(event_type, payload)`.
- `registry.py:22` — `OUTBOX_EVENT_HANDLERS: dict[str, OutboxHandler] = { "approval.request_created": handle_approval_request_created, "approval.request_resolved": handle_approval_request_resolved, ...}`.
- `handlers/common.py:16` — `OutboxHandler = Callable[[AsyncSession, Any], Awaitable[None]]`.
- `handlers/common.py:19` — `async def get_active_user_with_permissions(db, user_id)`.
- `handlers/common.py:28` — `async def run_notification_operation(awaitable)` (re-throws `OutboxDependencyError` on transient failures).
- `handlers/approvals.py:20-79` — `_load_approval`, `handle_approval_request_created`, `handle_approval_request_resolved`, `handle_approval_request_cancelled`.
- `handlers/issues.py:21-115` — `_create_issue_notification`, `_load_issue`, `handle_issue_assigned`, `handle_issue_exception_requested`, `handle_issue_exception_approved`.
- `handlers/questionnaires.py:29-147` — `_load_questionnaire`, `_load_clarification`, `_questionnaire_rm_cro_recipients`, `handle_questionnaire_sent`, `handle_questionnaire_submitted`, `handle_questionnaire_clarification_requested`.

### 14.3 Internal patterns
- `OutboxService.claim_batch` (`store.py:119`) chooses `_claim_batch_postgres` (uses `FOR UPDATE SKIP LOCKED`) when dialect is PostgreSQL, else `_claim_batch_fallback`.
- `dispatcher.py` opens **isolated** transactions (`async with sessionmaker() as ...: async with session.begin():`) per event — three different sessions for claim, dispatch, retry/dead-letter.

### 14.4 Cross-imports (this package imports from)
- `dispatcher.py:9-12` — siblings within `outbox` (errors, payloads, registry, store).
- `handlers/{approvals,issues,questionnaires}.py` — `from app.services.notification_service import NotificationService`.

### 14.5 Cross-imports (other code imports from this package)
- `backend/app/core/approval_helpers.py:12` — `from app.services.outbox import OutboxService`.
- `backend/app/core/scheduler.py:35` — `from app.services.outbox.store import ensure_outbox_runtime_supported`.
- `backend/app/core/scheduler_jobs.py:23` — `from app.services.outbox import OUTBOX_DISPATCH_INTERVAL_SECONDS, dispatch_pending_outbox_events`.
- `backend/app/services/_approval_execution/resolution.py:10` — `from app.services.outbox import OutboxService`.
- `backend/app/services/_risk_questionnaires/workflow.py:15` — `from app.services.outbox import OutboxService`.
- `backend/app/services/approval_execution_service.py:21` — `from app.services.outbox import OutboxService`.
- `backend/app/services/_issue_workflow/outbox.py:6` — `from app.services.outbox import OutboxService`.

### 14.6 Transaction commit sites
- **No `await db.commit()`** in store.py / dispatcher.py / handlers/. The `dispatcher.py` uses `async with session.begin():` blocks (lines 25, 39, 73, 85, 97) which auto-commit on success / rollback on exception. ADR-002 isolates these from caller-owned commits.

### 14.7 Capability/policy seams
- `handlers/issues.py:38, 79, 105` — `if recipient is None or not await can_read_issue_id(db, recipient, issue.id):`.
- `handlers/questionnaires.py:9, 102` — `from app.core.permissions import can_read_risk_id`, `if not await can_read_risk_id(...):`.

---

## 15. `backend/app/services/_authorization_capabilities/`

### 15.1 File inventory (10 modules + `__init__`)
- `__init__.py` (39 lines)
- `approvals.py` (78 lines)
- `common.py` (51 lines)
- `controls.py` (94 lines)
- `issues.py` (120 lines)
- `kris.py` (147 lines)
- `me.py` (75 lines)
- `perimeter.py` (34 lines)
- `riskhub_config.py` (60 lines)
- `risks.py` (104 lines)
- `vendors.py` (51 lines)
- `README.md`

### 15.2 Public exports (`__init__.py`)
- `__init__.py:3-20` — imports `Capabilities`, `has_capability`, `require_capability`, plus the per-resource builders `approval_capabilities`, `approval_scenario_capabilities`, `build_me_capabilities`, `can_view_loaded_vendor`, `can_view_vendor_link`, `control_capabilities`, `department_capabilities`, `issue_capabilities`, `kri_capabilities`, `risk_capabilities`, `risk_type_capabilities`, `role_capabilities`, `vendor_capabilities`.
- `__init__.py:22-39` — `__all__` enumerates them.

### 15.3 Top-level definitions
- `perimeter.py:10` — `class Capabilities:` with `for_user` (line 16) and `can(action, resource, *, instance=None)` (line 20).
- `perimeter.py:27` — `def has_capability(user, resource, action)`.
- `perimeter.py:31` — `def require_capability(user, resource, action)` — calls `forbid(...)` from `app.core.security`.
- `common.py:8` — `PENDING_APPROVAL_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)`.
- `common.py:11` — `async def pending_approvals(db, *, resource_type, resource_id)`.
- `common.py:27` — `async def pending_approvals_for_resources(db, *, resource_type, resource_ids)`.
- `common.py:49` — `def has_pending_action(approvals, action)`.
- `approvals.py:14` — `def approval_capabilities(*, approval, current_user)`.
- `controls.py:19` — `async def control_capabilities(...)` — uses lazy local import `from app.services._control_execution.workflow import control_is_executable` at line 67.
- `issues.py:20` — `def _is_active_issue_exception(exception, now)`.
- `issues.py:29` — `async def issue_capabilities(db, *, current_user, issue)`.
- `kris.py:20` — `def _is_kri_value_submission(approval)`.
- `kris.py:25` — `def _is_kri_history_correction(approval)`.
- `kris.py:30` — `def _is_kri_base_update(approval)`.
- `kris.py:38` — `async def kri_capabilities(...)`.
- `me.py:11-20` — `_RESOURCE_PERMISSION_CHECKS` tuple of resource/action pairs.
- `me.py:23, 29, 33` — `_role_name`, `_has_global_scope`, `build_me_capabilities`.
- `riskhub_config.py:20` — `IMMUTABLE_ROLE_NAMES = {RoleType.CRO, RoleType.ADMIN, RoleType.VIEWER}`.
- `riskhub_config.py:23` — `def role_capabilities(role, *, active_user_count=None)`.
- `riskhub_config.py:38` — `def department_capabilities(department, counts)`.
- `riskhub_config.py:49` — `def risk_type_capabilities(risk_type=None)`.
- `riskhub_config.py:58` — `def approval_scenario_capabilities()`.
- `risks.py:21` — `async def risk_capabilities(db, *, current_user, risk, ...)`.
- `vendors.py:10, 18, 26` — `can_view_vendor_link`, `can_view_loaded_vendor`, `vendor_capabilities`.

### 15.4 Internal patterns / shims
- The package is the source of truth; `backend/app/services/authorization_capabilities.py` is a 28-line facade re-exporting it (file has both `_authorization_capabilities` and the public-name module — see §16).
- `controls.py:67` — `from app.services._control_execution.workflow import control_is_executable` is a **deferred (in-function) import** that creates a circular-ready relationship between `_authorization_capabilities` and `_control_execution`.
- `riskhub_config.py:17` — `if TYPE_CHECKING:` import of `DepartmentDependencyCounts` from `_riskhub_config.departments` (avoids runtime cycle).

### 15.5 Cross-imports (this package imports from)
- `approvals.py:6` — `from app.services.approval_scenario_policy import (scenario_allows_privileged_resolution, user_matches_approval_scenario_role)`
- `kris.py:15` — `from app.services._kri_history.workflow import can_request_history_correction`
- `risks.py:16` — `from app.services._risk_questionnaires.policy import can_send_questionnaire`
- `riskhub_config.py:17` — TYPE_CHECKING `from app.services._riskhub_config.departments import DepartmentDependencyCounts`
- `controls.py:67` — function-local `from app.services._control_execution.workflow import control_is_executable`

### 15.6 Cross-imports (other code imports from this package)
- Direct `from app.services._authorization_capabilities import ...` callers include `backend/app/services/{kri_vendor_assignment,_riskhub_config/{roles,departments},_register_listings/{risks,kris,controls},_vendor_governance/links,_entity_mutation_lifecycle/archive_plans}.py`.
- Public facade `app.services.authorization_capabilities` (next section) is the primary import path for endpoints.

### 15.7 Transaction commit sites
- **None.** Pure read-only capability evaluation.

### 15.8 Capability/policy seams (entire package is one)
- Aggregates resource visibility predicates (`can_read_*_id`, `can_resolve_approvals`, `is_*_owner`) into Pydantic capability schemas (`RiskCapabilities`, `ControlCapabilities`, `KRICapabilities`, `IssueCapabilities`, `ApprovalRequestCapabilities`, `MeCapabilities`, `RoleHubCapabilities`, `DepartmentHubCapabilities`, `RiskTypeCapabilities`, `ApprovalScenarioCapabilities`, `VendorCapabilities`).

---

## 16. Top-level capability facade — `backend/app/services/authorization_capabilities.py`

- 28 lines.
- `authorization_capabilities.py:3-14` — re-exports `Capabilities`, `approval_capabilities`, `build_me_capabilities`, `can_view_loaded_vendor`, `can_view_vendor_link`, `control_capabilities`, `issue_capabilities`, `kri_capabilities`, `risk_capabilities`, `vendor_capabilities` from `app.services._authorization_capabilities`.
- Note: the facade omits `has_capability`, `require_capability`, `approval_scenario_capabilities`, `department_capabilities`, `risk_type_capabilities`, `role_capabilities` — those names are imported only via the underscore-package path. (This explains the divergent import patterns observed in §15.6.)

---

## 17. Master commit-site index (every `await *.commit()` outside `auth/`)

(`backend/app/services/_auth_session/*` is auth-exempt per ADR per task brief; listed here only for completeness.)

| File | Line | Function context |
|---|---|---|
| `backend/app/services/transaction_boundary.py` | 8 | session helper |
| `backend/app/services/ad_deprovision_service.py` | 61 | deprovision flow |
| `backend/app/services/ad_deprovision_service.py` | 92 | deprovision flow |
| `backend/app/services/_approval_execution/resolution.py` | 88 | `finalize_approval_resolution` |
| `backend/app/services/_risk_questionnaires/lifecycle.py` | 108, 139, 169, 218, 256 | questionnaire CRUD |
| `backend/app/services/_orphaned_items/flagging.py` | 226 | orphan flagging |
| `backend/app/services/_orphaned_items/resolution.py` | 260 | orphan resolution |
| `backend/app/services/_issue_workflow/execution.py` | 99, 131, 149, 171, 190, 212, 248, 272 | issue workflow steps |
| `backend/app/services/_entity_mutation_lifecycle/archive_plans.py` | 118, 191, 260 | risk/control/kri archive |
| `backend/app/services/_entity_mutation_lifecycle/direct_apply.py` | 111, 147, 187 | risk/control/kri update |
| `backend/app/services/_vendor_governance/lifecycle.py` | 46, 91, 117, 136 | vendor CRUD |
| `backend/app/services/_riskhub_config/lifecycle.py` | 103, 161 | config CRUD |
| `backend/app/services/_notification_inbox/lifecycle.py` | 105, 126, 137 | notification inbox |
| `backend/app/services/_control_execution/link_policy.py` | 96, 105 | risk-control link CRUD |
| `backend/app/services/_vendor_links/workflow.py` | 293, 329 | vendor-link CRUD |
| `backend/app/services/_control_execution/workflow.py` | 103 | execution record creation |
| `backend/app/services/_auth_session/sso_identity.py` | 37 | (auth-exempt) |
| `backend/app/services/_auth_session/refresh.py` | 121 | (auth-exempt) |
| `backend/app/services/_identity_access_lifecycle/execution.py` | 38, 69 | user mutations |
| `backend/app/services/_identity_access_lifecycle/profile_updates.py` | 85 | create_user_profile |
| `backend/app/services/_kri_history/direct_application.py` | 57, 77, 171 | KRI value direct apply |
| `backend/app/services/_kri_history/governance.py` | 246 | KRI history correction |
| `backend/app/services/_deadline_execution/executor.py` | 125 | deadline runner |

(Per Bash grep `grep -rn "await.*\.commit()" backend/app/services/`.)

---

## 18. Master cross-package import index (selected layering signals)

### 18.1 `_register_listings` reaches into private packages
- `_register_listings/issues.py:39` → `_issue_register` (grouping/serialization)
- `_register_listings/kris.py:31` → `_kri_history.value_application`
- `_register_listings/vendors.py:23` → `_vendor_governance.projection`

### 18.2 `_entity_mutation_lifecycle` reaches into private packages
- `_entity_mutation_lifecycle/direct_apply.py:21` → `_kri_history.value_application`
- `_entity_mutation_lifecycle/archive_plans.py:32` → `_authorization_capabilities`

### 18.3 `_approval_execution` reaches into private packages
- `_approval_execution/{kri_changes,kri_generic_edit,kri_history_correction,kri_value_submission}.py` → `_kri_history.governance`

### 18.4 `_authorization_capabilities` reaches into private packages
- `_authorization_capabilities/controls.py:67` → `_control_execution.workflow.control_is_executable` (function-local)
- `_authorization_capabilities/kris.py:15` → `_kri_history.workflow.can_request_history_correction`
- `_authorization_capabilities/risks.py:16` → `_risk_questionnaires.policy.can_send_questionnaire`

### 18.5 Reverse — top-level facades pull from private packages
- `authorization_capabilities.py:3` → `_authorization_capabilities`
- `kri_history_service.py:8-9` → `_kri_history.constants`, `_kri_history.service`
- `issue_workflow_service.py:1` → `_issue_workflow.service`

### 18.6 `_issue_workflow` ↔ `_issue_register` traversal
- `_issue_workflow/source_validation.py:9` → `_issue_register.source_mutation` (3 symbols)
- `_issue_workflow/serialization.py:8-13` → `_issue_register.serialization` (3 underscore-prefixed symbols including aliased re-export)
- `_issue_workflow/execution.py:49` re-imports its public facade `IssueWorkflowService` from `app.services.issue_workflow_service` (which re-exports from `_issue_workflow/service.py`). Self-referential layering.

---

## 19. Identified shims, aliases, and duplicate functions (raw observations)

| Site | Pattern |
|---|---|
| `_riskhub_config/__init__.py:3-41` | PEP-562 lazy facade via `_EXPORTS` + `__getattr__`. |
| `_issue_workflow/source_validation.py:117-120` | Module-private aliases `_ensure_owner_assignable`, `_issue_link_department_ids`, `_resolve_vendor_department_and_access`, `_validate_user_exists` to their public counterparts. |
| `_issue_workflow/loading.py:68-70` | `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404` aliases. |
| `_issue_workflow/serialization.py:18` | `active_exception = _active_exception` (re-bind from `_issue_register.serialization._active_exception`). |
| `_issue_workflow/serialization.py:41` | `_serialize_exception_with_user_names = serialize_exception_with_user_names` back-alias. |
| `_kri_history/value_application.py` | Whole-file alias module re-exporting `apply_kri_value_directly`, `run_best_effort_notification`, `visible_linked_vendors`. |
| `_kri_history/submission.py:9` | 13-line `_create_kri_submission_approval` wrapper. |
| `_kri_history/governance.py:113` | `record_kri_value_governance` is a thin delegator to `intake.record_kri_value_intake` (line 122). |
| `_kri_history/governance.py:187` | `_create_kri_history_correction_approval` thin wrapper around `approval_intake.create_kri_history_correction_approval`. |
| `_control_execution/capabilities.py:1-3` | 3-line file re-exporting `control_capabilities`. |
| `_approval_execution/kri_history_correction.py:23` and `_approval_execution/kri_value_submission.py:23` | **Duplicate** `_auto_reject_kri_approval` body. |
| `_issue_workflow/source_validation.py:89-114` and `_issue_register/source_mutation.py:28-53` | **Duplicate** `resolve_vendor_department_and_access`. |
| `_issue_workflow/source_validation.py:45-86` and `_issue_register/source_mutation.py:56-97` | **Duplicate** `issue_link_department_ids`. |
| `_entity_mutation_lifecycle/policy.py:70` and `_entity_mutation_lifecycle/policy.py:90` | Near-duplicate `assert_no_pending_delete` / `assert_no_existing_pending_delete_request` (same query, different exception). |
| `approval_scenario_policy.py:134 can_view_approval_resource` and `_notification_approval_helpers.py:72 can_user_view_approval_resource` | Duplicate body, different names. |
| `authorization_capabilities.py` | Public facade module re-exporting only 10 of the 16 names exposed by `_authorization_capabilities/__init__.py`. Direct callers split across both import paths. |

---

## 20. Inventory totals (mechanical)

- Total `*.py` files in target packages: **125** (`find ... -name "*.py" -type f | wc -l`).
- `await db.commit()` occurrences in `backend/app/services` (whole tree): **48 lines** (Bash grep above).
- Direct importers of `app.services.outbox`: 7 distinct modules (Bash grep §14.5).
- Direct importers of `app.services.approval_scenario_policy`: 13 distinct modules (Bash grep §12.4).

End of Phase 1 mapping. No verification, no opinions, no audit-finding cross-checks.
