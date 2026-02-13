"""extend issue links with vendor contextual target

Revision ID: 13e6f7a8b9c0
Revises: 13d4e5f6a7b8
Create Date: 2026-02-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "13e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "13d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_CHECK = "(" \
    "(CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN control_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN execution_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN kri_id IS NOT NULL THEN 1 ELSE 0 END)" \
    ") = 1"

_NEW_CHECK = "(" \
    "(CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN control_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN execution_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN kri_id IS NOT NULL THEN 1 ELSE 0 END) + " \
    "(CASE WHEN vendor_id IS NOT NULL THEN 1 ELSE 0 END)" \
    ") = 1"


def upgrade() -> None:
    op.add_column("issue_links", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.create_index("ix_issue_links_vendor_id", "issue_links", ["vendor_id"], unique=False)
    op.create_foreign_key(
        "fk_issue_links_vendor_id_vendors",
        "issue_links",
        "vendors",
        ["vendor_id"],
        ["id"],
    )

    op.drop_constraint("ck_issue_links_exactly_one_target", "issue_links", type_="check")
    op.create_check_constraint("ck_issue_links_exactly_one_target", "issue_links", _NEW_CHECK)


def downgrade() -> None:
    op.drop_constraint("ck_issue_links_exactly_one_target", "issue_links", type_="check")
    op.create_check_constraint("ck_issue_links_exactly_one_target", "issue_links", _OLD_CHECK)

    op.drop_constraint("fk_issue_links_vendor_id_vendors", "issue_links", type_="foreignkey")
    op.drop_index("ix_issue_links_vendor_id", table_name="issue_links")
    op.drop_column("issue_links", "vendor_id")
