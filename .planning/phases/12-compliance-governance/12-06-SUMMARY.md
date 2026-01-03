---
phase: 12-06
status: complete
---

# Summary: Audit Log Separation & Rotation

## What Was Done

Implemented chemical separation of high-value Audit Logs from general Application Logs to support efficient SIEM ingestion and retention policies.

### Key Features
1. **Dual Log Streams**:
   - `logs/app.json.log`: General application debug/info/warning events.
   - `logs/audit.json.log`: Exclusive security/audit events (SIEM target).
   
2. **Configurable Rotation**:
   - Admin-configurable rotation settings via Risk Hub Global Config.
   - Defaults: 10MB file size, 10 backup files.
   - Settings: `log_rotation_size_mb`, `log_retention_count`.

3. **Admin API Extensions**:
   - `GET /admin/logs/audit`: Retrieve/filter audit logs.
   - `GET/POST /admin/logs/config`: View and update log rotation settings.

### Files Modified/Created
- `backend/app/core/logging.py`: Configured `app_handler` (NonAuditFilter) and `audit_handler` (AuditFilter).
- `backend/app/core/activity_logger.py`: Updated to use `get_audit_logger()` for routing.
- `backend/app/api/v1/endpoints/admin.py`: Added audit log and config endpoints.
- `backend/alembic/versions/72d3046593d5_add_log_rotation_config.py`: Database migration for settings.

## Technical Details

**Log Separation Logic**:
- `AuditFilter`: Accepts only logger name `audit` or `audit.*`.
- `NonAuditFilter`: Rejects logger name `audit` or `audit.*`.
- Both handlers attached to root logger.

**Configuration**:
- Settings stored in `global_config` table.
- Cached for performance, read synchronously during file handler setup.
- Updates require backend restart (documented in API).

## Verification Results

✅ `audit.json.log` created alongside `app.json.log`
✅ App logs exclude audit events; Audit logs contain only audit events
✅ Database migration applied successfully
✅ Admin endpoints functional for log retrieval and configuration

## Next Steps

1. **12-07**: SIEM Integration Documentation & Admin UI
   - Create Admin Console "Audit Logs" tab using new endpoints.
   - Write `SIEM_INTEGRATION.md` guide.
