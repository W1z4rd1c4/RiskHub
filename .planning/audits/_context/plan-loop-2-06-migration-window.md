# Phase 3 Loop 2 — Migration Window Plan (#69 + #70 Bundle)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Planning artefact only — **no production edits**.

Single bundled commit per Loop 1 §69 commit boundary: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`. One forward-only Alembic revision touches both schema axes.

CRITICAL CONSTRAINTS:
- Single sequential developer; TDD red-green-refactor.
- Doc/lock-only Reject arguments are INVALID (orchestrator override applied to #69 + #70).
- ADR-010 forward-only — `downgrade() -> None: raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")` (precedent: `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`).
- 87 alembic revisions exist; current head is `j5k6l7m8n9o0` (file `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).

---

## Reference state confirmations

### Vendor model (`backend/app/models/vendor.py`)
- L22-23 quote: `class VendorStatus(str, PyEnum): active = "active"` — single live value.
- L82 quote: `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)` — column + index.
- L40 quote: `class Vendor(ArchivableMixin, Base):` — Vendor IS archivable; vendor-link tables are NOT.
- L89-103 — three `relationship(...)` declarations with `cascade="all, delete-orphan"` (ORM cascade).

### Vendor link models (current shape)
- `backend/app/models/vendor_risk_link.py:20` quote: `vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True, nullable=False)` — **no ondelete**.
- `backend/app/models/vendor_risk_link.py:21` quote: `risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id"), index=True, nullable=False)` — **no ondelete**.
- `backend/app/models/vendor_control_link.py:20-21` — same shape, **no ondelete**.
- `backend/app/models/vendor_kri_link.py:21-22` — both FKs ALREADY have `ondelete="CASCADE"`.

### `_archivable.py` legacy_values (last legacy "inactive" consumer)
- `backend/app/models/_archivable.py:60-64` quote: `legacy_values = { "risks": ("archived",), "controls": ("archived",), "vendors": ("inactive",), }.get(...)`.

### Pydantic schemas
- `backend/app/schemas/vendor.py:12-13` — `class VendorStatusEnum(str, Enum): active = "active"`.
- `backend/app/schemas/vendor.py:53` — `status: VendorStatusEnum = VendorStatusEnum.active` (in `VendorBase`).
- `backend/app/schemas/vendor.py:83` — `status: VendorStatusEnum | None = None` (in `VendorUpdate`).
- `backend/app/schemas/__init__.py:115,212` — re-exports of `VendorStatusEnum`.

### FK constraint naming convention
`backend/app/db/base.py:7` quote: `"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"` — confirmed FK names that need rebuild are:
- `fk_vendor_risk_links_vendor_id_vendors`
- `fk_vendor_risk_links_risk_id_risks`
- `fk_vendor_control_links_vendor_id_vendors`
- `fk_vendor_control_links_control_id_controls`

(Confirmed from runtime SQL captured in `backend/logs/app.json.log:1090,1108` showing the SQLAlchemy auto-generated names match this convention.)

### Index dropped on column drop
`backend/alembic/versions/18a1b2c3d4e5_add_vendors.py:56` quote: `op.create_index(op.f("ix_vendors_status"), "vendors", ["status"], unique=False)` — original index on status. `op.drop_index("ix_vendors_status", table_name="vendors")` is required before `op.drop_column("vendors", "status")`.

### ADR-010 forward-only precedents
- `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31` — canonical pattern.
- `backend/alembic/versions/j5k6l7m8n9o0_rename_kri_archived_by_fk.py:40-43` — head migration uses identical pattern.

---

## 1. `AbstractVendorLink` mixin (Phase 1)

### Target module path
`backend/app/models/_vendor_link_mixin.py` (new file, sibling of `_archivable.py`).

### Proposed code

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class AbstractVendorLink:
    """Shared column shape for vendor link junction tables.

    Concrete subclasses keep their own ``__tablename__``, target FK column,
    and per-target unique constraint. The mixin enforces uniform shape on
    ``id``, ``vendor_id`` (with DB-level ``ON DELETE CASCADE``), and
    ``created_at`` so all three vendor-link tables stay in sync.

    Vendor-link tables are NOT archivable; this mixin is independent of
    ``ArchivableMixin``. See ADR-005 for the archivable column-shape contract.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def vendor_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("vendors.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
```

### Column shape and ondelete strategy
- `id` PK autoincrement int — uniform across all 3.
- `vendor_id` FK to `vendors.id` with `ondelete="CASCADE"` — uniform DB-level cascade. Each subclass gets its own column via `@declared_attr` so the FK constraint name is generated per-table by the naming-convention metadata.
- `created_at` `TIMESTAMPTZ` `server_default=now()` — uniform.

### Per-target FK and unique constraint
Concrete classes still own their target FK column (`risk_id` / `control_id` / `kri_id`) and their unique constraint name (`uq_vendor_risk_link` / `uq_vendor_control_link` / `uq_vendor_kri_link`). The mixin does not redeclare those.

### Naming pattern (preserved from existing code)
- Unique constraints: `uq_vendor_<target>_link(vendor_id, <target>_id)` — preserved verbatim.
- FK constraints (from naming convention): `fk_<table>_<column>_<refclass>` — generated automatically.

---

## 2. Forward-only Alembic revision

### Revision identifier and slug
- Slug: `k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py`
- Path: `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py`
- `revision: str = "k6l7m8n9o0p1"`
- `down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"` (current head per `07-migrations-schema.md:24-27`).

### Full proposed migration body

```python
"""Unify vendor link cascade and drop Vendor.status.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-09

Forward-only per ADR-010. Bundled changes:
  * Add ON DELETE CASCADE to vendor_risk_links FKs (vendor_id, risk_id).
  * Add ON DELETE CASCADE to vendor_control_links FKs (vendor_id, control_id).
  * Drop ix_vendors_status index.
  * Drop vendors.status column (single-value enum 'active' after unify cutover).

vendor_kri_links FKs already carry ON DELETE CASCADE per
``v2w3x4y5z6a_add_vendor_kri_links.py:28-29`` and are intentionally
untouched.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        # SQLite cannot ALTER FOREIGN KEY in-place; production lane is Postgres.
        # SQLite-only test suites recreate tables from current ORM metadata.
        op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
        with op.batch_alter_table("vendors") as batch:
            batch.drop_column("status")
        return

    # 1. Rebuild vendor_risk_links FKs with ON DELETE CASCADE.
    op.drop_constraint(
        "fk_vendor_risk_links_vendor_id_vendors",
        "vendor_risk_links",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_vendor_id_vendors",
        "vendor_risk_links",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_risk_links_risk_id_risks",
        "vendor_risk_links",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_risk_id_risks",
        "vendor_risk_links",
        "risks",
        ["risk_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 2. Rebuild vendor_control_links FKs with ON DELETE CASCADE.
    op.drop_constraint(
        "fk_vendor_control_links_vendor_id_vendors",
        "vendor_control_links",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_vendor_id_vendors",
        "vendor_control_links",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_control_links_control_id_controls",
        "vendor_control_links",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_control_id_controls",
        "vendor_control_links",
        "controls",
        ["control_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 3. Drop vendors.status column (and its index).
    op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
    op.drop_column("vendors", "status")


def downgrade() -> None:
    """Forward-only; restore from a pre-upgrade snapshot per ADR-010."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
```

Notes:
- `vendor_kri_links` is intentionally absent from upgrade — its FKs already cascade per `v2w3x4y5z6a_add_vendor_kri_links.py:28-29` (verified Loop A line 158, Loop B line 158).
- No `DROP TYPE IF EXISTS vendor_status` needed — the column is `String(20)`, not a Postgres `ENUM` type. The `VendorStatus` Python `PyEnum` is application-side only; there is no DB-level enum to drop. (Verified by reading `18a1b2c3d4e5_add_vendors.py:44` — `sa.Column("status", sa.String(length=20), ...)`, plain string column.)
- `if_exists=True` on `op.drop_index` is defensive; the index was created at table init and should always be present, but the guard is cheap.
- SQLite branch handles in-memory test fixtures (architecture lock tests run against `sqlite+aiosqlite://`) where the FK rebuild is a no-op (SQLite doesn't enforce ondelete the same way) but the column drop must proceed via `batch_alter_table`.

---

## 3. Model changes (Python)

### `backend/app/models/vendor.py`
- L22-23 — DELETE `class VendorStatus(str, PyEnum): active = "active"`.
- L5 — REMOVE `from enum import Enum as PyEnum` if no other PyEnum class remains. Verify: `VendorType` (L26) and `VendorReplaceability` (L34) still use `PyEnum`. Keep the import.
- L82 — DELETE `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- L89-103 — Adjust the three relationship declarations. After DB-level `ON DELETE CASCADE` is added, `cascade="all, delete-orphan"` at the ORM level is **still needed** for in-session orphan cleanup (when `vendor.risk_links.remove(link)` flushes). Keep `cascade="all, delete-orphan"` unchanged on all three relationships. The DB-level cascade is a defense-in-depth + supports raw SQL `DELETE FROM vendors WHERE id=...`. They are complementary, not redundant.

### `backend/app/models/__init__.py`
- L34 — change `from app.models.vendor import Vendor, VendorReplaceability, VendorStatus, VendorType` to `from app.models.vendor import Vendor, VendorReplaceability, VendorType` (drop `VendorStatus`).
- L80 — remove `"VendorStatus"` from `__all__` list.

### `backend/app/models/_vendor_link_mixin.py` (new)
File contents per §1 above.

### `backend/app/models/vendor_risk_link.py`
Edit the class to inherit `(AbstractVendorLink, Base)`:

```python
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.vendor import Vendor


class VendorRiskLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_risk_links"
    __table_args__ = (UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="vendor_links")
```

Removed: local `id`, `vendor_id`, `created_at` declarations (all on mixin); also drop the `DateTime`, `Integer`, `func` imports if not used elsewhere.

### `backend/app/models/vendor_control_link.py`
Same pattern as above; replace `risk_id`/`Risk` with `control_id`/`Control` and unique constraint name `uq_vendor_control_link`.

### `backend/app/models/vendor_kri_link.py`
Same pattern; replace target column with `kri_id` FK to `key_risk_indicators.id` with `ondelete="CASCADE"`. Note: this model already had cascade on both FKs; the mixin merely formalises it on `vendor_id`.

### `backend/app/models/_archivable.py`
- L60-64 — change to:
```python
    legacy_values = {
        "risks": ("archived",),
        "controls": ("archived",),
    }.get(getattr(model, "__tablename__", ""))
```
Removing `"vendors": ("inactive",)` collapses `archived_clause(Vendor)` to `Vendor.is_archived.is_(archived)` (the early-return at L67 fires when `legacy_values` is `None`).

---

## 4. Pydantic schema changes

### `backend/app/schemas/vendor.py`
- L4 — drop `from enum import Enum` if no other `Enum` class remains. Verify: `VendorTypeEnum` (L16) and `VendorReplaceabilityEnum` (L24) still use `Enum`. Keep the import.
- L12-13 — DELETE `class VendorStatusEnum(str, Enum): active = "active"`.
- L53 (in `VendorBase`) — DELETE `status: VendorStatusEnum = VendorStatusEnum.active`.
- L83 (in `VendorUpdate`) — DELETE `status: VendorStatusEnum | None = None`.

### `backend/app/schemas/__init__.py`
- L115 — drop `VendorStatusEnum,` from the schemas import block.
- L212 — remove `"VendorStatusEnum"` from `__all__`.

### Consumer scrub
Loop B counted ~5 propagation sites in `_register_listings/vendors.py`. Confirmed grep:
- `backend/app/services/_register_listings/vendors.py:15` — `from app.schemas.vendor import VendorListResponse, VendorStatusEnum, VendorTypeEnum` — drop `VendorStatusEnum`.
- L53 — `status_filter: VendorStatusEnum | None` — drop the field.
- L89, 103, 131, 482 — propagation through `coerce_vendor_list_criteria` and `list_vendor_governance` — drop the parameter and its coercion logic.
- L516 — endpoint signature pass-through — drop the parameter.

---

## 5. Service code edits (8 prod sites + 1 seed write + 6 seed dicts)

### `backend/app/services/_register_listings/vendors.py`
The most complex edit. Drops `status_filter` end-to-end:
- L15 — drop `VendorStatusEnum` from the import line.
- L49-66 — `VendorListCriteria` dataclass: drop `status_filter: VendorStatusEnum | None` (L53) and `archived_status_filter: bool` (L54). Keep `include_archived: bool` (L55) — that's the canonical archive control.
- L85-152 — `coerce_vendor_list_criteria` signature: drop `status_filter` parameter (L89). Drop `status_filter_value` line (L103). Drop `"status": status_filter_value` entry from `filter_values` defaults (L108). Drop `status_value` and `archived_status_filter` calculation (L121-124). Drop `status_filter=...` assignment (L129-131) and `archived_status_filter=archived_status_filter,` (L132) from the `VendorListCriteria(...)` constructor.
- L155-194 — `apply_vendor_list_filters`: drop the `if criteria.archived_status_filter:` branch (L158-159) and `elif criteria.status_filter is not None:` branch (L160-162). Keep the `elif not criteria.include_archived:` branch (L163-164) which becomes `if not criteria.include_archived:`.
- L197-206 — `vendor_order_column`: drop `"status": Vendor.status,` (L200) from sort_columns map.
- L266-295 — `vendor_flag_membership_query`: drop `Vendor.status.label("status"),` (L273) from the `flag_select` projection.
- L476-516 — `list_vendor_governance`: drop `status_filter` parameter (L482) and the `status_filter=status_filter,` argument (L501) on the `coerce_vendor_list_criteria` call.

### `backend/app/services/_register_listings/controls.py:554`
- Quote: `status=link.vendor.status,`. DELETE this line (one keyword in `LinkedVendorRead` constructor).

### `backend/app/services/_register_listings/risks.py:430`
- Quote: `status=vendor.status,`. DELETE this line.

### `backend/app/services/_monitoring_response.py:219`
- Quote: `status=vendor.status,` (in `LinkedVendorRead` builder for KRI response). DELETE this line.

### `backend/app/services/_reporting/exports/rows.py:120`
- Quote: `"status": vendor.status,` (in vendor export row dict). DELETE this entry.

### `backend/app/services/_kri_history/direct_application.py:36`
- Quote: `status=link.vendor.status,` (KRI history vendor projection). DELETE this line.

### `backend/scripts/seed_e2e_vendors.py`
- L13 — change `from app.models import Vendor, VendorStatus` to `from app.models import Vendor`.
- L35, 56, 77, 98, 119, 140 — DELETE the six `"status": VendorStatus.active.value,` keys.

### `backend/scripts/seed_e2e_archives.py:283`
- Quote: `vendor.status = entry["status"]`. Replace with `vendor.is_archived = bool(entry.get("is_archived", False))` (or remove if seed already sets `is_archived` upstream — verify by reading neighbouring code in same script).

### Frontend e2e (out of scope for backend commit; flagged for Loop 6)
- `tests/frontend/e2e/vendors.spec.ts` and similar use `ensureVendorStatus(...)` helpers. These call backend endpoints and may break if the backend column is gone. Loop 6 owns repointing these helpers (e.g., `ensureVendorArchived` instead of `ensureVendorStatus(..., 'inactive')`). Flagged here, not edited.

---

## 6. TDD failing test sequence (write FIRST)

All RED tests must be present and failing on `main` before any production code edits. Each test contains its own `pytest` markers; no `client_factory` overrides needed (see "Test infra" note below).

### 6.1 `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` (model-shape)
```python
"""RED: AbstractVendorLink mixin invariants. Fails until #69 mixin lands."""
from sqlalchemy.sql.schema import Column

from app.models._vendor_link_mixin import AbstractVendorLink  # ImportError today.
from app.models import VendorRiskLink, VendorControlLink, VendorKRILink


def test_abstract_vendor_link_marked_abstract() -> None:
    assert getattr(AbstractVendorLink, "__abstract__", False) is True


def test_concrete_link_models_inherit_mixin() -> None:
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        assert issubclass(cls, AbstractVendorLink), cls.__name__


def test_vendor_id_fk_uniformly_cascades() -> None:
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        col: Column = cls.__table__.c.vendor_id
        fk = next(iter(col.foreign_keys))
        assert fk.ondelete == "CASCADE", f"{cls.__name__}.vendor_id missing cascade"


def test_unique_constraint_names_preserved() -> None:
    pairs = {
        "vendor_risk_links": "uq_vendor_risk_link",
        "vendor_control_links": "uq_vendor_control_link",
        "vendor_kri_links": "uq_vendor_kri_link",
    }
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        names = {c.name for c in cls.__table__.constraints if c.name and c.name.startswith("uq_")}
        assert pairs[cls.__tablename__] in names
```

### 6.2 `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` (model + service shape)
```python
"""RED: Vendor.status column / VendorStatusEnum / archived_clause shape."""
import pytest
from sqlalchemy.dialects import postgresql

import app.models.vendor as vendor_module
import app.schemas.vendor as schema_module
from app.models import Vendor
from app.models._archivable import archived_clause
from app.services._register_listings.vendors import VendorListCriteria, coerce_vendor_list_criteria


def test_vendor_status_column_dropped() -> None:
    assert "status" not in Vendor.__table__.c, "Vendor.status column must be dropped"


def test_vendor_status_enum_class_removed() -> None:
    assert not hasattr(vendor_module, "VendorStatus")
    assert not hasattr(schema_module, "VendorStatusEnum")


def test_archived_clause_collapsed_to_flag_only() -> None:
    clause = archived_clause(Vendor, archived=True)
    sql = str(clause.compile(dialect=postgresql.dialect()))
    assert "vendors.is_archived" in sql
    assert "vendors.status" not in sql


def test_vendor_list_criteria_has_no_status_filter() -> None:
    fields = {f.name for f in VendorListCriteria.__dataclass_fields__.values()}
    assert "status_filter" not in fields
    assert "archived_status_filter" not in fields


def test_coerce_vendor_list_criteria_signature_drops_status_filter() -> None:
    import inspect
    sig = inspect.signature(coerce_vendor_list_criteria)
    assert "status_filter" not in sig.parameters
```

### 6.3 `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` (Postgres-lane)
```python
"""RED: Postgres-lane assertions on the new migration. Skipped on sqlite."""
import pytest
from sqlalchemy import text

pytestmark = pytest.mark.postgres


@pytest.mark.asyncio
async def test_vendor_link_fks_cascade_after_upgrade(postgres_session) -> None:
    rows = await postgres_session.execute(text("""
        SELECT conname, confdeltype
        FROM pg_constraint
        WHERE conname IN (
            'fk_vendor_risk_links_vendor_id_vendors',
            'fk_vendor_risk_links_risk_id_risks',
            'fk_vendor_control_links_vendor_id_vendors',
            'fk_vendor_control_links_control_id_controls',
            'fk_vendor_kri_links_vendor_id_vendors',
            'fk_vendor_kri_links_kri_id_key_risk_indicators'
        )
    """))
    by_name = {r.conname: r.confdeltype for r in rows}
    assert len(by_name) == 6, f"missing constraints: {by_name}"
    for name, deltype in by_name.items():
        assert deltype == "c", f"{name} confdeltype={deltype!r}, expected 'c' (CASCADE)"


@pytest.mark.asyncio
async def test_vendors_status_column_absent_after_upgrade(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendors' AND column_name = 'status'
    """))
    assert row.first() is None, "vendors.status column must be dropped"


@pytest.mark.asyncio
async def test_ix_vendors_status_index_absent(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'vendors' AND indexname = 'ix_vendors_status'
    """))
    assert row.first() is None, "ix_vendors_status must be dropped with the column"
```

### 6.4 `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py`
```python
"""RED: ADR-010 forward-only contract on the new migration."""
import importlib

import pytest


def test_downgrade_raises_not_implemented() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    with pytest.raises(NotImplementedError, match="Forward-only"):
        module.downgrade()


def test_revision_chain_points_at_prior_head() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    assert module.revision == "k6l7m8n9o0p1"
    assert module.down_revision == "j5k6l7m8n9o0"


def test_migration_source_cites_adr_010() -> None:
    import inspect
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    source = inspect.getsource(module)
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
```
(Matches the lock at `tests/backend/pytest/architecture/test_w5_approval_scenario_roles_json_contract_red.py:39-40`; this new file extends the same enforcement to the new migration.)

### 6.5 Test infra notes
- Postgres-lane fixtures: existing tests under `tests/backend/pytest/migrations/` use a Postgres session via the conftest fixture chain. Confirm the chosen fixture name (likely `postgres_session` or similar) by reading any existing migration test before authoring.
- These tests do NOT use `client_factory` and do NOT install `dependency_overrides[get_db]`, so no entry in `tests/backend/pytest/_get_db_override_whitelist.toml` is required.

---

## 7. Documentation updates (in same commit)

### `backend/app/models/README.md`
Add `AbstractVendorLink` to the mixin inventory section. Cross-link to `_archivable.py`. New ~3-line bullet describing: shared shape, `__abstract__ = True`, vendor-link tables NOT archivable.

### `backend/app/services/_vendor_links/README.md`
Update the "Concrete vendor link tables" section to note that all three share `AbstractVendorLink`. Replace any line that says vendor-link cascade is "ORM-level only" with "DB-level via ON DELETE CASCADE on `vendor_id` and the target FK".

### `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`
Add a paragraph documenting that `Vendor.status` was dropped in revision `k6l7m8n9o0p1`. The legacy `("inactive",)` alias is retired; vendors archive solely via `is_archived`. Risks and controls retain their `("archived",)` alias for future cutover.

### `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`
Append a bullet under "Migration Impact":
> `vendors.status` column dropped (single-value enum `'active'` after unify cutover); `vendor_risk_links` and `vendor_control_links` FKs rebuilt with `ON DELETE CASCADE` to match `vendor_kri_links` semantics. Bundled in revision `k6l7m8n9o0p1`.

Also append to the existing list at L23-30 the row-count target: pre-upgrade snapshot must capture `SELECT COUNT(*) FROM vendors` and `SELECT COUNT(*) FROM vendor_risk_links` (and the two siblings) for post-upgrade reconciliation.

### `docs/README.md:111-112`
Remove or rewrite any sentence mentioning `Vendor.status`. (Confirmed in plan-loop-1-05 line 259.)

### `docs/DOCUMENTATION_TREE.md:84`
Same — strike `vendor.status` reference.

### `docs/BUSINESS_LOGIC.md:619`
Remove `Vendor.status` reference (backward-compat alias retirement). Replace with note that vendor lifecycle is managed exclusively through `is_archived` per ADR-005.

### Architecture-lock TOML registries
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — vendor-link tables are NOT archivable; no entry needed (Loop B confirmed).
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — review if `_vendor_link_mixin` is flagged by underscore-prefix rule. Likely tolerated (compare with `_archivable.py`).
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no change.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — no change (no endpoint touched here).

---

## 8. Sequencing within the bundled commit

Single-developer linear order. Each step is a self-contained worktree state, but only the final state is committed.

### Step 1 — RED tests (write FIRST)
1. Author `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` (§6.1).
2. Author `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` (§6.2).
3. Author `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` (§6.3).
4. Author `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` (§6.4).
5. Run `pytest tests/backend/pytest/architecture/test_vendor_link_mixin_red.py tests/backend/pytest/architecture/test_vendor_status_drop_red.py tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` and confirm RED (4 of the 4 model/migration-shape tests fail; Postgres tests skipped without postgres lane).

### Step 2 — Mixin (model-only, no DB change)
1. Create `backend/app/models/_vendor_link_mixin.py` per §1.
2. Architecture-lock test for §6.1 mostly turns GREEN (subclass-relationship still RED until step 3).

### Step 3 — Rebase concrete link models (model-only, no DB change)
1. Edit `backend/app/models/vendor_risk_link.py`, `vendor_control_link.py`, `vendor_kri_link.py` per §3.
2. Verify §6.1 tests now pass on sqlite-only model-shape lane.

### Step 4 — Generate Alembic revision (DB change here)
1. Create `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` per §2.
2. Locally bring up Postgres lane: `make -f scripts/Makefile postgres-up` (or equivalent). Run `alembic upgrade head`.
3. Run `pytest tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py -m postgres` until GREEN.
4. Capture row counts pre/post per ADR-010 rehearsal (`SELECT COUNT(*) FROM vendors`, vendor_risk_links, vendor_control_links, vendor_kri_links).

### Step 5 — Drop schema/service VendorStatus surface
1. Edit `backend/app/models/vendor.py` (delete enum + column declaration; keep import lines as needed).
2. Edit `backend/app/models/__init__.py` (drop re-export).
3. Edit `backend/app/schemas/vendor.py` (delete enum + 2 field uses).
4. Edit `backend/app/schemas/__init__.py` (drop re-export).
5. Edit the 8 production sites (§5).
6. Edit the 1 seed-write + 6 seed-dict entries (§5).
7. Run `pytest tests/backend/pytest/architecture/test_vendor_status_drop_red.py` until GREEN.

### Step 6 — Update `_archivable.py` legacy_values + lock contracts
1. Edit `backend/app/models/_archivable.py:60-64` per §3.
2. Run architecture locks: `make -f scripts/Makefile test-architecture-locks`.
3. Run any `test_e2e_seed_archive_state_red.py` and `test_w8b_archivable_encapsulation_red.py` — both already negative-assert and pass by construction.
4. Verify `test_architecture_deepening_contracts.py` still GREEN (no contract here pins `Vendor.status`).

### Step 7 — Doc updates (in same commit)
Edit the 7 docs per §7:
1. `backend/app/models/README.md`
2. `backend/app/services/_vendor_links/README.md`
3. `docs/adr/ADR-005-archivable-mixin-schema-contract.md`
4. `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`
5. `docs/README.md`
6. `docs/DOCUMENTATION_TREE.md`
7. `docs/BUSINESS_LOGIC.md`

### Step 8 — Final validation gates
1. `make -f scripts/Makefile test-architecture-locks` — expect GREEN.
2. `pytest -m postgres` (Postgres lane) — expect GREEN including the two new files.
3. `pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_e2e_seed_archive_state_red.py` — expect GREEN.
4. `mypy backend/app/`.
5. `python scripts/security/validate_authz_capability_contract.py` (no contract paths touched, but cheap smoke).
6. Note: `tests/backend/pytest/test_vendors.py:436` `assert vendor.status == "active"` — must be **deleted** (column gone). This is a non-negative assertion that fails after column drop; explicit deletion is in Step 5 service-edit fan-out.
7. Test `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37` — `VendorStatusEnum` import line and the `status=VendorStatusEnum.active.value` fixture line — must be **deleted**.
8. Test `tests/backend/pytest/test_dashboard.py:960,970,980` — `VendorStatus.active.value` lines in vendor fixtures — must be **deleted**.

### Step 9 — Commit
Single bundled commit (per Loop 1 §69, §70 commit boundary):
- Title: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`
- Bundled because:
  1. Both touch `vendor*` schema in one Alembic revision (single migration window).
  2. Both share ADR-010 forward-only entry.
  3. Both share the rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
  4. One migration window minimises operational risk.

If git diff size becomes unwieldy (>400 lines of code edits), allow split into 2 commits:
- C1 (mixin): mixin + 3 link model rebases + RED tests for §6.1, §6.4 + the doc updates in `models/README.md`, `_vendor_links/README.md`, `ADR-010` (mixin entry only). No Alembic migration in this commit.
- C2 (status drop + cascade migration): the Alembic revision + Vendor model edits + 8 service sites + seed scripts + remaining docs + RED tests for §6.2, §6.3.

Recommended: keep as **single commit** unless diff exceeds 400 lines or `mypy` cannot type-check the intermediate state cleanly.

---

## 9. Cross-domain prerequisites and notes

- **Bundling depends on Loop 4 (KRIs) NOT touching vendor_kri_links** in the same window. Confirm via `plan-loop-1-04-kris.md` that no KRI-domain item edits `vendor_kri_link.py`. If KRI loop also rebases that file, sequence one before the other (this loop first; KRI loop merges after).
- **Frontend impact** (out of scope for this commit, flag for Loop 6):
  - `LinkedVendorRead` / `Vendor` TypeScript types may carry `status?: string`. Loop 6 must prune.
  - `tests/frontend/e2e/vendors.spec.ts` uses `ensureVendorStatus(... 'inactive')` (~10 sites). These map to `is_archived=true` semantics; rename helpers to `ensureVendorArchived(...)`.
  - `tests/frontend/unit/src/e2e/apiAuth.archive-state.test.ts:114` — same.
- **ADR-010 rehearsal**: pre-merge, run the migration on a Postgres replica or fresh dev lane. Capture row counts for vendors / 3 link tables. Verify post-upgrade: 6 FKs all `confdeltype='c'`, `vendors.status` absent, `ix_vendors_status` absent.
- **No `dependency_overrides[get_db]` blocks** are introduced; `_get_db_override_whitelist.toml` does not need an entry.
- **Capability contract**: `docs/security/authorization-capability-contract.json` does NOT cite `Vendor.status` or any vendor-link cascade. No contract revalidation needed beyond the routine `validate_authz_capability_contract.py` smoke.
- **Architecture-lock dialects**: lock tests under `tests/backend/pytest/architecture/` run on sqlite by default. The `test_vendor_link_mixin_red.py` and `test_vendor_status_drop_red.py` operate on ORM metadata only (no DB), so they pass on sqlite once models are rebased. The Postgres-lane tests (§6.3) are gated behind `pytest -m postgres`.
- **No `DROP TYPE` needed**: `vendors.status` is a `String(20)` column, not a Postgres `ENUM` type. No `DROP TYPE IF EXISTS vendor_status` statement; Phase 2 plan-loop-1 mentions this guard speculatively, but reading `18a1b2c3d4e5_add_vendors.py:44` confirms `sa.String(length=20)`.

---

## 10. Effort summary

| Sub-task | Effort |
|----------|--------|
| §1 mixin file (new, ~30 lines) | XS |
| §2 Alembic revision (new, ~110 lines) | S |
| §3 model edits (5 files) | S |
| §4 schema edits (2 files) | XS |
| §5 service edits (8 prod + 1 seed-write + 6 seed-dicts) | M |
| §6 RED tests (4 new files, ~120 lines) | S |
| §7 doc updates (7 files) | S |
| §8 sequencing + validation | S |
| ADR-010 rehearsal on Postgres replica | S |

Total: **L** (1–3 dev-days for the bundled commit), aligned with Loop 1 §69+§70 bundle estimate. Architectural risk: **Medium** — single migration window, snapshot-only rollback, but precedent established 6 times in `backend/alembic/versions/`.

---

## 11. Rollback plan

Forward-only per ADR-010. Pre-merge requirements:
1. Pre-upgrade snapshot of production DB, validated as restorable.
2. Row-count capture for `vendors`, `vendor_risk_links`, `vendor_control_links`, `vendor_kri_links`.
3. Migration rehearsal on a refreshed staging clone with monitoring.

If the column drop fails post-deploy or unexpected behaviour appears:
- No in-place rollback path; `downgrade()` raises `NotImplementedError`.
- Operational rollback: restore from pre-upgrade snapshot per ADR-010 §"Rollback Strategy" (`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:30`).
- Application-level fallback: any cached frontend code referring to `vendor.status` must be redeployed simultaneously with the backend; no mid-deployment skew tolerated.

This plan adheres strictly to the architecture-lock conventions (`AGENTS.md`, `CLAUDE.md`), the TDD red-green sequence, and the ADR-010 forward-only contract. The bundled commit fits a single migration window per Loop A and Loop B's recommendation.
