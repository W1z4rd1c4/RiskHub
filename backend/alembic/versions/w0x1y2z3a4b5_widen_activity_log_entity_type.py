"""widen activity log entity type

Widen activity_logs.entity_type to VARCHAR(64) (issue #46, fixing a #45
defect found live by E2E). SQLAlchemy's non-native Enum persistence stores
member NAMES, and migration 18b1c2d3e4f5 re-sized the column to VARCHAR(18)
— its longest enumerated value at the time (risk_questionnaire) — so #45's
22-char VENDOR_SUB_OUTSOURCING rows overflow with a
StringDataRightTruncationError on any alembic-migrated Postgres (SQLite
ignores VARCHAR lengths, which is why the backend suite never saw it). The
register keeps adding members (PROCESS_LINK ships in this change), so the
64-char headroom is deliberate. Uses the SQLite-safe batch convention
(precedents: d14e4f5a6b7c, the t7u8v9w0x1y2 replaceability widen); the model
column carries the same explicit length so model<->migration parity holds
(guarded by tests/backend/pytest/test_ict_register_vendor_links.py).

Revision ID: w0x1y2z3a4b5
Revises: v9w0x1y2z3a4
Create Date: 2026-07-10 12:15:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "w0x1y2z3a4b5"
down_revision: Union[str, Sequence[str], None] = "v9w0x1y2z3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "entity_type",
            existing_type=sa.Enum(name="activity_entity_type", native_enum=False),
            type_=sa.String(length=64),
            existing_nullable=False,
        )


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
