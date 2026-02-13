# Phase 13 Research: Issue & Remediation Management

## Goal (from roadmap)
Build an end-to-end findings workflow for failed controls/high risks:
- findings/issues backend
- remediation planning and progress tracking
- dashboard/reporting with aging analysis

Roadmap anchors:
- `.planning/ROADMAP.md` Phase 13 goal and plan bullets (`13-01`..`13-03`)

## What already exists (reusable patterns)

### RBAC and scoping primitives
- Permission enforcement via `require_permission(...)` in `backend/app/core/security.py`.
- Department scoping utilities in `backend/app/core/permissions.py`:
  - `get_user_department_ids`
  - `check_department_access`
  - owner/scope helper patterns
- Canonical permission contract in `backend/app/db/rbac_seed_contract.py`.

### Auditability and change tracking
- Append-only `ActivityLog` model in `backend/app/models/activity_log.py`.
- Standard activity logging helper in `backend/app/core/activity_logger.py`:
  - `log_activity(...)`
  - `build_change_set(...)`
- Existing entity enum expansion pattern for new domains:
  - `backend/alembic/versions/18b1c2d3e4f5_extend_activity_entity_type_for_vendor_entities.py`
  - `backend/alembic/versions/d14e4f5a6b7c_widen_activity_logs_entity_type.py`

### Similar domain model and endpoint style
- Vendor remediation model and CRUD endpoints are close analogs:
  - `backend/app/models/vendor_remediation.py`
  - `backend/app/api/v1/endpoints/vendor_incidents.py` (remediation routes)
- Good patterns to reuse:
  - Enum-backed status lifecycle
  - owner assignment and due dates
  - activity log emission on create/update/delete

### Existing signal source for findings
- Control executions already store findings text and result:
  - `backend/app/models/control_execution.py` (`result`, `findings`)
  - `backend/app/api/v1/endpoints/executions.py`
- This is a natural input path for creating structured Issue records.

### Frontend integration points
- App routing + nav conventions:
  - `frontend/src/App.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
- Existing list/reporting UX patterns:
  - `frontend/src/pages/AuditTrailPage.tsx`
  - `frontend/src/services/reportApi.ts`
  - dashboard card/grid patterns in `frontend/src/pages/DashboardPage.tsx`

## Gaps identified
- No generic `finding`/`issue` domain models in backend.
- No generic findings API endpoints.
- No remediation workflow linked to risk/control findings.
- No findings dashboard or aging metrics endpoints.
- No dedicated permissions for findings resources in RBAC contract.

## Recommended Phase 13 architecture

### Core entities (minimum viable)
1. `Issue`
   - canonical finding/issue record
   - severity, status, source, owner, due date, department, opened/closed timestamps
2. `IssueLink`
   - links issue to `risk_id`, `control_id`, optional `execution_id`/`kri_id`
3. `IssueRemediationPlan`
   - owner, target date, progress %, status, completion notes
4. `IssueException`
   - risk acceptance/exception metadata (reason, approved_by, expires_at, status)

### Workflow state (recommended)
- Issue status: `open -> triaged -> in_progress -> ready_for_validation -> closed`
- Remediation plan status: `draft -> active -> blocked -> completed`
- Exception status: `requested -> approved -> expired -> revoked`

### Permissions model (recommended)
- Add `issues:read`, `issues:write`, `issues:approve` to RBAC contract.
- Suggested role mapping:
  - CRO / Risk Manager: full findings lifecycle
  - Department Head: write within scope, no global approval
  - Internal Audit / Compliance: read and comment/validation-oriented actions
- Keep backend as source of truth; frontend mirrors only.

## Risks to account for during planning
- Department scoping drift between linked risk/control and issue records.
- Status transition bugs without central state machine/service.
- Enum migration drift (especially `activity_logs.entity_type`) if new entity types are added.
- Reporting accuracy for aging metrics if timezone/date bucketing is inconsistent.

## Verification strategy for planning
- Backend:
  - focused API tests for create/update/list + scope/RBAC allow/deny
  - lifecycle transition tests
  - migration coverage for new enums/tables/indexes
- Frontend:
  - typecheck + unit tests for gating and filters
  - targeted E2E flow from issue creation to remediation closure
- Docs:
  - reconcile `docs/BUSINESS_LOGIC.md` and `docs/TESTING.md` for new workflow semantics

## Planning recommendations
- Keep Phase 13 split exactly as roadmap defines:
  - `13-01`: backend foundation (domain + API + links)
  - `13-02`: remediation workflow (assignment/progress/exception lifecycle)
  - `13-03`: dashboard/reporting and final verification
- Sequence with strict dependencies to reduce rework:
  - data model/API first, workflow second, analytics/reporting last.

---

## Reopen Addendum (2026-02-12): Simplified Contextual Intake

### Why reopen

The core lifecycle is implemented, but intake still depends on manual issue form entry and disconnected context switching.
Reopen scope focuses on reducing intake friction while keeping the existing backend state machine.

### Additional findings

1. Current create flow is manual-first and defaults to `source_type='manual'`:
   - `frontend/src/components/issues/IssueCreateForm.tsx`
2. Link model currently cannot link vendors directly:
   - `backend/app/models/issue.py`
   - `backend/app/schemas/issue.py`
3. Contextual issue entry actions are not present on Risk/Control/KRI/Vendor detail pages.
4. Vendor records allow `department_id` to be null, so contextual department resolution needs explicit fallback:
   - `backend/app/models/vendor.py`

### Reopen design direction

1. Add contextual create endpoint (`POST /api/v1/issues/contextual`) with entity-typed input.
2. Add `vendor_id` to `IssueLink` and update exactly-one-target constraints.
3. Implement detail-page contextual entry points (Risk/Control/KRI/Vendor) using a shared quick-create modal.
4. Keep workflow transitions/endpoints unchanged and simplify only frontend action presentation.
5. Preserve no-ID UI rule and EN/CS i18n coverage for new UI copy.

### Reopen verification emphasis

1. Scope-safe contextual create by entity type with non-leaky `404` behavior.
2. Vendor fallback department resolution:
   - vendor department
   - vendor owner department
   - explicit failure when unresolved
3. Regression coverage for `linked_vendor_id` list filtering.
4. E2E detail-page create flows for all four contextual sources.
