"""Unify vendor link cascade and drop Vendor.status.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-10

Forward-only per ADR-010. Bundled changes:
  * Add ON DELETE CASCADE to vendor_risk_links FKs.
  * Add ON DELETE CASCADE to vendor_control_links FKs.
  * Recreate vendor_kri_links FKs with canonical names.
  * Drop ix_vendors_status index.
  * Drop vendors.status column.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def check_no_link_orphans(connection) -> None:
    """Refuse to apply if FK-orphan link rows already exist."""

    for table, fk_col, ref_table in (
        ("vendor_risk_links", "vendor_id", "vendors"),
        ("vendor_risk_links", "risk_id", "risks"),
        ("vendor_control_links", "vendor_id", "vendors"),
        ("vendor_control_links", "control_id", "controls"),
        ("vendor_kri_links", "vendor_id", "vendors"),
        ("vendor_kri_links", "kri_id", "key_risk_indicators"),
    ):
        rows = connection.execute(
            text(
                f"SELECT id FROM {table} l "
                f"WHERE NOT EXISTS (SELECT 1 FROM {ref_table} r WHERE r.id = l.{fk_col})"
            )
        ).all()
        if rows:
            ids = [r[0] for r in rows]
            raise ValueError(f"orphan {table}.{fk_col} rows: {ids}")


def _existing_fk_name(connection, *, table: str, column: str, ref_table: str) -> str | None:
    row = connection.execute(
        text(
            """
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.contype = 'f'
              AND c.conrelid = to_regclass(:table)
              AND c.confrelid = to_regclass(:ref_table)
              AND a.attname = :column
            LIMIT 1
            """
        ),
        {"table": table, "column": column, "ref_table": ref_table},
    ).first()
    return row[0] if row is not None else None


def _drop_fk_for_column(connection, *, table: str, column: str, ref_table: str) -> None:
    fk_name = _existing_fk_name(connection, table=table, column=column, ref_table=ref_table)
    if fk_name is not None:
        op.drop_constraint(fk_name, table, type_="foreignkey")


def upgrade() -> None:
    bind = op.get_bind()
    check_no_link_orphans(bind)

    if bind.dialect.name == "sqlite":
        op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
        with op.batch_alter_table("vendors") as batch:
            batch.drop_column("status")
        return

    _drop_fk_for_column(bind, table="vendor_risk_links", column="vendor_id", ref_table="vendors")
    op.create_foreign_key(
        "fk_vendor_risk_links_vendor_id_vendors",
        "vendor_risk_links",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="CASCADE",
    )
    _drop_fk_for_column(bind, table="vendor_risk_links", column="risk_id", ref_table="risks")
    op.create_foreign_key(
        "fk_vendor_risk_links_risk_id_risks",
        "vendor_risk_links",
        "risks",
        ["risk_id"],
        ["id"],
        ondelete="CASCADE",
    )

    _drop_fk_for_column(bind, table="vendor_control_links", column="vendor_id", ref_table="vendors")
    op.create_foreign_key(
        "fk_vendor_control_links_vendor_id_vendors",
        "vendor_control_links",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="CASCADE",
    )
    _drop_fk_for_column(bind, table="vendor_control_links", column="control_id", ref_table="controls")
    op.create_foreign_key(
        "fk_vendor_control_links_control_id_controls",
        "vendor_control_links",
        "controls",
        ["control_id"],
        ["id"],
        ondelete="CASCADE",
    )
    _drop_fk_for_column(bind, table="vendor_kri_links", column="vendor_id", ref_table="vendors")
    op.create_foreign_key(
        "fk_vendor_kri_links_vendor_id_vendors",
        "vendor_kri_links",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="CASCADE",
    )
    _drop_fk_for_column(bind, table="vendor_kri_links", column="kri_id", ref_table="key_risk_indicators")
    op.create_foreign_key(
        "fk_vendor_kri_links_kri_id_key_risk_indicators",
        "vendor_kri_links",
        "key_risk_indicators",
        ["kri_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
    op.drop_column("vendors", "status")


def downgrade() -> None:
    """Forward-only per ADR-010; restore from a pre-upgrade snapshot."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
