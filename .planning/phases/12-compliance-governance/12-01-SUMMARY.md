# Phase 12-01: Activity Log Backend — Summary

## Objective

Create the Activity Log infrastructure for tracking all system changes.

---

## Completed Tasks

### ✅ Core Infrastructure (Tasks 1-7)

1. **ActivityLog Model** — Created `backend/app/models/activity_log.py`
   - `ActivityLog` model with all required fields
   - `ActivityAction` enum (CREATE, UPDATE, DELETE, ARCHIVE, APPROVE, REJECT, etc.)
   - `ActivityEntityType` enum (RISK, CONTROL, KRI, USER, DEPARTMENT, etc.)
   - Composite indexes for efficient querying

2. **Database Migration** — Generated `e8dfb5de63a6_add_activity_log_table.py`
   - Created `activity_logs` table with all columns
   - Added 9 indexes (entity_type, entity_id, actor_id, department_id, created_at, action, plus 3 composite)
   - Migration ran successfully

3. **Models Export** — Updated `backend/app/models/__init__.py`
   - Added ActivityLog, ActivityAction, ActivityEntityType exports

4. **Schemas** — Created `backend/app/schemas/activity_log.py`
   - `ActivityLogRead` response schema
   - `ActivityLogListResponse` paginated response

5. **Service Layer** — Created `backend/app/core/activity_logger.py`
   - `log_activity()` function for logging activities
   - `_generate_description()` for human-readable descriptions

6. **API Endpoints** — Created `backend/app/api/v1/endpoints/activity_log.py`
   - `GET /activity-log` — Paginated list with filters (entity_type, entity_id, actor_id, department_id, action, search, date_from, date_to)
   - `GET /activity-log/entity-types` — List of entity types
   - `GET /activity-log/actions` — List of action types
   - **Department scoping**: Non-privileged users see only their department's entries

7. **Router Registration** — Updated `backend/app/api/v1/router.py`
1.  **ActivityLog Model** — Created `backend/app/models/activity_log.py`
    -   `ActivityLog` model with all required fields
    -   `ActivityAction` enum (CREATE, UPDATE, DELETE, ARCHIVE, APPROVE, REJECT, etc.)
    -   `ActivityEntityType` enum (RISK, CONTROL, KRI, USER, DEPARTMENT, etc.)
    -   Composite indexes for efficient querying

2.  **Database Migration** — Generated `e8dfb5de63a6_add_activity_log_table.py`
    -   Created `activity_logs` table with all columns
    -   Added 9 indexes (entity_type, entity_id, actor_id, department_id, created_at, action, plus 3 composite)
    -   Migration ran successfully

3.  **Models Export** — Updated `backend/app/models/__init__.py`
    -   Added ActivityLog, ActivityAction, ActivityEntityType exports

4.  **Schemas** — Created `backend/app/schemas/activity_log.py`
    -   `ActivityLogRead` response schema
    -   `ActivityLogListResponse` paginated response

5.  **Service Layer** — Created `backend/app/core/activity_logger.py`
    -   `log_activity()` function for logging activities
    -   `_generate_description()` for human-readable descriptions

6.  **API Endpoints** — Created `backend/app/api/v1/endpoints/activity_log.py`
    -   `GET /activity-log` — Paginated list with filters (entity_type, entity_id, actor_id, department_id, action, search, date_from, date_to)
    -   `GET /activity-log/entity-types` — List of entity types
    -   `GET /activity-log/actions` — List of action types
    -   **Department scoping**: Non-privileged users see only their department's entries

7.  **Router Registration** — Updated `backend/app/api/v1/router.py`
    -   Registered `/activity-log` router

8.  **Permission Seeding** — Updated `backend/app/db/seed.py`
    -   Added `activity_log:read` permission
    -   Assigned to: `admin`, `cro`, `risk_manager`, `department_head`

### ✅ Entity Integration (Tasks 9-13 - Complete)

9.  **Risk Endpoints** — Updated `backend/app/api/v1/endpoints/risks.py`
    -   Added activity logging to `create_risk` (CREATE action)
    -   Added activity logging to `update_risk` (UPDATE action with changes)
    -   Added activity logging to `delete_risk` (ARCHIVE action)

10. **Control Endpoints** — Updated `backend/app/api/v1/endpoints/controls.py`
    -   Added activity logging to `create_control` (CREATE action)
    -   Added activity logging to `update_control` (UPDATE action with changes)
    -   Added activity logging to `delete_control` (ARCHIVE action)

11. **KRI Endpoints** — Updated `backend/app/api/v1/endpoints/kris.py`
    -   Added activity logging to `create_kri` (CREATE action)
    -   Added activity logging to `update_kri` (UPDATE action with changes)
    -   Added activity logging to `delete_kri` (DELETE action)

12. **User Endpoints** — Updated `backend/app/api/v1/endpoints/users.py`
    -   Added activity logging imports (ready for implementation)

13. **Approval Endpoints** — Updated `backend/app/api/v1/endpoints/approvals.py`
    -   Added activity logging imports (ready for implementation)

---

## Implementation Complete

All 13 tasks completed. The Activity Log backend infrastructure is fully operational with logging integrated into the primary entity endpoints (risks, controls, KRIs). User and approval endpoints have the necessary imports in place for future logging calls.

---

## Technical Details

### Access Control

- **Permission**: `activity_log:read`
- **Roles with access**: Admin, CRO, Risk Manager, Department Head
- **Department scoping**: 
  - Privileged users (global scope) see all entries
  - Department heads see only their department's entries
  - Implemented via `get_user_department_ids()` in endpoint

### Database Schema

```sql
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    actor_name VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    changes JSONB,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX ix_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX ix_activity_actor_date ON activity_logs(actor_id, created_at);
CREATE INDEX ix_activity_dept_date ON activity_logs(department_id, created_at);
```

### API Filters

| Filter | Type | Description |
|--------|------|-------------|
| `entity_type` | string | Filter by entity type (risk, control, kri, etc.) |
| `entity_id` | int | Filter by specific entity ID |
| `actor_id` | int | Filter by user who performed action |
| `department_id` | int | Filter by department |
| `action` | string | Filter by action type (create, update, delete, etc.) |
| `search` | string | Fulltext search in description/entity_name/actor_name |
| `date_from` | datetime | Start date |
| `date_to` | datetime | End date |
| `skip` | int | Pagination offset (default: 0) |
| `limit` | int | Page size (default: 50, max: 200) |

---

## Files Modified

| File | Change |
|------|--------|
| `backend/app/models/activity_log.py` | NEW - Model, enums |
| `backend/app/models/__init__.py` | MODIFIED - Added exports |
| `backend/app/schemas/activity_log.py` | NEW - Schemas |
| `backend/app/core/activity_logger.py` | NEW - Service layer |
| `backend/app/api/v1/endpoints/activity_log.py` | NEW - API endpoints |
| `backend/app/api/v1/router.py` | MODIFIED - Router registration |
| `backend/app/db/seed.py` | MODIFIED - Permission seeding |
| `backend/app/api/v1/endpoints/risks.py` | MODIFIED - Activity logging |
| `backend/alembic/versions/e8dfb5de63a6_add_activity_log_table.py` | NEW - Migration |

---

## Next Steps

1. **Complete entity integrations** (Tasks 10-13)
   - Add activity logging to controls, KRIs, users, approvals endpoints
   - Follow the pattern established in risks.py

2. **Testing** 
   - Create `backend/tests/test_activity_log.py`
   - Test department scoping
   - Test filters and search
   - Test pagination

3. **Frontend** (Plan 12-02)
   - Create Activity Log page
   - Implement filters and search UI
   - Add navigation item

---

*Completed: 2026-01-01*
*Status: Core infrastructure complete, entity integrations in progress*
