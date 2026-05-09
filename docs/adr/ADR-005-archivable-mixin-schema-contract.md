# ADR-005 Archivable Mixin Schema Contract

## Status

Accepted

## Context

RiskHub entities represent archived/inactive state through several dialects: status values, boolean flags, and active/inactive semantics. Listing and reporting code repeats those predicates.

## Decision

Add an `ArchivableMixin` with `is_archived`, `archived_at`, and `archived_by_id` for archive-capable entities. Existing status fields remain as compatibility aliases during migration. Query code uses the Archivable Interface for live/archive predicates.

`Risk` and `Control` statuses keep non-archive lifecycle values only after cutover; `ControlStatus.inactive` is retained as a valid non-archive lifecycle state. Vendor `inactive` was treated as legacy archive state during cutover and normalized into `Vendor.is_archived`.

Revision `k6l7m8n9o0p1` drops `Vendor.status` and retires the legacy `("inactive",)` vendor alias. Vendors now archive solely through `is_archived`; risks and controls retain their `("archived",)` compatibility aliases.

### `ControlStatus.inactive` retention (v5.3+)

`ControlStatus` (in `backend/app/models/control.py`) retains the `inactive` member after `archived` was dropped in v5.3. `inactive` is orthogonal to `is_archived` — it represents a control that is defined and part of the catalog but not currently enforced (executions blocked, statistics report it separately, reactivation flips status back to `active`). `is_archived = True` represents soft-deletion (the control is no longer part of the catalog and is hidden from default listings). Consumers that need this distinction include `app.services._control_execution.workflow.is_executable` (which checks both flags), `app.services._authorization_capabilities.controls` (which restricts the executable set to `{active, draft}` and excludes `inactive`), and `app.api.v1.endpoints.departments.detail` (which reports `active` and `inactive` counts as separate non-archive statistics). The error path in `app.services._control_execution.workflow` distinguishes "Cannot execute an archived control" from "Cannot execute an inactive control", confirming the two states are user-visible and semantically distinct. Removing `inactive` would force callers to either archive non-enforced controls (losing them from listings) or keep them `active` (allowing executions against unintended targets); both regress the contract.

## Alternatives Rejected

- Keep all status dialects: rejected because every listing/report must remember entity-specific archive semantics.
- Replace existing status fields immediately: rejected because it is too disruptive for API compatibility.
- Add helper functions only: rejected because the persistence contract would still differ by table.

## Migration Impact

Columns are added additively and backfilled from current status values. Listing snapshots must be taken before and after migration. Risk and control status fields remain during their compatibility window; vendor archive state is fully cut over to `is_archived`.

## Rollback Strategy

Forward-only in production after backfill. Because old status fields remain, rollback can restore old query predicates without data loss.

## Invariant Tests

- Raw archive/status predicates are banned outside the Archivable Module and approved adapters listed in `tests/backend/pytest/architecture/_archive_allowlist.toml`.
- Listing snapshots remain functionally equivalent after backfill.
- Migration tests verify backfill for Risk, Control, Vendor, and KRI semantics.
