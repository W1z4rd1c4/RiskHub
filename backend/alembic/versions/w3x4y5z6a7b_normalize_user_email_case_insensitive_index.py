"""normalize user email casing and enforce case-insensitive uniqueness

Revision ID: w3x4y5z6a7b
Revises: v2w3x4y5z6a
Create Date: 2026-04-05 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w3x4y5z6a7b"
down_revision: Union[str, Sequence[str], None] = "v2w3x4y5z6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _duplicate_normalized_emails(conn) -> list[tuple[str, int]]:
    rows = conn.execute(
        sa.text(
            """
            SELECT lower(trim(email)) AS normalized_email, COUNT(*) AS duplicate_count
            FROM users
            GROUP BY lower(trim(email))
            HAVING COUNT(*) > 1
            ORDER BY normalized_email
            """
        )
    )
    return [(str(row.normalized_email), int(row.duplicate_count)) for row in rows]


def upgrade() -> None:
    conn = op.get_bind()
    duplicates = _duplicate_normalized_emails(conn)
    if duplicates:
        details = ", ".join(f"{email} ({count})" for email, count in duplicates[:10])
        raise RuntimeError(
            "Cannot normalize users.email because duplicate case-insensitive values exist: "
            f"{details}. Resolve collisions before running this migration."
        )

    conn.execute(sa.text("UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email))"))
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index("ux_users_email_lower", "users", [sa.text("lower(email)")], unique=True)


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
