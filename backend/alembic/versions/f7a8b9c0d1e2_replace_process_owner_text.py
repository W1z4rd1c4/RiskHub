"""replace Process owner text with canonical relationships and codes

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-15 16:15:00.000000

The relationship columns remain nullable for historical rows. The application
boundary requires both relationships for new active Processes. Legacy owner
strings are deliberately discarded rather than guessed or reconciled.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CANONICAL_VALUE_UPDATES: dict[str, tuple[tuple[str, str], ...]] = {
    "preliminary_criticality": (
        ("Nízká", "low"),
        ("Střední", "medium"),
        ("Vysoká", "high"),
        ("Kritická", "critical"),
    ),
    "cif_override": (("Ano", "yes"), ("Ne", "no")),
    "licensed_activity": (
        ("Neživotní pojištění", "non_life_insurance"),
        ("Podpůrné funkce", "support_functions"),
    ),
    "bcm_link": (
        ("Ano", "yes"),
        ("Ne", "no"),
        ("Neposouzeno", "not_assessed"),
        ("Nerelevantní", "not_applicable"),
    ),
    "dr_test_result": (
        ("Úspěšný", "successful"),
        ("S výhradami", "qualified"),
        ("Neúspěšný", "unsuccessful"),
        ("Netestováno", "not_tested"),
    ),
    "interruption_impact": (
        ("Nízký", "low"),
        ("Střední", "medium"),
        ("Vysoký", "high"),
        ("Neposouzeno", "not_assessed"),
    ),
}


def upgrade() -> None:
    op.add_column("processes", sa.Column("process_owner_user_id", sa.Integer(), nullable=True))
    op.add_column("processes", sa.Column("owning_department_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_processes_process_owner_user_id",
        "processes",
        ["process_owner_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_processes_owning_department_id",
        "processes",
        ["owning_department_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_processes_process_owner_user_id_users",
        "processes",
        "users",
        ["process_owner_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_processes_owning_department_id_departments",
        "processes",
        "departments",
        ["owning_department_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    conn = op.get_bind()
    processes = sa.table(
        "processes",
        *(sa.column(column, sa.String()) for column in _CANONICAL_VALUE_UPDATES),
    )
    for column, replacements in _CANONICAL_VALUE_UPDATES.items():
        for source_value, canonical_code in replacements:
            conn.execute(
                processes.update()
                .where(processes.c[column] == source_value)
                .values({column: canonical_code})
            )

    # Deliberately no owner-string reconciliation or dual-write compatibility.
    op.drop_column("processes", "owner")
    op.drop_column("processes", "owner_department")


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
