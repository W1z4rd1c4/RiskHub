"""add scheduler job run ledger

Revision ID: q7r8s9t0u1v2
Revises: p1q2r3s4t5u6
Create Date: 2026-03-07 13:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "q7r8s9t0u1v2"
down_revision: Union[str, Sequence[str], None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "scheduler_job_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_name", sa.String(length=100), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("trigger_type", sa.String(length=20), nullable=False),
        sa.Column("instance_id", sa.String(length=36), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scheduler_job_runs")),
    )
    op.create_index(op.f("ix_scheduler_job_runs_job_name"), "scheduler_job_runs", ["job_name"], unique=False)
    op.create_index(op.f("ix_scheduler_job_runs_run_id"), "scheduler_job_runs", ["run_id"], unique=False)
    op.create_index(op.f("ix_scheduler_job_runs_status"), "scheduler_job_runs", ["status"], unique=False)
    op.create_index(op.f("ix_scheduler_job_runs_instance_id"), "scheduler_job_runs", ["instance_id"], unique=False)
    op.create_index(
        "ix_scheduler_job_runs_job_started",
        "scheduler_job_runs",
        ["job_name", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_scheduler_job_runs_status_started",
        "scheduler_job_runs",
        ["status", "started_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_scheduler_job_runs_status_started", table_name="scheduler_job_runs")
    op.drop_index("ix_scheduler_job_runs_job_started", table_name="scheduler_job_runs")
    op.drop_index(op.f("ix_scheduler_job_runs_instance_id"), table_name="scheduler_job_runs")
    op.drop_index(op.f("ix_scheduler_job_runs_status"), table_name="scheduler_job_runs")
    op.drop_index(op.f("ix_scheduler_job_runs_run_id"), table_name="scheduler_job_runs")
    op.drop_index(op.f("ix_scheduler_job_runs_job_name"), table_name="scheduler_job_runs")
    op.drop_table("scheduler_job_runs")
