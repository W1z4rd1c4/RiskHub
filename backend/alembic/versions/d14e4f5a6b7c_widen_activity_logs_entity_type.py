"""Widen activity_logs.entity_type to support new enum names.

SQLAlchemy's Enum persistence stores Enum member names (e.g. "RISK").
The activity log table was created with a VARCHAR sized for earlier names; the
new ActivityEntityType member "RISK_QUESTIONNAIRE" exceeds that length.
"""

from alembic import op


revision = "d14e4f5a6b7c"
down_revision = "c14d0e1f2a3b"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE activity_logs ALTER COLUMN entity_type TYPE VARCHAR(32)")


def downgrade():
    # Not safely reversible if longer values exist; keep no-op.
    pass

