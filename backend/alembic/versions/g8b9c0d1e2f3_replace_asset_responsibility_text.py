"""replace Asset responsibility text with canonical relationships and codes

Revision ID: g8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-15 18:15:00.000000

Relationship columns remain nullable for historical rows; the application
requires all three for newly created active Assets. Legacy responsibility
strings are deliberately discarded rather than guessed or reconciled.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CANONICAL_VALUE_UPDATES: dict[str, tuple[tuple[str, str], ...]] = {
    "asset_type": (
        ("Aplikace", "application"),
        ("Databáze", "database"),
        ("Infrastruktura", "infrastructure"),
        ("Síťový prvek", "network_component"),
        ("Hardware", "hardware"),
        ("Cloud služba", "cloud_service"),
        ("Datové úložiště", "data_storage"),
        ("Informační aktivum", "information_asset"),
        ("Bezpečnostní aktivum", "security_asset"),
        ("BCM/DR aktivum", "bcm_dr_asset"),
        ("Jiné", "other"),
    ),
    "asset_level": (
        ("A – primární", "primary"),
        ("B – podpůrné", "supporting"),
        ("C – infrastrukturní", "infrastructure"),
    ),
    "deployment_model": (
        ("On-premise", "on_premise"),
        ("Cloud", "cloud"),
        ("SaaS", "saas"),
        ("PaaS", "paas"),
        ("IaaS", "iaas"),
        ("Hybrid", "hybrid"),
        ("Externě hostováno", "externally_hosted"),
        ("Neposouzeno", "not_assessed"),
        ("Nerelevantní", "not_applicable"),
    ),
    "gdpr_relevance": (("Ano", "yes"), ("Ne", "no"), ("Neurčeno", "undetermined")),
    "ai_relevance": (("Ano", "yes"), ("Ne", "no"), ("Neurčeno", "undetermined")),
    "data_classification": (
        ("Bez dat / nerelevantní", "no_data_not_applicable"),
        ("Veřejná data", "public"),
        ("Interní data", "internal"),
        ("Důvěrná data", "confidential"),
        ("Vysoce důvěrná / regulovaná data", "highly_confidential_regulated"),
        ("Neposouzeno", "not_assessed"),
    ),
    "internet_exposed": (("Ano", "yes"), ("Ne", "no")),
    "preliminary_criticality": (
        ("Nízká", "low"),
        ("Střední", "medium"),
        ("Vysoká", "high"),
        ("Kritická", "critical"),
    ),
    "lifecycle_state": (
        ("V provozu", "operational"),
        ("Ve vývoji", "in_development"),
        ("Utlumováno", "being_decommissioned"),
        ("Legacy", "legacy"),
        ("Vyřazeno", "retired"),
    ),
    "review_state": (("K revizi", "review_required"), ("Zkontrolováno", "reviewed")),
}


def upgrade() -> None:
    for column_name in (
        "business_owner_user_id",
        "ict_owner_user_id",
        "owning_department_id",
    ):
        op.add_column("assets", sa.Column(column_name, sa.Integer(), nullable=True))
        op.create_index(f"ix_assets_{column_name}", "assets", [column_name], unique=False)

    op.create_foreign_key(
        "fk_assets_business_owner_user_id_users",
        "assets",
        "users",
        ["business_owner_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_assets_ict_owner_user_id_users",
        "assets",
        "users",
        ["ict_owner_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_assets_owning_department_id_departments",
        "assets",
        "departments",
        ["owning_department_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.add_column(
        "orphaned_items",
        sa.Column("responsibility_role", sa.String(length=30), nullable=True),
    )
    op.create_index(
        "ix_orphaned_items_responsibility_role",
        "orphaned_items",
        ["responsibility_role"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_orphaned_items_responsibility_role",
        "orphaned_items",
        "responsibility_role IS NULL OR responsibility_role IN ('business_owner', 'ict_owner')",
    )
    pending_role = sa.text("status = 'pending' AND responsibility_role IS NOT NULL")
    op.create_index(
        "uq_orphaned_items_pending_item_role",
        "orphaned_items",
        ["item_type", "item_id", "responsibility_role"],
        unique=True,
        postgresql_where=pending_role,
        sqlite_where=pending_role,
    )

    conn = op.get_bind()
    assets = sa.table(
        "assets",
        *(sa.column(column, sa.String()) for column in _CANONICAL_VALUE_UPDATES),
    )
    for column, replacements in _CANONICAL_VALUE_UPDATES.items():
        for source_value, canonical_code in replacements:
            conn.execute(assets.update().where(assets.c[column] == source_value).values({column: canonical_code}))

    # Deliberately no owner-string reconciliation or dual-write compatibility.
    op.drop_column("assets", "business_owner")
    op.drop_column("assets", "owner_department")
    op.drop_column("assets", "ict_owner")


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
