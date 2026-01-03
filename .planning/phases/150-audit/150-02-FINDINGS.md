# Phase 150-02 Findings - Backend Domain & Services Audit

## Scope
- **Endpoints:** risks, controls, kris, departments, dashboard, executions, notifications, orphaned_items, lookups
- **Services:** directory_sync_service, kri_deadline_service, notification_service, orphaned_item_service, report_service
- **Scripts:** migrate_risks, seed_kris, verify_data_consistency
- **Out of scope:** AD Emulator

## Summary
- **Critical:** 0
- **High:** 1
- **Medium:** 5
- **Low:** 5

## Regression Check (from `AUDIT.md` / `DEEP_CHECK_FINDINGS.md`)
- **No regressions observed** for earlier fixes: list endpoints now return paginated responses (`risks`, `controls`, `kris`), and KRI breach filtering is applied before pagination in `kris.py`.

---

## Endpoint Findings

### `backend/app/api/v1/endpoints/risks.py`
- **No issues found.** Department scoping and permission checks are applied for list/detail/update/delete, and list response includes total count.

### `backend/app/api/v1/endpoints/controls.py`
- **No issues found.** Department scoping and permission checks are applied for CRUD and linking, and list response includes total count.

### `backend/app/api/v1/endpoints/kris.py`
- **Low — Archived risks can leak into breach list** (`kris.py:79-108`)
  - **Impact:** `/kris/breaches` can include KRIs tied to archived risks while other lists default to non-archived. This makes breach widgets inconsistent with list views.
  - **Fix:** Join Risk and exclude `Risk.status == archived` by default, or add an explicit `include_archived` flag.
  - **Status:** New

### `backend/app/api/v1/endpoints/departments.py`
- **Medium — Department control counts include archived controls** (`departments.py:94-99`)
  - **Impact:** Department summaries show control totals that can exceed visible controls (list views default to exclude archived).
  - **Fix:** Exclude `Control.status == archived` (or add include_archived toggle) to align with list views.
  - **Status:** New
- **Medium — Department controls list includes archived by default** (`departments.py:401-406`)
  - **Impact:** `/departments/{id}/controls` returns archived items by default, inconsistent with `/controls` list behavior.
  - **Fix:** Add default filter to exclude archived unless explicitly requested.
  - **Status:** New
- **Low — Response shape mismatch for ControlSummary fields** (`departments.py:381-409`, `schemas/control.py:122-133`)
  - **Impact:** Endpoint returns raw `Control` objects without `department_name` or `control_owner_name` population. Depending on Pydantic settings, this can yield missing fields or validation errors and inconsistent UI data vs `/controls`.
  - **Fix:** Mirror list_controls mapping or eager-load + explicitly populate `department_name`/`control_owner_name`.
  - **Status:** New

### `backend/app/api/v1/endpoints/dashboard.py`
- **Medium — Archived items included in dashboard metrics** (`dashboard.py:83-166`, `169-231`, `234-280`, `364-409`)
  - **Impact:** Summary, department metrics, risk distribution, and risks-by-cell counts include archived risks/controls. This conflicts with list endpoints and can skew executive metrics and drill-downs.
  - **Fix:** Default to excluding archived (and optionally allow `include_archived=true`). Align filters with list endpoints.
  - **Status:** New
- **Low — Silent failure on control trend errors** (`dashboard.py:292-361`)
  - **Impact:** Any exception returns empty trends, masking real defects and making issues hard to diagnose.
  - **Fix:** Log exception details and return a structured error or differentiate “no data” vs “error.”
  - **Status:** New

### `backend/app/api/v1/endpoints/executions.py`
- **No issues found.** Department scoping and permission checks are enforced on read and create.

### `backend/app/api/v1/endpoints/notifications.py`
- **No issues found.** Notifications are scoped to the current user with explicit ownership checks.

### `backend/app/api/v1/endpoints/orphaned_items.py`
- **No issues found.** Admin/CRO gating is enforced for sensitive operations; stats are intentionally open to authenticated users.

### `backend/app/api/v1/endpoints/lookups.py`
- **Medium — Unauthenticated, unscoped lookup endpoint** (`lookups.py:1-20`)
  - **Impact:** Exposes global risk process/category values without auth or department filtering; leaks cross-department metadata.
  - **Fix:** Require `deps.get_current_user` and scope query to allowed departments (or restrict to admin only).
  - **Status:** New

---

## Service Findings

### `backend/app/services/directory_sync_service.py`
- **High — Default role fallback can assign privileged role** (`directory_sync_service.py:77-88`)
  - **Impact:** If expected default roles are missing, sync falls back to the first role by ID, which could be privileged (admin/cro), leading to unintended elevated access for synced users.
  - **Fix:** Require an explicit, non-privileged default role in config and fail fast if not present (or enforce seed role existence).
  - **Status:** Known (related to Phase 7 permission audit), still present

### `backend/app/services/kri_deadline_service.py`
- **No issues found.** Uses UTC timestamps and guards against duplicates.

### `backend/app/services/notification_service.py`
- **No issues found.** Notification creation is centralized and avoids blocking other notifications on failures.

### `backend/app/services/orphaned_item_service.py`
- **Low — Mixed naive vs UTC timestamps** (`orphaned_item_service.py:163-164`, `201-202`, `246-247`, `471-473`)
  - **Impact:** Orphan timestamps are stored as naive datetimes while other services use UTC-aware, leading to inconsistent ordering and potential timezone bugs.
  - **Fix:** Use consistent UTC-aware timestamps (e.g., `datetime.now(UTC)`), or standardize conversion at DB boundary.
  - **Status:** New

### `backend/app/services/report_service.py`
- **No issues found.** Report generation uses in-memory buffers and handles empty datasets.

---

## Script Findings

### `backend/scripts/migrate_risks.py`
- **No issues found.** Preconditions are checked before destructive deletes; department code collisions are handled.

### `backend/scripts/seed_kris.py`
- **Medium — Destructive delete before validating prerequisites** (`seed_kris.py:47-56`)
  - **Impact:** If no risks exist, the script deletes all KRIs and exits, causing data loss.
  - **Fix:** Validate risk presence before deletion or require an explicit `--force` flag for destructive operations.
  - **Status:** New
- **Medium — Round-robin fallback can mis-link KRIs to unrelated risks** (`seed_kris.py:130-135`)
  - **Impact:** KRIs may be attached to semantically unrelated risks, creating misleading dashboards and breach alerts.
  - **Fix:** Require explicit mapping (or log unmatched KRIs for manual review instead of auto-linking).
  - **Status:** Known (from prior audit), still present

### `backend/scripts/verify_data_consistency.py`
- **Low — Results capped and inconsistent with API pagination** (`verify_data_consistency.py:30-33`, `52-54`, `94-101`)
  - **Impact:** Uses `size` param (not supported) and counts `len(items)` instead of `total`, so results are truncated and can report false inconsistencies.
  - **Fix:** Use `skip/limit` with paging and rely on `total` from list responses; include auth headers if required.
  - **Status:** Known (from prior audit), still present

---

## Notes
- All findings are RiskHub-only; no AD Emulator files reviewed or referenced.
