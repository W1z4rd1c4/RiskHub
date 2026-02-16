from __future__ import annotations

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core import schema_guard


def test_validate_schema_revisions_skips_sqlite() -> None:
    schema_guard.validate_schema_revisions(
        database_url="sqlite+aiosqlite:///:memory:",
        current_revisions={"old"},
        expected_heads={"new"},
    )


def test_validate_schema_revisions_accepts_matching_postgres() -> None:
    schema_guard.validate_schema_revisions(
        database_url="postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub",
        current_revisions={"abc123"},
        expected_heads={"abc123"},
    )


def test_validate_schema_revisions_rejects_mismatch() -> None:
    with pytest.raises(RuntimeError, match="Schema drift detected"):
        schema_guard.validate_schema_revisions(
            database_url="postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub",
            current_revisions={"abc123"},
            expected_heads={"def456"},
        )


@pytest.mark.asyncio
async def test_enforce_schema_head_wraps_query_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSqlError(SQLAlchemyError):
        pass

    monkeypatch.setattr(schema_guard, "resolve_alembic_heads", lambda: {"abc123"})

    async def broken_query(_engine):  # type: ignore[no-untyped-def]
        raise FakeSqlError("failed")

    monkeypatch.setattr(schema_guard, "_get_current_db_revisions", broken_query)

    with pytest.raises(RuntimeError, match="alembic_version"):
        await schema_guard.enforce_schema_head(
            engine=None,  # type: ignore[arg-type]
            database_url="postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub",
        )


@pytest.mark.asyncio
async def test_enforce_schema_head_accepts_matching_revisions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(schema_guard, "resolve_alembic_heads", lambda: {"abc123"})

    async def ok_query(_engine):  # type: ignore[no-untyped-def]
        return {"abc123"}

    monkeypatch.setattr(schema_guard, "_get_current_db_revisions", ok_query)

    await schema_guard.enforce_schema_head(
        engine=None,  # type: ignore[arg-type]
        database_url="postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub",
    )
