"""Approval queue status/created_at index migration contract."""

from pathlib import Path

import pytest
from sqlalchemy import text

INDEX_NAME = "ix_approval_requests_status_created_at"
MIGRATION_GLOB = "*_add_approval_request_status_created_index.py"


def _migration_source() -> str:
    versions_dir = Path(__file__).parents[4] / "backend" / "alembic" / "versions"
    matches = sorted(versions_dir.glob(MIGRATION_GLOB))
    assert len(matches) == 1, f"expected exactly one migration matching {MIGRATION_GLOB}, found {matches}"
    return matches[0].read_text()


def test_approval_request_status_created_index_migration_names_index() -> None:
    source = _migration_source()

    assert INDEX_NAME in source
    assert '"approval_requests"' in source
    assert '"status"' in source
    assert '"created_at"' in source
    assert "create_index" in source
    assert "Forward-only migration. Restore from snapshot per ADR-010." in source


def test_approval_request_status_created_index_is_in_model_metadata() -> None:
    from app.models.approval_request import ApprovalRequest

    indexes = {
        index.name: tuple(column.name for column in index.columns)
        for index in ApprovalRequest.__table__.indexes
    }

    assert indexes[INDEX_NAME] == ("status", "created_at")


@pytest.mark.postgres
async def test_approval_request_status_created_index_present_in_postgres(postgres_engine) -> None:
    async with postgres_engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'approval_requests'
                  AND indexname = :index_name
                """
            ),
            {"index_name": INDEX_NAME},
        )

    assert result.scalar_one_or_none() == INDEX_NAME
