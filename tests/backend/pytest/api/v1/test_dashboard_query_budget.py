from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.api.v1.endpoints.dashboard.departments import get_department_metrics
from app.models import Department, User


@contextmanager
def count_sql_statements(engine: AsyncEngine) -> Iterator[list[str]]:
    statements: list[str] = []

    def before_cursor_execute(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", before_cursor_execute)


@pytest.mark.asyncio
async def test_department_metrics_query_count_is_bounded(
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    test_user: User,
):
    db_session.add_all(
        [
            Department(name=f"Dashboard Budget Department {index}", code=f"DQB{index}", is_system=True)
            for index in range(5)
        ]
    )
    await db_session.commit()

    with count_sql_statements(async_engine) as statements:
        metrics = await get_department_metrics(
            db=db_session,
            current_user=test_user,
            department_id=None,
            include_archived=False,
        )

    assert len(metrics) >= 5
    assert len(statements) <= 8
