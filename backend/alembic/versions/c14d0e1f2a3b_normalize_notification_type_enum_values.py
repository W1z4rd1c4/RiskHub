"""Normalize notification_type enum values to SQLAlchemy Enum names.

This project uses SQLAlchemy's default Enum persistence for Python Enums, which
stores the Enum member *names* (e.g. "APPROVAL_PENDING") in Postgres.

Some older migrations added enum labels using the Enum *values* (e.g.
"approval_cancelled", "questionnaire_sent"), which causes runtime 500s when we
attempt to insert via the ORM (it inserts "APPROVAL_CANCELLED",
"QUESTIONNAIRE_SENT", etc).

This migration renames any value-based labels to their name-based equivalents
and ensures the expected name-based labels exist.
"""

from alembic import op


revision = "c14d0e1f2a3b"
down_revision = "b14c1d2e3f4a"
branch_labels = None
depends_on = None


def _rename_if_needed(old: str, new: str) -> None:
    op.execute(
        f"""
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = '{old}'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' AND e.enumlabel = '{new}'
  ) THEN
    EXECUTE 'ALTER TYPE notification_type RENAME VALUE ''{old}'' TO ''{new}''';
  END IF;
END $$;
"""
    )


def upgrade():
    _rename_if_needed("approval_cancelled", "APPROVAL_CANCELLED")
    _rename_if_needed("questionnaire_sent", "QUESTIONNAIRE_SENT")
    _rename_if_needed("questionnaire_due_soon", "QUESTIONNAIRE_DUE_SOON")
    _rename_if_needed("questionnaire_overdue", "QUESTIONNAIRE_OVERDUE")
    _rename_if_needed("questionnaire_submitted", "QUESTIONNAIRE_SUBMITTED")

    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'APPROVAL_CANCELLED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_SENT'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_DUE_SOON'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_OVERDUE'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_SUBMITTED'")


def downgrade():
    """Cannot safely remove/rename enum values in PostgreSQL - this is a no-op."""
    pass

