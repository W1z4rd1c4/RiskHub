"""normalize_control_frequency_and_add_check

Revision ID: 13c2d3e4f5a7
Revises: 13b1c2d3e4f6
Create Date: 2026-02-11 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "13c2d3e4f5a7"
down_revision: Union[str, Sequence[str], None] = "13b1c2d3e4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ALLOWED_FREQUENCIES: tuple[str, ...] = (
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "semi-annually",
    "annually",
    "ad_hoc",
    "continuous",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # Normalize legacy aliases to canonical value.
    bind.execute(
        sa.text(
            """
            UPDATE controls
            SET frequency = 'semi-annually'
            WHERE lower(trim(frequency)) IN (
                'semi_annually',
                'semi annually',
                'semiannual',
                'semi-annual'
            )
            """
        )
    )

    invalid_rows = bind.execute(
        sa.text(
            """
            SELECT DISTINCT frequency
            FROM controls
            WHERE frequency IS NOT NULL
              AND frequency NOT IN :allowed_values
            ORDER BY frequency
            """
        ).bindparams(sa.bindparam("allowed_values", expanding=True)),
        {"allowed_values": ALLOWED_FREQUENCIES},
    ).scalars().all()

    if invalid_rows:
        invalid_values = ", ".join(str(value) for value in invalid_rows)
        raise RuntimeError(
            "Cannot add controls.frequency constraint. "
            f"Unsupported values found: {invalid_values}"
        )

    op.create_check_constraint(
        "ck_controls_frequency_allowed_values",
        "controls",
        "frequency IN ('daily', 'weekly', 'monthly', 'quarterly', "
        "'semi-annually', 'annually', 'ad_hoc', 'continuous')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_controls_frequency_allowed_values", "controls", type_="check")
