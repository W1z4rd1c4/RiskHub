# 07 — Alembic Migrations & Current Schema (Context Map)

Phase 1 mapping. Pure current-state. No proposals.

## 1. Alembic Configuration

### 1.1 Config files

- `backend/alembic.ini:8` — `script_location = %(here)s/alembic` (no `backend/migrations/` directory exists; migrations live at `backend/alembic/versions/`).
- `backend/alembic.ini:87` — `sqlalchemy.url = driver://user:pass@localhost/dbname` (overridden in `env.py`).
- `backend/alembic/env.py:13` — `from app.db.base import Base`
- `backend/alembic/env.py:14` — `from app.core.config import get_settings`
- `backend/alembic/env.py:17` — `from app.models import User, Department, Role, Permission, RolePermission` (autogenerate import surface).
- `backend/alembic/env.py:25` — `sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")`
- `backend/alembic/env.py:35` — `target_metadata = Base.metadata`
- `backend/alembic/env.py:46-47,64` — `transaction_per_migration=True` (both offline and online).

### 1.2 Versions directory

- Path: `backend/alembic/versions/`
- Total `.py` revision files: **87**
- Single linear chain length from head (counting merge as 1): 83 (the `7e4603a6e32c_merge_heads_for_approval_status` revision merges `('a9b8c7d6e5f4', 'b8c3d2e1f4a5', 'cfd46dc4cb71')` so a few revisions sit on side branches).

### 1.3 Alembic head

- **Head:** `j5k6l7m8n9o0` (file: `j5k6l7m8n9o0_rename_kri_archived_by_fk.py`).
- Computed by scanning every `revision = "..."` and `down_revision = "..."` in `backend/alembic/versions/*.py` and finding the revision id that no other migration points back to. There is exactly one head; no open branches.

## 2. Recent 15 migrations (head → back)

In order from newest down the linear chain.

| # | Revision | File | What it changed |
|---|----------|------|-----------------|
| 1 | `j5k6l7m8n9o0` | `j5k6l7m8n9o0_rename_kri_archived_by_fk.py` | Drops `fk_key_risk_indicators_archived_by_id` and recreates it as `fk_key_risk_indicators_archived_by_id_users` so the KRI ArchivableMixin FK matches the post-mixin naming convention. (`j5k6l7m8n9o0_rename_kri_archived_by_fk.py:26-37`) |
| 2 | `i4j5k6l7m8n9` | `i4j5k6l7m8n9_approver_roles_to_jsonb.py` | Converts `approval_scenarios.approver_roles` from text-encoded JSON to `JSON().with_variant(JSONB, 'postgresql')` using `postgresql_using="approver_roles::jsonb"`. (`i4j5k6l7m8n9_approver_roles_to_jsonb.py:20-32`) |
| 3 | `h3i4j5k6l7m8` | `h3i4j5k6l7m8_unify_archive_state.py` | Backfills `is_archived=true` from legacy `status='archived'` (risks/controls) and `status='inactive'` (vendors), then resets those status rows to `'active'`. (`h3i4j5k6l7m8_unify_archive_state.py:20-25`) |
| 4 | `g2h3i4j5k6l7` | `g2h3i4j5k6l7_add_archivable_columns.py` | Adds `is_archived BOOL DEFAULT false NOT NULL`, `archived_at TIMESTAMPTZ NULL`, `archived_by_id INT NULL FK users(id)`, and `ix_<table>_is_archived` to `risks`, `controls`, `vendors`; backfills from legacy status. (`g2h3i4j5k6l7_add_archivable_columns.py:20-44`) |
| 5 | `f1a2b4c5d6e7` | `f1a2b4c5d6e7_add_issue_link_target_indexes.py` | Adds CONCURRENTLY `ix_issue_links_risk_id`, `_control_id`, `_execution_id`, `_kri_id` on `issue_links`. (`f1a2b4c5d6e7_add_issue_link_target_indexes.py:15-38`) |
| 6 | `e0f1a2b4c5d6` | `e0f1a2b4c5d6_add_risk_owner_to_risk_edit_priority.py` | Adds `risk_owner` to default `approval_scenarios.approver_roles` for `key='risk_edit_priority'`, only if row still equals the original `["risk_manager","cro"]`. (`e0f1a2b4c5d6_add_risk_owner_to_risk_edit_priority.py:18-19,30-37`) |
| 7 | `d9e0f1a2b4c5` | `d9e0f1a2b4c5_add_department_manager_index.py` | Adds CONCURRENTLY `ix_departments_manager_id`. (`d9e0f1a2b4c5_add_department_manager_index.py:18-31`) |
| 8 | `c8d9e0f1a2b4` | `c8d9e0f1a2b4_add_approval_scenario_snapshots.py` | Adds `approval_requests.scenario_key`, `scenario_approver_roles JSON`, index, seeds `kri_edit` and `kri_history_correction` scenarios, ensures privileged finishers across tier-capable scenarios. (`c8d9e0f1a2b4_add_approval_scenario_snapshots.py:60-80`) |
| 9 | `b7c8d9e0f1a3` | `b7c8d9e0f1a3_add_issue_source_link_marker.py` | Adds `issue_links.is_source_link BOOL NOT NULL DEFAULT false`. (`b7c8d9e0f1a3_add_issue_source_link_marker.py:24-27`) |
| 10 | `a7b8c9d0e1f2` | `a7b8c9d0e1f2_add_open_questionnaire_unique_index.py` | Cleans safe duplicate open `risk_questionnaires`, raises if leftover duplicates remain, then `CREATE UNIQUE INDEX ux_risk_questionnaires_one_open_per_risk ON risk_questionnaires (risk_id) WHERE status IN ('sent','in_progress')`. (`a7b8c9d0e1f2_add_open_questionnaire_unique_index.py:117-124`) |
| 11 | `z6a7b8c9d0e1` | `z6a7b8c9d0e1_expand_activity_action_for_auth_session_events.py` | Extends `activity_action` non-native enum with `login`, `failed_login`, `refresh`, `failed_refresh`, `logout`, `logout_all`, `cancel`. (`z6a7b8c9d0e1_..py:24-44`) |
| 12 | `y5z6a7b8c9d0` | `y5z6a7b8c9d0_add_entra_business_role_fields.py` | Adds `users.entra_business_role VARCHAR(255)`, `entra_business_role_last_synced_at TIMESTAMPTZ`. (`y5z6a7b8c9d0_..py:20-21`) |
| 13 | `x4y5z6a7b8c9` | `x4y5z6a7b8c9_add_break_glass_fields_to_users.py` | Adds `users.break_glass_expires_at`, `break_glass_reason`, `break_glass_granted_by_user_id` (FK self). (`x4y5z6a7b8c9_..py:22-31`) |
| 14 | `w3x4y5z6a7b` | `w3x4y5z6a7b_normalize_user_email_case_insensitive_index.py` | Verifies no case-insensitive duplicate `users.email`, lowercases values, drops `ix_users_email`, creates UNIQUE `ux_users_email_lower ON users (lower(email))`. (`w3x4y5z6a7b_..py:46-48`) |
| 15 | `v2w3x4y5z6a` | `v2w3x4y5z6a_add_vendor_kri_links.py` | Creates `vendor_kri_links(id, vendor_id, kri_id, created_at)` with cascade FKs to `vendors.id` and `key_risk_indicators.id` and `uq_vendor_kri_link(vendor_id, kri_id)`. (`v2w3x4y5z6a_..py:22-34`) |

## 3. Vendor link tables — current schema

Models `Vendor.risk_links`, `Vendor.control_links`, `Vendor.kri_links` are three separate concrete junction tables — no polymorphic discriminator, no shared base.

### 3.1 `vendor_risk_links`

- Model: `backend/app/models/vendor_risk_link.py:16` — `class VendorRiskLink(Base):`
- `__tablename__ = "vendor_risk_links"` (line 17)
- Columns: `id` PK auto-increment (line 19); `vendor_id INT NOT NULL FK vendors.id` indexed (line 20); `risk_id INT NOT NULL FK risks.id` indexed (line 21); `created_at TIMESTAMPTZ DEFAULT now()` (line 23).
- Constraint: `UniqueConstraint("vendor_id","risk_id", name="uq_vendor_risk_link")` (line 28).
- Relationship: `vendor.risk_links` cascade `all, delete-orphan` (`backend/app/models/vendor.py:89-93`); `risk.vendor_links` (`backend/app/models/risk.py:118`).
- Created by migration `18c1d2e3f4a5_add_vendor_risk_factors_and_links.py:36-48` — note FK lacks `ondelete` clause (cascade is application-level via SQLAlchemy `cascade="all, delete-orphan"`, not DB-level).

### 3.2 `vendor_control_links`

- Model: `backend/app/models/vendor_control_link.py:16` — `class VendorControlLink(Base):`
- Columns: `id INT PK` (line 19); `vendor_id INT NOT NULL FK vendors.id` indexed (line 20); `control_id INT NOT NULL FK controls.id` indexed (line 21); `created_at TIMESTAMPTZ DEFAULT now()` (line 23).
- Constraint: `UniqueConstraint("vendor_id","control_id", name="uq_vendor_control_link")` (line 28).
- Relationship: `vendor.control_links` cascade `all, delete-orphan` (`vendor.py:94-98`); `control.vendor_links` (`control.py:145`).
- Created by migration `18c1d2e3f4a5_..py:50-62` — FK no `ondelete`.

### 3.3 `vendor_kri_links`

- Model: `backend/app/models/vendor_kri_link.py:16` — `class VendorKRILink(Base):`
- `__table_args__ = (UniqueConstraint("vendor_id","kri_id", name="uq_vendor_kri_link"),)` (line 18).
- Columns: `id INT PK` (line 20); `vendor_id INT FK vendors.id ON DELETE CASCADE` indexed (line 21); `kri_id INT FK key_risk_indicators.id ON DELETE CASCADE` indexed (line 22); `created_at TIMESTAMPTZ DEFAULT now()` (line 23).
- Relationship: `vendor.kri_links` cascade `all, delete-orphan` (`vendor.py:99-103`); `kri.vendor_links` (`key_risk_indicators.py:90`).
- Created by migration `v2w3x4y5z6a_add_vendor_kri_links.py:22-34` — note this newer table sets `ondelete="CASCADE"` while the older two do not.

### 3.4 No polymorphic discriminator

There is no `__mapper_args__ = {"polymorphic_..."}` and no shared abstract base across the three link models. Each is a separate `Base` subclass with a hardcoded `target_id`/`target` column pair. No `entity_type` discriminator column, no STI/JTI mapper.

## 4. `Vendor.status` enum — values and usage

### 4.1 Enum definitions

- Backend ORM: `backend/app/models/vendor.py:22-23` — `class VendorStatus(str, PyEnum): active = "active"` (single value).
- API schema: `backend/app/schemas/vendor.py:12-13` — `class VendorStatusEnum(str, Enum): active = "active"`.

After the `h3i4j5k6l7m8_unify_archive_state` migration, the legacy `inactive` value was rewritten to `active` with `is_archived=true`, leaving the enum with one live value (`active`). `vendors.status` column is still `String(20) NOT NULL DEFAULT 'active'` indexed (`vendor.py:82`; migration `18a1b2c3d4e5_add_vendors.py:44,56`).

### 4.2 Usage sites for `Vendor.status` / `vendor.status` in queries and reads

`grep -rn "Vendor\.status\|vendor\.status\|vendors\.status"` (backend tree, excluding scripts):

- `backend/app/services/_register_listings/vendors.py:161` — `query = query.where(Vendor.status == criteria.status_filter.value)`
- `backend/app/services/_register_listings/vendors.py:200` — `"status": Vendor.status,` (sort key map)
- `backend/app/services/_register_listings/vendors.py:273` — `Vendor.status.label("status"),`
- `backend/app/services/_register_listings/controls.py:554` — `status=link.vendor.status,` (read)
- `backend/app/services/_register_listings/risks.py:430` — `status=vendor.status,` (read)
- `backend/app/services/_monitoring_response.py:219` — `status=vendor.status,` (read)
- `backend/app/services/_reporting/exports/rows.py:120` — `"status": vendor.status,` (read)
- `backend/app/services/_kri_history/direct_application.py:36` — `status=link.vendor.status,` (read)
- `backend/scripts/seed_e2e_archives.py:283` — `vendor.status = entry["status"]` (seed write)
- `backend/scripts/seed_e2e_vendors.py:35,56,77,98,119,140` — six seed dicts each setting `"status": VendorStatus.active.value`.

The only equality predicate against `Vendor.status` in production query code is `_register_listings/vendors.py:161`. Reads quote the field for response shaping but it is not used for live business filtering after the unify cutover.

### 4.3 Filter coupling to legacy values

- `backend/app/models/_archivable.py:63-67` — `legacy_values = {... "vendors": ("inactive",) }` is still hard-coded inside `archived_clause` so `Vendor.live()` / `Vendor.archived()` continue to OR/AND `status IN ('inactive')` even though the migration removed that data.

## 5. ArchivableMixin

### 5.1 Definition

File: `backend/app/models/_archivable.py`.

- `_archivable.py:12` — `class ArchivableMixin:`
- `_archivable.py:13` — docstring `"""Additive soft-delete columns shared by archivable register entities."""`
- `_archivable.py:15` — `is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)`
- `_archivable.py:16` — `archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)`
- `_archivable.py:18-20` — `@declared_attr archived_by_id` returning `mapped_column(ForeignKey("users.id"), nullable=True)` (declared_attr so each table gets its own FK).
- `_archivable.py:23-24` — classmethod `live()` → `archived_clause(cls, archived=False)`.
- `_archivable.py:27-28` — classmethod `archived()` → `archived_clause(cls, archived=True)`.
- `_archivable.py:30-41` — `mark_archived(actor, *, when=None, on_audit=None)` sets `is_archived=True`, `archived_at=when or utc_now()`, `archived_by_id=getattr(actor,"id",actor)`, fires optional audit hook.
- `_archivable.py:43-53` — `mark_restored(actor, *, on_audit=None)` clears all three fields.
- `_archivable.py:56-71` — module-level `archived_clause(model, *, archived=True)` returns `model.is_archived.is_(archived)` for non-legacy tables; for `risks`/`controls`/`vendors` it OR/ANDs with `status.in_(legacy_values)` (`risks`/`controls`: `("archived",)`; `vendors`: `("inactive",)`).

### 5.2 Including models (full list)

`grep -rn "ArchivableMixin" backend/app/models/`:

- `backend/app/models/risk.py:45` — `class Risk(ArchivableMixin, Base):`
- `backend/app/models/control.py:67` — `class Control(ArchivableMixin, Base):`
- `backend/app/models/vendor.py:40` — `class Vendor(ArchivableMixin, Base):`
- `backend/app/models/key_risk_indicator.py:33` — `class KeyRiskIndicator(ArchivableMixin, Base):`

Four register entities. No other model in `backend/app/models/` includes the mixin (the import-and-use pattern is the only signature, and grep returns no further class declarations).

### 5.3 Migrations that wired the mixin

- `i3j4k5l6m7n8_add_kri_archive_fields.py:18-34` — first added `is_archived`, `archived_at`, `archived_by_id`, FK and index on `key_risk_indicators` (pre-mixin era).
- `g2h3i4j5k6l7_add_archivable_columns.py:19-44` — added the same columns/FK/index to `risks`, `controls`, `vendors`, plus a one-shot backfill from legacy `status='archived'/'inactive'`.
- `h3i4j5k6l7m8_unify_archive_state.py:20-25` — backfilled remaining rows and reset legacy status values to `active`.
- `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:26-37` — renamed the original KRI FK to match the mixin convention `fk_<table>_archived_by_id_users`.

## 6. Capability tables

There are no capability-named tables. Capabilities are computed dynamically from `roles` + `role_permissions` and surfaced through Pydantic schemas.

- Persistent permission schema:
  - `backend/app/models/role.py:80` — `class Role(Base):` with `__tablename__ = "roles"` and columns `id`, `name UNIQUE`, `display_name`, `description`, `is_system`, `is_active`.
  - `backend/app/models/role.py:101` — `class Permission(Base):` (`permissions` table) — `id`, `resource VARCHAR(50)` indexed, `action VARCHAR(50)`, `description`.
  - `backend/app/models/role.py:115` — `class RolePermission(Base):` (`role_permissions`) — `id`, `role_id FK roles.id` indexed, `permission_id FK permissions.id` indexed.
- Capability *types* live only in Pydantic schemas, not in DB models:
  - `backend/app/schemas/vendor.py:92` — `class VendorCapabilities(BaseModel):` with 14 boolean fields (`can_read`, `can_update`, `can_archive`, `can_restore`, `can_create_linked_*`, `can_link_*`, `can_view_linked_*`, `can_create_issue`).
  - `backend/app/schemas/control.py:85` — `class ControlCapabilities`.
  - `backend/app/schemas/kri.py:74` — `class KRICapabilities`; `kri.py:191` — `KRIHistoryCapabilitiesRead`.
  - `backend/app/schemas/approval_request.py:72` — `ApprovalRequestCapabilities`.
  - `backend/app/schemas/user.py:93` `MeCapabilities`; `user.py:172` `UserDirectoryCapabilities`.
  - `backend/app/schemas/access.py:63` `AccessUserCapabilities`.
  - `backend/app/schemas/dashboard.py:122` `DashboardOverviewCapabilities`.
  - `backend/app/schemas/activity_log.py:29` `ActivityLogCapabilities`.
  - `backend/app/schemas/execution.py:88` `ControlExecutionListCapabilities`.
  - `backend/app/schemas/riskhub.py:35` `RiskTypeCapabilities`.
- `grep "Capabilities" backend/app/models/` — zero hits. Capabilities are not persisted.

## 7. ADR-010 forward-only enforcement

### 7.1 Pattern (head migration, full snippet)

`backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:40-43`:

```python
def downgrade() -> None:
    """Forward-only; restore from a pre-upgrade snapshot per ADR-010."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
```

### 7.2 Migrations following this pattern

`grep -l "raise NotImplementedError" backend/alembic/versions/*.py` returns 6:

- `h3i4j5k6l7m8_unify_archive_state.py:31` — quoted: `raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")`
- `i4j5k6l7m8n9_approver_roles_to_jsonb.py:48` — same string.
- `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:43` — same string.
- `u1v2w3x4y5z6_remove_vendor_extended_domains.py:50` — `raise NotImplementedError("This migration is forward-only.")`
- `v2w3x4y5z6a_add_vendor_kri_links.py:38` — `raise NotImplementedError("This migration is forward-only.")`
- `w3x4y5z6a7b_normalize_user_email_case_insensitive_index.py:52` — `raise NotImplementedError("This migration is forward-only.")`

Other migrations still have full reversible `downgrade()` bodies (e.g. `g2h3i4j5k6l7_add_archivable_columns.py:47-55`, `r8s9t0u1v2w3_add_app_outbox_events.py:59-65`, `q7r8s9t0u1v2_add_scheduler_job_runs.py:58-66`, `p1q2r3s4t5u6_add_refresh_tokens_and_directory_user_fields.py:59-74`, `i3j4k5l6m7n8_add_kri_archive_fields.py:37-42`). One older migration (`k5l6m7n8o9p0_add_approval_cancelled_notification.py:24-26`) keeps a `pass` body with a comment "Cannot remove enum values in PostgreSQL".

### 7.3 ADR-010 governance text

`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`:

- Line 9 — quoted: `They are intentionally forward-only in production because recreating legacy archive status aliases or text-encoded JSON after application rollout would be ambiguous.`
- Line 17 — quoted: `Add reversible downgrades: rejected because the legacy status values do not preserve the pre-archive lifecycle state.`
- Line 30 — quoted: `Production rollback is restoring the pre-upgrade database snapshot. Alembic downgrade() for these revisions raises NotImplementedError and points here.`

### 7.4 Architecture-lock test enforcing the pattern

`tests/backend/pytest/architecture/test_w5_approval_scenario_roles_json_contract_red.py:39-40`:

```
assert "raise NotImplementedError" in source
assert "ADR-010" in source
```

(test reads source of `i4j5k6l7m8n9_approver_roles_to_jsonb.py` and asserts both tokens.)

## 8. Inventory: every model file under `backend/app/models/`

Glob result (`backend/app/models/*.py`, excluding `__init__.py`, `_archivable.py`, `__pycache__`):

- `activity_log.py`, `approval_request.py`, `approval_scenario.py`, `control.py`, `control_execution.py`, `department.py`, `global_config.py`, `issue.py`, `key_risk_indicator.py`, `kri_history.py`, `notification.py`, `orphaned_item.py`, `outbox_event.py`, `quarterly_metric_snapshot.py`, `refresh_token.py`, `risk.py`, `risk_questionnaire.py`, `risk_type.py`, `role.py`, `scheduler_job_run.py`, `user.py`, `vendor.py`, `vendor_control_link.py`, `vendor_kri_link.py`, `vendor_risk_link.py`.

Plus the mixin module `_archivable.py` and the package `__init__.py` (re-exports listed in `backend/app/models/__init__.py:1-98`).

## 9. Vendor table snapshot (current state, post-unify)

From `backend/app/models/vendor.py:40-103` and migration history:

- `id INT PK`, `name VARCHAR(255) indexed`, `legal_name VARCHAR(255) NULL`, `registration_id VARCHAR(100) NULL indexed`, `country VARCHAR(2) NULL`, `website VARCHAR(255) NULL`, `description TEXT NULL`.
- Structure: `process VARCHAR(255) indexed`, `subprocess VARCHAR(255) NULL indexed`, `department_id INT NULL FK departments.id` indexed.
- Ownership: `outsourcing_owner_user_id INT NOT NULL FK users.id` indexed.
- Classification: `vendor_type VARCHAR(50)` default `"other"` indexed; `risk_score_1_5 INT default 3`; booleans `supports_important_core_insurance_function`, `dora_relevant`, `is_significant_vendor`, `has_alternative_providers`; `materiality_assessed_max_impact_pct_own_funds NUMERIC(6,2) NULL`; `replaceability VARCHAR(20) NULL`.
- Lifecycle: `status VARCHAR(20) default 'active' indexed` (only enum value `active`).
- ArchivableMixin columns: `is_archived BOOL default false indexed`, `archived_at TIMESTAMPTZ NULL`, `archived_by_id INT NULL FK users.id` (FK named `fk_vendors_archived_by_id_users`).
- Timestamps: `created_at`, `updated_at` `TIMESTAMPTZ default now()` (timezonifying done by `e9c3a1b7d2f4_convert_naive_timestamps_to_timestamptz.py`).

Removed by `u1v2w3x4y5z6_remove_vendor_extended_domains.py:23-46`: `reassessment_cadence_months`, `next_reassessment_due_at`, `last_assessed_at`, `last_decided_at`, `last_reassessment_reminded_at`, `reassessment_triggered_reason`, `reassessment_triggered_at`; tables `vendor_assessments`, `vendor_contract_controls`, `vendor_exit_plans`, `vendor_contingency_plans`, `vendor_dependencies`, `vendor_relationships`, `vendor_services`, `vendor_external_signals`, `vendor_remediation_actions`, `vendor_incidents`, `vendor_sla_value_history`, `vendor_slas`, `vendor_risk_factors`. All forward-only.

## 10. KRI table snapshot (head state)

From `backend/app/models/key_risk_indicator.py:33-90`:

- `key_risk_indicators(id, risk_id FK risks.id indexed, metric_name VARCHAR(500), description TEXT, current_value FLOAT, lower_limit FLOAT, upper_limit FLOAT, unit VARCHAR(50) default '%', frequency VARCHAR(20) default 'quarterly', reporting_owner_id FK users.id NULL indexed, last_period_end DATE NULL, last_reported_at TIMESTAMPTZ default now(), last_updated TIMESTAMPTZ default now() onupdate, created_at TIMESTAMPTZ default now())`.
- Plus ArchivableMixin columns `is_archived`, `archived_at`, `archived_by_id` (FK now `fk_key_risk_indicators_archived_by_id_users` after migration `j5k6l7m8n9o0`).
- Relationships: `risk`, `reporting_owner`, `archived_by`, `history_entries`, `vendor_links`.

`KRIValueHistory` (`kri_history.py:21-63`): `kri_value_history(id, kri_id FK key_risk_indicators.id ON DELETE CASCADE indexed, period_start DATE, period_end DATE, recorded_at TIMESTAMPTZ default now(), recorded_by_id FK users.id NULL, value FLOAT, lower_limit FLOAT, upper_limit FLOAT, unit VARCHAR(50) default '%', breach_status VARCHAR(10))` plus indexes `ix_kri_value_history_kri_period_end`, `ix_kri_value_history_kri_recorded_at`.

## 11. Notes for downstream phases

(Mapped here only as raw observations from the current source.)

- Vendor link tables already share the same column shape `(id, vendor_id, target_id, created_at)` plus a 2-column unique constraint, but `vendor_kri_links` has DB-level `ON DELETE CASCADE` on FKs while `vendor_risk_links`/`vendor_control_links` do not (`v2w3x4y5z6a_..py:28-29` vs `18c1d2e3f4a5_..py:42-43,56-57`).
- `Vendor.status` is a single-value enum in both ORM and Pydantic, with the only live equality query at `_register_listings/vendors.py:161`. The legacy `inactive` value remains hard-coded inside `archived_clause` (`_archivable.py:63-71`).
- The forward-only convention is established but not yet uniform: only 6 of 87 migrations emit `NotImplementedError`; the rest still ship reversible downgrades. The architecture-lock test only enforces it for `i4j5k6l7m8n9_approver_roles_to_jsonb.py`.
