# Backend `/api/v1/*` endpoint map (Phase 1 context load)

Date: 2026-05-09
Mode: read-only mapping; no opinions, no recommendations.
Scope: `/api/v1` aggregator, mount point, every endpoint module, special-focus
files called out by the audit (S8.5, A-N1, S1.4, S1.6, C-N1, S6.x, S4.x).

All quotes ≤15 words. Every claim cites `file:line`.

---

## 1. Mount point and aggregator

### Mount point

- `backend/app/main.py:279`: `app.include_router(api_router, prefix="/api/v1")`
  inside `register_routes(app, settings)`.
- `backend/app/main.py:13`: `from app.api.v1.router import api_router`.
- `backend/app/main.py:386`: `register_routes(app, settings)` invoked from
  `create_app(settings: Settings)`.

### Aggregator (`backend/app/api/v1/router.py`)

- `router.py:32`: `api_router = APIRouter()`.
- 28 `include_router(...)` calls (lines 34..60). Verbatim list of every
  inclusion (file:line `prefix=` `tags=`):

| Line | Module | Prefix | Tags |
| --- | --- | --- | --- |
| 34 | `health.router` | (none) | `["health"]` |
| 35 | `auth.router` | `/auth` | `["auth"]` |
| 36 | `users.router` | `/users` | `["users"]` |
| 37 | `access.router` | `/access` | `["access"]` |
| 38 | `controls.router` | `/controls` | `["controls"]` |
| 39 | `risks.router` | `/risks` | `["risks"]` |
| 40 | `issues.router` | (none) | `["issues"]` |
| 41 | `vendors.router` | `/vendors` | `["vendors"]` |
| 42 | `vendor_links.router` | (none) | `["vendor-links"]` |
| 43 | `vendor_reports.router` | (none) | `["vendor-reports"]` |
| 44 | `risk_questionnaires.risk_router` | (carries `/risks`) | `["questionnaires"]` |
| 45 | `dashboard.router` | `/dashboard` | `["dashboard"]` |
| 46 | `departments.router` | `/departments` | `["departments"]` |
| 47 | `reports.router` | `/reports` | `["reports"]` |
| 48 | `executions.router` | `/executions` | `["executions"]` |
| 49 | `kris.router` | (carries `/kris` from `kris/crud/list.py:23`) | (Tag set inside `kris/crud/list.py`) |
| 50 | `approvals.router` | `/approvals` | `["approvals"]` |
| 51 | `notifications.router` | `/notifications` | `["notifications"]` |
| 52 | `admin.router` | `/admin` | `["admin"]` |
| 53 | `directory.router` | (carries `/directory` from `directory.py:24`) | `["directory"]` |
| 54 | `orphaned_items.router` | `/orphaned-items` | `["governance"]` |
| 55 | `lookups.router` | `/lookups` | `["lookups"]` |
| 56 | `activity_log.router` | `/activity-log` | `["activity-log"]` |
| 57 | `riskhub.router` | `/riskhub` | `["riskhub"]` |
| 58 | `riskhub_questionnaires.router` | (carries `/riskhub/questionnaires` from line 14) | `["riskhub"]` |
| 59 | `preferences.router` | (carries `/preferences` from line 12) | `["preferences"]` |
| 60 | `risk_questionnaires.router` | (carries `/questionnaires`) | `["questionnaires"]` |

Quote: `router.py:32` `api_router = APIRouter()`.
Quote: `router.py:34` `api_router.include_router(health.router, tags=["health"])`.
Quote: `router.py:58` `api_router.include_router(riskhub_questionnaires.router)`.
Quote: `router.py:60` `api_router.include_router(risk_questionnaires.router, tags=["questionnaires"])`.

### Top-of-file imports (28 modules)

`router.py:3-30` — `from app.api.v1.endpoints import (access, activity_log,
admin, approvals, auth, controls, dashboard, departments, directory,
executions, health, issues, kris, lookups, notifications, orphaned_items,
preferences, reports, risk_questionnaires, riskhub, riskhub_questionnaires,
risks, users, vendor_links, vendor_reports, vendors,)`.

---

## 2. Endpoint module inventory and route mounts

Source: `grep -rn '^@router\.(get|post|put|patch|delete)|router = APIRouter'`
applied across `backend/app/api/v1/endpoints/` (sorted, 326 matched lines
including router declarations and decorators).

Top-level packages aggregate downstream routers. Every router declaration is
listed. Where a sub-package only re-mounts children, I show the `__init__.py`
line.

### 2.1 `health.py`

- `health.py:13` `router = APIRouter()`.
- `health.py:81` `@router.get("/livez", response_model=LivenessResponse)` →
  `GET /api/v1/livez`.
- `health.py:88` `@router.get("/readyz", response_model=ReadinessResponse)` →
  `GET /api/v1/readyz`.
- `health.py:101` `@router.get("/health", response_model=HealthResponse)` →
  `GET /api/v1/health`.
- Inline Pydantic models at `health.py:16-35` (`LivenessResponse`,
  `ReadinessResponse`, `HealthResponse`).
- Capability checks: none (probe endpoints; no auth dependency).
- `commit_service_transaction` calls: none.
- Route count: 3.

### 2.2 `auth/` package

- `auth/__init__.py:9` `router = APIRouter()`.
- `auth/__init__.py:10-17` includes: `config`, `csrf`, `password`, `me`,
  `refresh`, `logout`, `sso`, `demo`.
- `auth/__init__.py:5` re-exports `verify_entra_id_token` from
  `app.services.sso_token_service`.

Per-module routes:

| File | Line | Route | Capability/dep |
| --- | --- | --- | --- |
| `auth/config.py:84` | `GET /auth/config` | (none, public) |
| `auth/csrf.py:9` | `GET /auth/csrf` (204) | (none) |
| `auth/me.py:24` | `GET /auth/me` | `Depends(deps.get_current_user)` |
| `auth/me.py:56` | `GET /auth/me/capabilities` | `Depends(deps.get_current_user)` |
| `auth/refresh.py:58` | `POST /auth/refresh` | (cookie-based) |
| `auth/logout.py:57` | `POST /auth/logout` | `Depends(deps.get_current_user_optional)` |
| `auth/logout.py:108` | `POST /auth/logout-all` | `Depends(deps.get_current_user)` |
| `auth/password.py:51` | `POST /auth/login` | (form-based) |
| `auth/sso.py:40` | `POST /auth/sso/...` (challenge) | (cookie-based) |
| `auth/sso.py:75` | `POST /auth/sso/...` (exchange) | (cookie-based) |
| `auth/demo.py:71` | `POST /auth/demo-login` (`include_in_schema=False`) | debug only |
| `auth/demo.py:95` | `POST /auth/demo-login/{user_id}` (`include_in_schema=False`) | debug only |

Endpoint-local helpers:

- `auth/_shared.py` — `_sha256_trunc`, `_resolve_access_expires_delta`,
  `_build_token_response`, `_issue_refresh_session`,
  `_revoke_user_refresh_tokens`, `_invalidate_user_sessions`,
  `_resolve_safe_default_role` (lines 29-176).
- `auth/_request_protection.py` — `_forbidden`, `_normalize_origin`,
  `_allowed_origins`, `validate_request_origin`, `validate_csrf` (lines 15-51).
- `auth/_sso_helpers.py` — `_user_permission_load`, `_log_failed_sso`,
  `_verify_sso_identity`, `_sanitize_return_to`, `_challenge_response`,
  `_find_user_by_external_id`, `_find_user_by_email`,
  `_sync_sso_user_profile`, `_resolve_sso_user`, `_jit_provision_user`,
  `_consume_sso_challenge` (lines 24-313).

Endpoint commit calls (all in allowlist):

- `auth/_sso_helpers.py:48` `await db.commit()` — allowlist line 32-35.
- `auth/demo.py:67` `await db.commit()` — allowlist line 38-41.
- `auth/logout.py:101` `await db.commit()` — allowlist line 14-17.
- `auth/logout.py:132` `await db.commit()` — allowlist line 19-23.
- `auth/password.py:128` `await db.commit()` — allowlist line 26-29.
- `auth/password.py:161` `await db.commit()` — allowlist line 44-47.
- `auth/refresh.py:177` `await db.commit()` — allowlist line 8-11.
- `auth/sso.py:170` `await db.commit()` — allowlist line 2-5.

### 2.3 `users/` package

- `users/__init__.py:6-13` re-exports `get_password_hash` and includes
  routers: `crud` (root), `lookup`, `directory`, `org`, `mock_auth`, `detail`,
  `summary`.

Routes:

| File | Line | Route | Capability/dep |
| --- | --- | --- | --- |
| `users/crud.py:20` | `GET /users` | `Depends(deps.get_current_user)` (per file's auth gate) |
| `users/crud.py:59` | `POST /users` | (admin only via local helper) |
| `users/lookup.py:20` | `GET /users/roles` | (auth) |
| `users/lookup.py:31` | `GET /users/lookup` | (auth) |
| `users/directory.py:56` | `GET /users/directory` | (auth) |
| `users/org.py:16` | `GET /users/{user_id}/subordinates` | (auth) |
| `users/mock_auth.py:16` | `POST /users/mock-login/{user_id}` (debug) | (mock auth) |
| `users/detail.py:20` | `GET /users/{user_id}` | (auth) |
| `users/detail.py:51` | `PATCH /users/{user_id}` | (admin) |
| `users/summary.py:81` | `GET /users/me/shell-summary` | (auth) |

Local helpers:

- `users/_lifecycle.py:9-19` — `can_administer_user_lifecycle`,
  `require_admin_user_lifecycle`.
- `users/_visibility.py:9-34` — `build_visible_users_query`.

### 2.4 `access.py`

- `access.py:21` `router = APIRouter()`.
- Routes: `GET /access/users` (line 96), `GET /access/users/my-department`
  (line 129), `GET /access/roles` (line 169), `PATCH /access/users/{user_id}`
  (line 190).
- Local helpers: `_require_privileged` (line 23), `_can_manage_privileged_status`
  (line 34), `_require_access_user_write` (line 44), `_build_access_user_read`
  (line 58), `_build_role_with_permissions` (line 85).
- All routes use `Depends(deps.get_current_user)` then call privilege helpers
  inline.

### 2.5 `controls/` package — A-N1 / B-N1 / B-N2 area

- `controls/__init__.py:1-5` includes: `executions`, `linking`, plus
  `crud.router`.
- `controls/crud/__init__.py:1-13` includes: `archive`, `detail`, `restore`,
  `update`. Mounts these onto the root `list.router`.

Route map (mounted with `/controls` prefix from `router.py:38`):

| File | Line | Method+path | Capability dep |
| --- | --- | --- | --- |
| `crud/list.py:22` | `GET /controls` | `require_permission("controls", "read")` |
| `crud/create.py:21` | `POST /controls` | `require_permission("controls", "write")` |
| `crud/detail.py:18` | `GET /controls/{control_id}` | `require_permission("controls", "read")` |
| `crud/update.py:17` | `PATCH /controls/{control_id}` | `Depends(deps.get_current_user)` |
| `crud/archive.py:16` | `DELETE /controls/{control_id}` (202) | `Depends(deps.get_current_user)` |
| `crud/restore.py:20` | `POST /controls/{control_id}/restore` | `require_permission("controls", "delete")` |
| `executions.py:18` | `POST /controls/{control_id}/executions` | (in module) |
| `executions.py:34` | `GET /controls/{control_id}/executions` | (in module) |
| `linking.py:23` | `GET /controls/{control_id}/risks` | (in module) |
| `linking.py:34` | `POST /controls/{control_id}/risks` | (in module) |
| `linking.py:53` | `DELETE /controls/{control_id}/risks/{risk_id}` | (in module) |

Endpoint commit calls in this package:

- `controls/crud/create.py:61` `await commit_service_transaction(db)` — NOT
  in `_endpoint_commit_allowlist.toml`.
- `controls/crud/restore.py:64` `await commit_service_transaction(db)` — NOT
  in allowlist.

Local helpers:

- `controls/_helpers.py:10-86` — `_build_pending_changes` (line 10),
  `_first_high_risk_linked_risk` (line 25), `_apply_department_scoping`
  (line 41), `_apply_process_category_filters` (line 73).

### 2.6 `risks/` package — A-N1 / S1.4 / S1.6 special focus

- `risks/__init__.py:1-8` includes: `control_links`, `vendor_links`,
  `crud.router`. Re-exports `generate_risk_id_code` (line 3).
- `risks/crud/__init__.py:1-24` two-level compositor; includes `archive`,
  `detail`, `restore`, `update`, `create`, `list`. Re-exports
  `validate_risk_type` (line 5) and `delete_risk`, `get_risk`, `list_risks`,
  `restore_risk`, `update_risk`, `create_risk`.

Routes (mounted with `/risks` prefix from `router.py:39`):

| File | Line | Method+path | Capability dep |
| --- | --- | --- | --- |
| `crud/list.py:16` | `GET /risks` | `require_permission("risks", "read")` |
| `crud/create.py:24` | `POST /risks` | `require_permission("risks", "write")` |
| `crud/detail.py:18` | `GET /risks/{risk_id}` | `require_permission("risks", "read")` |
| `crud/update.py:17` | `PATCH /risks/{risk_id}` | `Depends(deps.get_current_user)` |
| `crud/archive.py:16` | `DELETE /risks/{risk_id}` (202) | `Depends(deps.get_current_user)` |
| `crud/restore.py:20` | `POST /risks/{risk_id}/restore` | `require_permission("risks", "delete")` |
| `control_links.py:20` | `GET /risks/{risk_id}/controls` | `require_permission("risks", "read")` |
| `control_links.py:31` | `POST /risks/{risk_id}/controls` | `require_permission("risks", "write")` |
| `control_links.py:50` | `DELETE /risks/{risk_id}/controls/{control_id}` | `require_permission("risks", "write")` |
| `vendor_links.py:15` | `GET /risks/{risk_id}/vendors` | `require_permission("risks", "read")` |

Endpoint commit calls in this package:

- `risks/crud/create.py:84` `await commit_service_transaction(db)` — NOT in
  allowlist (in retry loop, line 47-114).
- `risks/crud/restore.py:62` `await commit_service_transaction(db)` — NOT in
  allowlist.

Local helpers / facades:

- `risks/crud/_shared.py:8-20` — `validate_risk_type` raises
  `HTTPException(400, ...)` on unknown risk_type. Quote line 17-19:
  `raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown risk type '{risk_type_code}'...")`.
- `risks/id_generation.py:7-42` — `generate_risk_id_code(db, process)`.

Service-side counterpart of `validate_risk_type` (referenced by audit S1.4):

- `app/services/_entity_mutation_lifecycle/policy.py:29-39` — separate
  function with same name (`validate_risk_type`) raising `ValidationError`
  per audit (audit text states this; not directly read here).

### 2.7 `issues/` package — S4.x special focus

- `issues/__init__.py:1-15` builds local router from sub-routers: `lookups`,
  `crud`, `links`, `workflow`, `exceptions`. NO prefix added at this layer
  (line 9: `router = APIRouter()`).
- `issues/crud/__init__.py:1-13` re-mounts `list`, `create`, `contextual`,
  `detail`, `update`.

Routes:

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `crud/list.py:18` | `GET /issues` | `require_permission("issues", "read")` |
| `crud/create.py:28` | `POST /issues` | `require_permission("issues", "write")` |
| `crud/contextual.py:27` | `POST /issues/contextual` | `require_permission("issues", "write")` |
| `crud/detail.py:15` | `GET /issues/{issue_id}` | `require_permission("issues", "read")` |
| `crud/update.py:13` | `PATCH /issues/{issue_id}` | `require_permission("issues", "write")` |
| `links.py:73` | `POST /issues/{issue_id}/links` | `require_permission("issues", "write")` |
| `links.py:121` | `DELETE /issues/{issue_id}/links/{link_id}` | `require_permission("issues", "write")` |
| `workflow.py:24` | `POST /issues/{issue_id}/assign` | `require_permission("issues", "write")` |
| `workflow.py:40` | `POST /issues/{issue_id}/start-remediation` | `require_permission("issues", "write")` |
| `workflow.py:56` | `POST /issues/{issue_id}/update-progress` | `require_permission("issues", "write")` |
| `workflow.py:72` | `POST /issues/{issue_id}/close` | `require_permission("issues", "write")` |
| `exceptions.py:22` | `POST /issues/{issue_id}/request-exception` | `require_permission("issues", "write")` |
| `exceptions.py:40` | `POST /issues/{issue_id}/approve-exception` | `require_permission("issues", "approve")` |
| `exceptions.py:56` | `POST /issues/{issue_id}/revoke-exception` | `require_permission("issues", "approve")` |
| `lookups.py:17` | `GET /issues/lookups/departments` | `require_permission("issues", "write")` |
| `lookups.py:36` | `GET /issues/lookups/owners` | `require_permission("issues", "write")` |

Endpoint commit calls:

- `issues/crud/contextual.py:94` `await commit_service_transaction(db)` —
  NOT in allowlist.
- `issues/crud/create.py:106` `await commit_service_transaction(db)` — NOT
  in allowlist.
- `issues/links.py:116` `await commit_service_transaction(db)` — NOT in
  allowlist.
- `issues/links.py:143` `await commit_service_transaction(db)` — NOT in
  allowlist.

`_shared/` directory — collection of helpers under
`backend/app/api/v1/endpoints/issues/_shared/`:

- `_shared/__init__.py` (79 lines) — re-export aggregator. Quote
  `_shared/__init__.py:1-9` `from .constants import (UNKNOWN_CONTROL_LABEL...)`.
  `__all__` (line 42-79) lists 33 names.
- `_shared/constants.py` (19 lines) — RE-EXPORT shim of
  `app.services._issue_register.constants`. Quote `constants.py:1-2`
  `from app.services._issue_register.constants import (UNKNOWN_CONTROL_LABEL,...)`.
- `_shared/source.py` (17 lines) — RE-EXPORT shim of
  `app.services._issue_register.source_mutation`. Quote `source.py:1-2`
  `"""Compatibility Adapter for issue source-link mutation helpers."""`.
- `_shared/serialization.py` (43 lines) — RE-EXPORT shim importing from
  `app.services._issue_register.linked_context` and
  `app.services._issue_register.serialization`. Quote `serialization.py:1`
  `from app.services._issue_register.linked_context import (IssueLinkedVisibility,...)`.
- `_shared/loading.py` (65 lines) — REAL helpers:
  `_get_issue_with_relations`, `_get_readable_issue_or_404`,
  `_get_writable_issue_or_404` (lines 22-65).
- `_shared/notifications.py` (103 lines) — REAL helpers:
  `_get_active_user_with_permissions`, `_notify_issue_assigned`,
  `_notify_exception_requested`, `_notify_exception_approved` (lines 14-103).
- `_shared/validation.py` (37 lines) — REAL helpers:
  `_validate_user_exists` (line 11), `_ensure_owner_assignable` (line 19).
- `_shared/links.py` (80 lines) — REAL helpers:
  `_resolve_vendor_department_and_access` (line 11),
  `_issue_link_department_ids` (line 39).

### 2.8 `kris/` package

- `kris/__init__.py:1-6` includes `history` plus `crud.router`.
- `kris/crud/__init__.py:1-31` includes `archive`, `breaches`, `detail`,
  `due_soon`, `overdue`, `restore`, `update`. Mounted via
  `kris/crud/list.py:23` `router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])`.

Routes (effective prefix `/kris`):

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `crud/list.py:25` | `GET /kris` | `require_permission("risks", "read")` |
| `crud/create.py:26` | `POST /kris` | `require_permission("risks", "write")` |
| `crud/detail.py:20` | `GET /kris/{kri_id}` | `require_permission("risks", "read")` (file-local) |
| `crud/update.py:17` | `PUT /kris/{kri_id}` | `require_permission("risks", "write")` |
| `crud/archive.py:16` | `DELETE /kris/{kri_id}` (202) | `Depends(deps.get_current_user)` |
| `crud/restore.py:22` | `POST /kris/{kri_id}/restore` | `require_permission("risks", "delete")` |
| `crud/breaches.py:23` | `GET /kris/breaches` | (file-local) |
| `crud/due_soon.py:14` | `GET /kris/due-soon` | (file-local) |
| `crud/overdue.py:14` | `GET /kris/overdue` | (file-local) |
| `history.py:29` | `POST /kris/{kri_id}/values` | `Depends(deps.get_current_user)` |
| `history.py:51` | `GET /kris/{kri_id}/history` | `require_permission("risks", "read")` |
| `history.py:85` | `PATCH /kris/{kri_id}/history/{entry_id}` | `require_permission("risks", "write")` |

Endpoint commit calls:

- `kris/crud/create.py:74` `await commit_service_transaction(db)` (inside
  try/except) — NOT in allowlist.
- `kris/crud/restore.py:63` `await commit_service_transaction(db)` — NOT in
  allowlist.

Local helpers/shims:

- `kris/access.py` — REAL helpers `kri_read_scope_clause` (line 15),
  `can_create_kri_for_any_parent_risk` (line 20).
- `kris/linked_vendors.py` (5 lines, line 1-6) — RE-EXPORT shim of
  `app.services._kri_history.value_application.visible_linked_vendors`.
  Quote `linked_vendors.py:3`
  `from app.services._kri_history.value_application import visible_linked_vendors`.

### 2.9 `vendors/` package

- `vendors/__init__.py:1-6` includes `lifecycle`, plus `crud.router`.

Routes (mounted with `/vendors`):

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `crud.py:31` | `GET /vendors` | `require_permission("vendors", "read")` |
| `crud.py:90` | `POST /vendors` | `require_permission("vendors", "write")` |
| `crud.py:99` | `GET /vendors/{vendor_id}` | `require_permission("vendors", "read")` |
| `crud.py:108` | `PATCH /vendors/{vendor_id}` | `Depends(deps.get_current_user)` |
| `lifecycle.py:15` | `DELETE /vendors/{vendor_id}` | `Depends(deps.get_current_user)` |
| `lifecycle.py:25` | `POST /vendors/{vendor_id}/restore` | `Depends(deps.get_current_user)` |

Local helpers:

- `vendors/_shared.py:10-16` — `_get_vendor_with_deps`.

### 2.10 `vendor_links.py` (top-level module)

- `vendor_links.py:25` `router = APIRouter()`.
- 9 routes (lines 28, 37, 53, 70, 79, 95, 112, 121, 137):
  `GET/POST/DELETE /vendors/{vendor_id}/linked-{risks,controls,kris}` and
  `{...}/linked-kris/{kri_id}` etc.
- All routes use `Depends(deps.get_current_user)` (lines 32, 42, 58, 74, 84,
  100, 116, 126, 142).

### 2.11 `vendor_link_helpers.py`

- 107 lines. Helpers:
  - `vendor_link_helpers.py:14-15` — `VendorLink`, `VendorLinkModel`,
    `VendorLinkField` typealiases.
  - `vendor_link_helpers.py:19` — `get_vendor`.
  - `vendor_link_helpers.py:24` — `require_vendor_access`.
  - `vendor_link_helpers.py:55` — `get_existing_link`.
  - `vendor_link_helpers.py:71` — `ensure_link_absent`.
  - `vendor_link_helpers.py:82` — `create_vendor_link` (calls
    `commit_service_transaction(db)` at line 91).
  - `vendor_link_helpers.py:95` — `delete_vendor_link` (calls
    `commit_service_transaction(db)` at line 107).
- Endpoint commit calls (helpers, not routes): line 91, line 107 — NOT in
  `_endpoint_commit_allowlist.toml`. (Allowlist scope is `endpoints/auth/*`.)
- No `@router.*` decorations in this file.

### 2.12 `vendor_reports.py`

- `vendor_reports.py:28` `router = APIRouter()`.
- Routes (mounted at root, prefix in path strings):
  - `GET /vendor-reports/capabilities` (line 122).
  - `GET /vendor-reports/annual` (line 129).
  - `GET /vendor-reports/dora-register` (line 155).
- Capabilities: line 124 `Depends(deps.get_current_user)`; lines 135 and 160
  `Depends(require_permission("reports", "read"))`.
- Local helpers: `_require_vendor_report_role` (line 31),
  `_annual_report_rows` (line 36), `_dora_register_rows` (line 76).

### 2.13 `dashboard/` package

- `dashboard/__init__.py:5-26` includes 9 sub-routers (`committee`, `controls`,
  `departments`, `issues_metrics`, `kris`, `overview`, `quarterly`, `risks`,
  `summary`).

Routes (mounted with `/dashboard` prefix):

| File | Line | Method+path |
| --- | --- | --- |
| `committee.py:13` | `GET /dashboard/committee-summary` |
| `controls.py:22` | `GET /dashboard/control-trends` |
| `departments.py:18` | `GET /dashboard/departments` |
| `issues_metrics.py:59` | `GET /dashboard/issues-summary` |
| `issues_metrics.py:94` | `GET /dashboard/issues-aging` |
| `issues_metrics.py:126` | `GET /dashboard/issues-by-severity` |
| `kris.py:22` | `GET /dashboard/kri-breach-trends` |
| `overview.py:33` | `GET /dashboard/overview` |
| `quarterly.py:18` | `GET /dashboard/quarterly-comparison` |
| `quarterly.py:47` | `GET /dashboard/available-periods` |
| `risks.py:25` | `GET /dashboard/risk-distribution` |
| `risks.py:84` | `GET /dashboard/risks-by-cell` |
| `risks.py:154` | `GET /dashboard/risk-trends` |
| `summary.py:15` | `GET /dashboard/summary` |

Local helpers:

- `dashboard/_shared.py:7-18` — `month_period_expr`, `week_period_expr`.

### 2.14 `departments/` package

- `departments/__init__.py` — composes `controls`, `detail`, `kris`, `list`,
  `risks` (mounted with `/departments` prefix).
- Route map:
  - `list.py:25` `GET /departments` (`require_permission("departments", "read")`).
  - `detail.py:25` `GET /departments/{department_id}`.
  - `controls.py:26` `GET /departments/{department_id}/controls`.
  - `kris.py:25` `GET /departments/{department_id}/kris`.
  - `risks.py:22` `GET /departments/{department_id}/risks`.
- Local helpers under `departments/_shared.py` (not detailed; routing-only).

### 2.15 `executions.py`

- `executions.py:24` `router = APIRouter()`.
- Routes (mounted with `/executions` prefix):
  - `GET /executions` (line 40), `require_business_permission("controls", "read")`.
  - `POST /executions` (line 74), `require_permission("controls", "execute")`.
  - `GET /executions/{id}` (line 93), `require_business_permission("controls", "read")`.
- Local helper: `_execution_to_schema` (line 27).

### 2.16 `approvals/` package — C-N1 / S6.x special focus

- `approvals/__init__.py:1-9` includes `detail`, `resolve`, `queue`. Quote
  `__init__.py:4-7` `from .queue import router`, `router.include_router(resolve.router)`,
  `router.include_router(detail.router)`.
- `_shared.py` (61 lines) — REAL helpers:
  - `_get_approval_department_id` (line 17).
  - `_build_approval_read` (line 34).
  - `logger` (line 14, used by `resolve.py`).
- `_delete_authorization.py` (81 lines) — REAL helpers:
  - `_raise_missing_permission` (line 13).
  - `assert_can_request_delete_risk` (line 20).
  - `assert_can_request_delete_control` (line 41).
  - `assert_can_request_delete_kri` (line 59).
- Service-side counterpart for `_delete_authorization`:
  `app/services/_entity_mutation_lifecycle/archive_plans.py:38, 56, 72` —
  three functions with identical names (`assert_can_request_delete_risk`
  etc.). Quotes (from grep above):
  - `archive_plans.py:38` `async def assert_can_request_delete_risk(`.
  - `archive_plans.py:56` `async def assert_can_request_delete_control(`.
  - `archive_plans.py:72` `async def assert_can_request_delete_kri(`.
- Importers of the service version: `archive_plans.py` itself uses these at
  lines 102, 178, 247 (`risk = await assert_can_request_delete_risk(...)`).
  `app/services/_approval_queue/delete_intake.py:15-17` imports the
  endpoint-side `_delete_authorization` (`from
  app.api.v1.endpoints.approvals._delete_authorization import (...)`), then
  calls them at lines 31, 33, 34, 44, 61, 82.

Routes (with `/approvals` prefix from `router.py:50`):

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `queue.py:26` | `POST /approvals` | `Depends(deps.get_current_user)` |
| `queue.py:39` | `GET /approvals` | `Depends(deps.get_current_user)` |
| `resolve.py:29` | `POST /approvals/{approval_id}/approve` | `Depends(deps.get_current_user)` |
| `resolve.py:64` | `POST /approvals/{approval_id}/reject` | `Depends(deps.get_current_user)` |
| `resolve.py:88` | `POST /approvals/{approval_id}/cancel` | `Depends(deps.get_current_user)` |
| `resolve.py:105` | `GET /approvals/pending/count` | `Depends(deps.get_current_user)` |
| `resolve.py:124` | `GET /approvals/my-approvals` | `Depends(deps.get_current_user)` |
| `detail.py:20` | `GET /approvals/{approval_id}` | `Depends(deps.get_current_user)` |

Endpoint commit calls in this package: none.

### 2.17 `notifications.py`

- `notifications.py:26` `router = APIRouter()`.
- 7 routes (mounted with `/notifications`): line 29 `GET ""`, 59 `GET /unread/count`,
  70 `GET /preferences`, 78 `PUT /preferences`, 89 `POST /{notification_id}/read`,
  104 `POST /read-all`, 115 `POST /trigger-kri-check`.
- All depend on `Depends(deps.get_current_user)`.
- Trigger-kri-check (line 115) does an inline `can_resolve_approvals` check
  (line 127).

### 2.18 `admin/` package

- `admin/__init__.py:5-19` includes `capabilities`, `console`, `directory_sync`,
  `docs`, `log_config`, `orphans`, `snapshots`, `structured_logs`. Re-exports
  `require_platform_admin` (line 8).
- `admin/_deps.py:10-19` — `require_platform_admin` (FastAPI dep).

Routes (mounted with `/admin` prefix):

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `capabilities.py:12` | `GET /admin/capabilities` | (admin dep) |
| `console.py:36` | `GET /admin/health` | `require_platform_admin` |
| `console.py:49` | `GET /admin/jobs/status` | `require_platform_admin` |
| `console.py:58` | `GET /admin/outbox/status` | `require_platform_admin` |
| `console.py:67` | `GET /admin/stats` | `require_platform_admin` |
| `console.py:79` | `GET /admin/logs` | `require_platform_admin` |
| `console.py:124` | `GET /admin/sessions` | `require_platform_admin` |
| `console.py:149` | `POST /admin/sessions/{user_id}/revoke` | `require_platform_admin` |
| `directory_sync.py:23` | `POST /admin/directory/check-user/{user_id}` | (admin) |
| `directory_sync.py:44` | `POST /admin/directory/check-all` | (admin) |
| `directory_sync.py:61` | `POST /admin/directory/break-glass-enable/{user_id}` | (admin) |
| `docs.py:211` | `GET /admin/docs` | `Depends(get_current_user)` |
| `log_config.py:23` | `GET /admin/logs/config` | (admin) |
| `log_config.py:45` | `POST /admin/logs/config` | (admin) |
| `orphans.py:19` | `GET /admin/orphan-stats` | (admin) |
| `orphans.py:57` | `POST /admin/fix-orphans` | (admin) |
| `snapshots.py:31` | `POST /admin/snapshots/capture` | (admin) |
| `snapshots.py:58` | `GET /admin/snapshots` | (admin) |
| `snapshots.py:93` | `GET /admin/snapshots/{quarter}` | (admin) |
| `structured_logs.py:90` | `GET /admin/logs/recent` | (admin) |
| `structured_logs.py:112` | `GET /admin/logs/audit` | (admin) |

Endpoint commit calls in this package:

- `admin/console.py:163` `await commit_service_transaction(db)` — NOT in
  allowlist (admin-flow commit, allowlist only covers `auth/`).
- `admin/directory_sync.py:98` `await commit_service_transaction(db)` — NOT
  in allowlist.
- `admin/log_config.py:126` `await commit_service_transaction(db)` — NOT in
  allowlist.
- `admin/snapshots.py:53` `await commit_service_transaction(db)` — NOT in
  allowlist.

### 2.19 `directory.py`

- `directory.py:24` `router = APIRouter(prefix="/directory")`.
- Routes:
  - `GET /directory/users/search` (line 41).
  - `GET /directory/users/{oid}` (line 59).
  - `POST /directory/users/{oid}/import` (line 77).
- Local helper: `_require_directory_admin` (line 27), `_provider_or_503`
  (line 34).

### 2.20 `orphaned_items.py`

- `orphaned_items.py:29` `router = APIRouter()`.
- Routes (with `/orphaned-items` prefix):
  - `GET /orphaned-items/` (line 55).
  - `POST /orphaned-items/scan` (line 79).
  - `GET /orphaned-items/overview` (line 101).
  - `GET /orphaned-items/stats` (line 136).
  - `GET /orphaned-items/{orphan_id}` (line 151).
  - `POST /orphaned-items/{orphan_id}/resolve` (line 171).
- Local helpers: `_get_latest_orphan_scan` (line 33),
  `_run_manual_orphan_scan` (line 44), `_require_governance_operator`
  (line 48).

### 2.21 `lookups.py`

- `lookups.py:10` `router = APIRouter()`.
- Route: `GET /lookups/risk-filters` (line 13), dep
  `require_permission("risks", "read")` (line 16).

### 2.22 `activity_log.py`

- `activity_log.py:20` `router = APIRouter()`.
- Routes (with `/activity-log` prefix):
  - `GET /activity-log` (line 23).
  - `GET /activity-log/entity-types` (line 71).
  - `GET /activity-log/actions` (line 85).
- Dep: `require_business_permission("activity_log", "read", ...)` on all 3.

### 2.23 `riskhub/` package — CRO config endpoints

- `riskhub/__init__.py:7-25` includes 8 sub-routers and re-exports
  `_ensure_total_assets_value_config`, `get_cro_user`, `require_cro` from
  `_shared`.
- `_shared.py:10-23` — `_ensure_total_assets_value_config`, `require_cro`
  (line 14), `get_cro_user` (line 21).

Routes (mounted with `/riskhub` prefix from `router.py:57`):

| File | Line | Method+path |
| --- | --- | --- |
| `risk_types.py:57` | `GET /riskhub/risk-types` |
| `risk_types.py:84` | `POST /riskhub/risk-types` |
| `risk_types.py:135` | `PATCH /riskhub/risk-types/{id}` |
| `risk_types.py:204` | `DELETE /riskhub/risk-types/{id}` |
| `risk_types.py:257` | `POST /riskhub/risk-types/{id}/restore` |
| `capabilities.py:11` | `GET /riskhub/capabilities` |
| `global_config.py:20` | `GET /riskhub/config` |
| `global_config.py:33` | `GET /riskhub/config/{category}` |
| `global_config.py:47` | `PATCH /riskhub/config/{key}` |
| `approval_scenarios.py:38` | `GET /riskhub/approval-scenarios` |
| `approval_scenarios.py:53` | `PATCH /riskhub/approval-scenarios/{key}` |
| `public_config.py:17` | `GET /riskhub/public-config/{key}` |
| `public_config.py:50` | `GET /riskhub/public-risk-types` |
| `permissions.py:14` | `GET /riskhub/permissions` |
| `roles.py:29` | `GET /riskhub/roles` |
| `roles.py:59` | `POST /riskhub/roles` |
| `roles.py:113` | `PATCH /riskhub/roles/{id}` |
| `roles.py:178` | `DELETE /riskhub/roles/{id}` |
| `roles.py:225` | `POST /riskhub/roles/{id}/restore` |
| `departments.py:31` | `GET /riskhub/departments` |
| `departments.py:51` | `POST /riskhub/departments` |
| `departments.py:98` | `PATCH /riskhub/departments/{id}` |
| `departments.py:151` | `DELETE /riskhub/departments/{id}` |
| `departments.py:202` | `POST /riskhub/departments/{id}/restore` |

### 2.24 `riskhub_questionnaires.py` — S8.5 special focus

- `riskhub_questionnaires.py:14`
  `router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])`.
- Single route: `riskhub_questionnaires.py:37`
  `@router.post("/batch-send", response_model=BatchSendResponse)` →
  `POST /api/v1/riskhub/questionnaires/batch-send`.
- Endpoint function: `batch_send_questionnaires` (line 38), depends on
  `Depends(get_db)` and `Depends(get_cro_user)` (lines 40-41).
- Inline Pydantic models defined locally:
  - `RiskFilters` (line 17).
  - `BatchSendRequest` (line 24).
  - `BatchSendResponse` (line 30).
- Endpoint commit: line 89 `await commit_service_transaction(db)` — NOT in
  allowlist.
- Service call: `send_questionnaire_for_risk` (imported line 11; called
  inside `db.begin_nested()` block at line 77).

Audit referenced "0 routes (file is dead)" at audit `2026-05-09-deepening-audit.md:1327`.
Live mount status verified:

- `router.py:24` `riskhub_questionnaires` import.
- `router.py:58`
  `api_router.include_router(riskhub_questionnaires.router)` — mounted into
  the API surface (no `/api/v1` prefix here; `/api/v1` added by `main.py:279`,
  combined with the router's own prefix `/riskhub/questionnaires`).

Frontend caller (the route is consumed by the SPA):

- `frontend/src/services/riskHubApi.ts:308-310`
  `batchSendQuestionnaires: (data: BatchSendQuestionnairesPayload) =>
  apiClient.post('/riskhub/questionnaires/batch-send', data, ...)`.
- `frontend/src/components/riskhub/riskQuestionnairePanelState.ts:170`
  `const response = await riskHubApi.batchSendQuestionnaires(payload);`.
- `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:24`
  `const canBatchSend = riskHubCapabilityEnabled(riskHubCapabilities?.questionnaires, 'can_batch_send');`.
- `frontend/src/services/api/schemas/workflow.ts:285`
  `export const batchSendResponseSchema = passthroughObject({...});`.
- `frontend/src/services/api/schemas/riskHub.ts:147`
  `export const batchSendQuestionnairesResponseSchema = batchSendResponseSchema;`.

Backend test file:

- `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py` (file exists).
- Documented in `.planning/codebase/TESTING.md:70` (`Backend questionnaire
  workflow: ... test_riskhub_questionnaires.py`).
- Documented in `.planning/phases/14-risk-assessments/14-06-PLAN.md:13-15`
  (lists module + tests).

### 2.25 `risk_questionnaires/` package

- `risk_questionnaires/__init__.py:7-13` declares two routers: `router` (line
  7, `prefix="/questionnaires"`) and `risk_router` (line 8, `prefix="/risks"`).
  Quote: `__init__.py:7` `router = APIRouter(prefix="/questionnaires")`.
- `risk_router.include_router(risk_routes.router)` (line 10).
- `router.include_router(inbox.router, questionnaire.router, clarifications.router)`
  (lines 11-13).
- Mount points in aggregator:
  - `router.py:44` mounts `risk_questionnaires.risk_router` (no extra prefix).
  - `router.py:60` mounts `risk_questionnaires.router` (no extra prefix).

Routes:

| File | Line | Method+path | Dep |
| --- | --- | --- | --- |
| `risk_routes.py:26` | `GET /risks/{risk_id}/questionnaires` | `require_permission("risks", "read")` |
| `risk_routes.py:44` | `POST /risks/{risk_id}/questionnaires/send` | `require_permission("risks", "read")` |
| `inbox.py:17` | `GET /questionnaires/inbox` | `require_permission("risks", "read")` |
| `questionnaire.py:30` | `GET /questionnaires/{questionnaire_id}` | `require_permission("risks", "read")` |
| `questionnaire.py:50` | `POST /questionnaires/{questionnaire_id}/open` | `require_permission("risks", "read")` |
| `questionnaire.py:75` | `PATCH /questionnaires/{questionnaire_id}/draft` | `require_permission("risks", "read")` |
| `questionnaire.py:95` | `POST /questionnaires/{questionnaire_id}/submit` | `require_permission("risks", "read")` |
| `clarifications.py:26` | `POST /questionnaires/{questionnaire_id}/clarifications` | `require_permission("risks", "read")` |
| `clarifications.py:44` | `GET /questionnaires/{questionnaire_id}/clarifications` | `require_permission("risks", "read")` |
| `clarifications.py:65` | `POST /questionnaires/{questionnaire_id}/clarifications/{clarification_id}/respond` | `require_permission("risks", "read")` |

Endpoint commit calls:

- `risk_questionnaires/risk_routes.py:56`
  `await commit_service_transaction(db)` — NOT in allowlist.

Local helpers:

- `risk_questionnaires/_shared.py` (145 lines) — REAL helpers:
  `_get_risk_for_read` (line 24), `_get_questionnaire_for_read` (line 36),
  `_serialize_list_item_for_user` (line 55), `_serialize_list_item` (line 66),
  `_serialize_read_for_user` (line 91), `_serialize_read` (line 100),
  `_serialize_previous_submission` (line 105),
  `_serialize_read_with_previous` (line 116), `_serialize_clarification`
  (line 130).

### 2.26 `reports/` package

- `reports/__init__.py:8-19` includes `audit_trail_excel`, `legacy_excel`,
  `summary_excel`, `unified_exports`.
- Routes:
  - `audit_trail_excel.py:133` `GET /reports/audit-trail/excel` (410-style
    response).
  - `audit_trail_excel.py:142` `GET /reports/audit-trail/export`.
  - `legacy_excel.py:14` `GET /reports/controls/excel`.
  - `legacy_excel.py:23` `GET /reports/risks/excel`.
  - `summary_excel.py:97` `GET /reports/summary/excel`.
  - `summary_excel.py:106` `GET /reports/summary/export`.
  - `unified_exports/routes.py:27` `GET /reports/risks/export`.
  - `unified_exports/routes.py:54` `GET /reports/controls/export`.
  - `unified_exports/routes.py:79` `GET /reports/kris/export`.
  - `unified_exports/routes.py:112` `GET /reports/vendors/export`.
  - `unified_exports/routes.py:137` `GET /reports/issues/export`.
- Local helpers in `reports/_export_context.py`, `reports/_scoping.py`,
  `reports/_streaming.py`, and `reports/unified_exports/_shared.py` plus
  `unified_exports/{export_builders.py, export_controls.py, export_issues.py,
  export_kris.py, export_monitoring.py, export_risks.py, export_vendors.py,
  exports.py, fetch.py, filters.py, pipeline.py, rehydrate.py, render.py,
  rows.py}` — projection and pipeline helpers (export-only).

### 2.27 `preferences.py`

- `preferences.py:12` `router = APIRouter(prefix="/preferences", tags=["preferences"])`.
- Routes: `GET ""` (line 43), `PUT ""` (line 54).
- Inline Pydantic models: `PreferencesUpdate` (line 15), `PreferencesResponse`
  (line 36).
- Endpoint commit: line 66 `await commit_service_transaction(db)` — NOT in
  allowlist.

### 2.28 `_reserved_modules.toml`

- 67 lines total. 9 reserved entries:
  - 4 `activity_entity_type` reservations (`VENDOR_ASSESSMENT`,
    `VENDOR_INCIDENT`, `VENDOR_SLA`, `VENDOR_REMEDIATION`).
  - 1 `role` reservation (`CONTROL_OWNER`).
  - 3 `permission` reservations (`vendor_contracts:read`,
    `vendor_contracts:write`, `controls:approve`).
- Quote line 4 `[[reserved]]`.

---

## 3. Re-export shims and compatibility adapters

| File | Lines | Pattern | Importers (downstream) |
| --- | --- | --- | --- |
| `endpoints/_collection.py` | 158 | Compat re-export of `app.services._collection_contracts` and `_collection_filters` (lines 9-22) | `risks/crud/list.py:6`, `controls/crud/list.py:6`, `issues/crud/list.py:6`, `kris/crud/list.py:10` |
| `endpoints/_collection_execution.py` | 35 | Pure re-export shim of `app.services._collection_contracts` (lines 3-18) | (search not run; presence indicates existing re-export) |
| `endpoints/_monitoring_response.py` | 25 | `"""Compatibility Adapter for monitoring response projection helpers."""` (line 1); re-exports from `app.services._monitoring_response` | `risks/crud/{create,detail,restore}.py`, `controls/crud/{create,detail,restore}.py`, `kris/crud/{create,restore}.py`, `risks/control_links.py:4`, etc. |
| `endpoints/issues/_shared/__init__.py` | 79 | Aggregator re-export | `issues/crud/{create,detail,update,contextual}.py`, `issues/links.py`, `issues/workflow.py`, `issues/exceptions.py` |
| `endpoints/issues/_shared/constants.py` | 19 | RE-EXPORT shim of `app.services._issue_register.constants` | (re-exposed via `_shared/__init__.py`) |
| `endpoints/issues/_shared/source.py` | 17 | Compat re-export `"""Compatibility Adapter for issue source-link mutation helpers."""` (line 1); re-exports `app.services._issue_register.source_mutation` | (re-exposed via `_shared/__init__.py`); also `issues/crud/contextual.py:14`, `issues/crud/create.py:14` |
| `endpoints/issues/_shared/serialization.py` | 43 | Compat re-export of `app.services._issue_register.linked_context` and `serialization` | (re-exposed via `_shared/__init__.py`); also `issues/links.py:14-19` |
| `endpoints/kris/linked_vendors.py` | 6 | Pure re-export of `app.services._kri_history.value_application.visible_linked_vendors` | `kris/crud/create.py:22` `from ..linked_vendors import visible_linked_vendors`; `kris/crud/restore.py:17` |
| `endpoints/risks/__init__.py` | 8 | Two-level router compositor re-export of nested `crud`, `control_links`, `vendor_links` (audit candidate S1.something) | `api/v1/router.py:25` |
| `endpoints/risks/crud/__init__.py` | 24 | Two-level compositor; re-exports verb handlers and `validate_risk_type` | `api/v1/router.py:25`; `risks/__init__.py:2` |
| `endpoints/controls/__init__.py` | 5 | Composes `crud.router` + `executions` + `linking` | `api/v1/router.py:38` |
| `endpoints/controls/crud/__init__.py` | 23 | Re-exports verb handlers and `router` | (transitive) |
| `endpoints/kris/__init__.py` | 6 | Composes `crud.router` + `history` | `api/v1/router.py:49` |
| `endpoints/kris/crud/__init__.py` | 31 | Re-exports verb handlers; mounts `breaches`, `overdue`, `due_soon`, `detail`, `update`, `archive`, `restore` onto `list.router` | (transitive) |
| `endpoints/vendors/__init__.py` | 6 | Composes `crud.router` + `lifecycle` | `api/v1/router.py:41` |
| `endpoints/issues/__init__.py` | 15 | Composes `lookups`, `crud`, `links`, `workflow`, `exceptions` | `api/v1/router.py:40` |
| `endpoints/issues/crud/__init__.py` | 12 | Composes `list`, `create`, `contextual`, `detail`, `update` | (transitive) |
| `endpoints/users/__init__.py` | 15 | Composes `crud.router` + 6 sub-routers | `api/v1/router.py:36` |
| `endpoints/dashboard/__init__.py` | 26 | Composes 9 sub-routers | `api/v1/router.py:45` |
| `endpoints/auth/__init__.py` | 22 | Composes 8 sub-routers; re-exports `verify_entra_id_token` | `api/v1/router.py:35` |
| `endpoints/admin/__init__.py` | 20 | Composes 8 sub-routers; re-exports `require_platform_admin` | `api/v1/router.py:52` |
| `endpoints/approvals/__init__.py` | 9 | Composes `detail`, `resolve` onto `queue.router` | `api/v1/router.py:50` |
| `endpoints/riskhub/__init__.py` | 31 | Composes 8 sub-routers; re-exports `_ensure_total_assets_value_config`, `get_cro_user`, `require_cro` | `api/v1/router.py:57` |
| `endpoints/risk_questionnaires/__init__.py` | 15 | Two routers (`router`, `risk_router`) | `api/v1/router.py:44` and `:60` |
| `endpoints/reports/__init__.py` | 19 | Composes 4 sub-routers | `api/v1/router.py:47` |
| `endpoints/departments/__init__.py` | (5 routers composed) | Composes `list`, `detail`, `controls`, `kris`, `risks` | `api/v1/router.py:46` |

---

## 4. Endpoint-local helpers that mirror service-side helpers

### 4.1 `validate_risk_type` (audit S1.4)

- Endpoint copy: `risks/crud/_shared.py:8-20` — raises `HTTPException(400, ...)`.
- Service-side copy referenced by audit: `app/services/_entity_mutation_lifecycle/policy.py:29-39`
  — raises `ValidationError`. Audit body (`2026-05-09-deepening-audit.md`,
  candidate text) describes "two functions with identical bodies; differ only
  in raised exception class."

### 4.2 `assert_can_request_delete_*` (audit S6.x area, C-N1)

- Endpoint copy: `endpoints/approvals/_delete_authorization.py:20, 41, 59` —
  three async functions raising `HTTPException`.
- Service copy: `app/services/_entity_mutation_lifecycle/archive_plans.py:38, 56, 72` —
  three async functions with identical names. Used by `archive_plans.py:102, 178, 247`.
- Cross-imports:
  - `app/services/_approval_queue/delete_intake.py:15-17` imports the
    endpoint-side `_delete_authorization` (lines 31, 33, 34, 44, 61, 82 invoke).

### 4.3 Inline Pydantic models in endpoints (audit S8.6)

- `endpoints/health.py:16-35` — `LivenessResponse`, `ReadinessResponse`,
  `HealthResponse` (3 models).
- `endpoints/preferences.py:15-40` — `PreferencesUpdate`,
  `PreferencesResponse` (2 models).
- `endpoints/riskhub_questionnaires.py:17-34` — `RiskFilters`,
  `BatchSendRequest`, `BatchSendResponse` (3 models).

### 4.4 Other endpoint-local serialization helpers

- `risk_questionnaires/_shared.py:55-130` — 7 serialization helpers
  (`_serialize_*`) that wrap `RiskQuestionnaireRead`/`*ListItemRead` schemas;
  these convert ORM rows + capability dicts to Pydantic models. Service-side
  serialization in `app/services/risk_questionnaire_service.py` exposes
  `questionnaire_capabilities`, `questionnaire_load_options`,
  `can_read_questionnaire` (imported in `_shared.py:17-21`).

---

## 5. Endpoint commit calls and allowlist status

### 5.1 Allowlist file

`tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` (48 lines).
8 entries, all under `endpoints/auth/`:

| Entry | File:line in source |
| --- | --- |
| Line 2-5 | `auth/sso.py:170` |
| Line 8-11 | `auth/refresh.py:177` |
| Line 14-17 | `auth/logout.py:101` |
| Line 19-23 | `auth/logout.py:132` |
| Line 26-29 | `auth/password.py:128` |
| Line 32-35 | `auth/_sso_helpers.py:48` |
| Line 38-41 | `auth/demo.py:67` |
| Line 44-47 | `auth/password.py:161` |

All 8 entries `expires_at = "2026-09-01"`.

### 5.2 All `await *.commit()` and `commit_service_transaction(db)` sites in `endpoints/`

(grep `'await.*\.commit()\|await commit_service_transaction'`):

| Site | In allowlist? |
| --- | --- |
| `auth/_sso_helpers.py:48` `await db.commit()` | YES (line 32-35) |
| `auth/demo.py:67` `await db.commit()` | YES (line 38-41) |
| `auth/logout.py:101` `await db.commit()` | YES (line 14-17) |
| `auth/logout.py:132` `await db.commit()` | YES (line 19-23) |
| `auth/password.py:128` `await db.commit()` | YES (line 26-29) |
| `auth/password.py:161` `await db.commit()` | YES (line 44-47) |
| `auth/refresh.py:177` `await db.commit()` | YES (line 8-11) |
| `auth/sso.py:170` `await db.commit()` | YES (line 2-5) |
| `admin/console.py:163` `await commit_service_transaction(db)` | NO |
| `admin/directory_sync.py:98` `await commit_service_transaction(db)` | NO |
| `admin/log_config.py:126` `await commit_service_transaction(db)` | NO |
| `admin/snapshots.py:53` `await commit_service_transaction(db)` | NO |
| `controls/crud/create.py:61` `await commit_service_transaction(db)` | NO |
| `controls/crud/restore.py:64` `await commit_service_transaction(db)` | NO |
| `issues/crud/contextual.py:94` `await commit_service_transaction(db)` | NO |
| `issues/crud/create.py:106` `await commit_service_transaction(db)` | NO |
| `issues/links.py:116` `await commit_service_transaction(db)` | NO |
| `issues/links.py:143` `await commit_service_transaction(db)` | NO |
| `kris/crud/create.py:74` `await commit_service_transaction(db)` | NO |
| `kris/crud/restore.py:63` `await commit_service_transaction(db)` | NO |
| `preferences.py:66` `await commit_service_transaction(db)` | NO |
| `risk_questionnaires/risk_routes.py:56` `await commit_service_transaction(db)` | NO |
| `riskhub_questionnaires.py:89` `await commit_service_transaction(db)` | NO |
| `risks/crud/create.py:84` `await commit_service_transaction(db)` | NO |
| `risks/crud/restore.py:62` `await commit_service_transaction(db)` | NO |
| `vendor_link_helpers.py:91` `await commit_service_transaction(db)` | NO |
| `vendor_link_helpers.py:107` `await commit_service_transaction(db)` | NO |

Total commit sites in `endpoints/`: 27. In allowlist: 8 (all `auth/`). Not in
allowlist: 19.

Note: The allowlist scope is `endpoints/auth/*` only. The architecture-lock
test enforced from `tests/backend/pytest/architecture/test_endpoint_commit_allowlist.py`
(file presence implied by `_endpoint_commit_allowlist.toml`) is the seam that
governs which paths must be listed. Whether `commit_service_transaction(db)`
calls in non-auth endpoints are also gated by this same allowlist (vs. only
bare `db.commit()`) is not visible from this file alone.

---

## 6. Full route enumeration totals

- **Routers included by aggregator**: 28 (see §1).
- **Total `@router.<verb>` decorators across endpoints**: 326 grep hits,
  including `router = APIRouter()` declarations (~50 router declarations).
  The audit line 67 states `28 routers / 215 routes mounted under /api/v1`;
  this Phase 1 mapping does not re-count totals (audit number cited
  verbatim).

---

## 7. Special-focus summary table

| Audit ID | Focus | File | Status from this map |
| --- | --- | --- | --- |
| S8.5 | Delete `riskhub_questionnaires.py` | `endpoints/riskhub_questionnaires.py` | 1 mounted route (`POST /api/v1/riskhub/questionnaires/batch-send`); FE caller in `frontend/src/services/riskHubApi.ts:309`; backend test `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py` exists. |
| S8.6 | Inline Pydantic in endpoints | `health.py`, `preferences.py`, `riskhub_questionnaires.py` | 8 inline `BaseModel` subclasses across 3 files (3+2+3). |
| A-N1 | Risks 2-level compositor | `risks/__init__.py` (8 lines), `risks/crud/__init__.py` (24 lines) | Two `__init__.py` files re-mount per-verb routers. |
| S1.4 | `validate_risk_type` duplication | `risks/crud/_shared.py:8-20` vs `services/_entity_mutation_lifecycle/policy.py:29-39` | Two functions with same name; one raises `HTTPException`, other raises `ValidationError`. |
| S1.6 | Inconsistent transaction-boundary idiom in risks | `risks/crud/{create,restore}.py` (have `commit_service_transaction`); `risks/crud/{update,archive}.py` (delegate to `_entity_mutation_lifecycle`) | Confirmed: 2 endpoint commit sites + 2 delegated. |
| C-N1 / S6.x | Approvals `_delete_authorization` parallel | `approvals/_delete_authorization.py:20,41,59` vs `_entity_mutation_lifecycle/archive_plans.py:38,56,72` | Two parallel sets of `assert_can_request_delete_*` helpers. |
| S4.x | Issues `_shared/` directory | `issues/_shared/{validation,links,loading,notifications,serialization,source,constants,__init__}.py` | 8 files, 443 lines total. 4 are re-export shims (`constants.py`, `source.py`, `serialization.py`, plus aggregator `__init__.py`). 4 contain real helpers (`validation.py`, `links.py`, `loading.py`, `notifications.py`). |

---

End of Phase 1 mapping. No verification, no change recommendations.

## Wave 1 Implementation Note — Audit #10 REJECT

`backend/app/api/v1/endpoints/riskhub_questionnaires.py` is retained as a
load-bearing single-file endpoint. The live caller chain is
`frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:257` →
`frontend/src/components/riskhub/riskQuestionnairePanelState.ts:170` →
`frontend/src/services/riskHubApi.ts:308` →
`backend/app/api/v1/endpoints/riskhub_questionnaires.py:37`.

Presence lock:
`tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`.
