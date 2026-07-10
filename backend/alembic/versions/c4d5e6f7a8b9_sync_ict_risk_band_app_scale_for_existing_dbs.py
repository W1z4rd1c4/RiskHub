"""sync ICT risk-band parameters to app scale for existing databases

The o2p3q4r5s6t7 seed migration (issue #41) inserted all 23 ICT Register
workbook parameters at their workbook-verbatim defaults. For the four
risk-band parameters that is structurally wrong on the app side: the workbook
values 15/40/80/39 (P_RizStr/P_RizVys/P_RizKrit/P_Tolerance) live on the
workbook's 1-125 three-factor risk scale, while the app's ``Risk.net_score``
is two-factor 1-25 — 40 and 80 are unreachable, so risk bands (committee
matrix / Top-10 Pásmo, DQ-20/21) are understated on any database that never
ran the #53 cutover import. This data migration updates those four rows to
the app-scale values 3/8/16/7 (proportional ×1/5; the tolerance ceiling
floors — derivation in docs/dora-ict-register/cutover-record.md §4, SSOT
``app/services/_ict_register_reference/parameters.py``
``ICT_APP_SCALE_RISK_BAND_DEFAULTS``, parity-tested by
``tests/backend/pytest/test_ict_register_reference.py``).

Guarded: each row is updated ONLY IF it still holds the workbook-verbatim
default ('15'/'40'/'80'/'39') — operator-tuned values and the #53 cutover
import's overlay values are never clobbered. Idempotent: a second run
matches no rows.

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-10 16:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _band_row(key: str, name: str, workbook_value: str, app_value: str, meaning: str) -> dict[str, str]:
    return {
        "key": key,
        "workbook_value": workbook_value,
        "app_value": app_value,
        "description": (
            f"{meaning} — app-scale value: the workbook default {workbook_value} is on the "
            f"workbook's 1-125 three-factor risk scale; rescaled ×1/5 to the app's 1-25 "
            f"net-score scale (docs/dora-ict-register/cutover-record.md §4)."
        ),
    }


# Kept in parity with ICT_WORKBOOK_PARAMETERS (workbook_value, meaning) and
# ICT_APP_SCALE_RISK_BAND_DEFAULTS (app_value) by the reference test module.
ICT_RISK_BAND_APP_SCALE_ROWS: tuple[dict[str, str], ...] = (
    _band_row("ict_register_riz_str", "P_RizStr", "15", "3", "Risk band Střední from (gross/net >=)"),
    _band_row("ict_register_riz_vys", "P_RizVys", "40", "8", "Risk band Vysoké from"),
    _band_row("ict_register_riz_krit", "P_RizKrit", "80", "16", "Risk band Kritické from"),
    _band_row(
        "ict_register_tolerance",
        "P_Tolerance",
        "39",
        "7",
        "Net-risk tolerance ceiling (default; board approval per DORA art. 6(8)(b))",
    ),
)

_UPDATE_IF_STILL_WORKBOOK_DEFAULT = sa.text(
    """
    UPDATE global_config
    SET value = :app_value, description = :description
    WHERE key = :key AND value = :workbook_value
    """
)


def upgrade() -> None:
    """Move workbook-default risk-band rows to app scale; never clobber tuned values."""
    connection = op.get_bind()
    for row in ICT_RISK_BAND_APP_SCALE_ROWS:
        connection.execute(_UPDATE_IF_STILL_WORKBOOK_DEFAULT, row)


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
