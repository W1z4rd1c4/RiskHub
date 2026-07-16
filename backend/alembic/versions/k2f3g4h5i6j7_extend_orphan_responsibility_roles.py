"""extend orphan responsibility roles for Vendor accountability

Vendor accountability uses the same explicit, role-specific orphan workflow as
Asset responsibility. Permit the Vendor ``outsourcing_owner`` role in the
database constraint before the lifecycle service starts writing those rows.

Revision ID: k2f3g4h5i6j7
Revises: j1e2f3g4h5i6
Create Date: 2026-07-16 16:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "k2f3g4h5i6j7"
down_revision: Union[str, Sequence[str], None] = "j1e2f3g4h5i6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_orphaned_items_responsibility_role",
        "orphaned_items",
        type_="check",
    )
    op.create_check_constraint(
        "ck_orphaned_items_responsibility_role",
        "orphaned_items",
        "responsibility_role IS NULL OR responsibility_role IN "
        "('business_owner', 'ict_owner', 'outsourcing_owner')",
    )


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
