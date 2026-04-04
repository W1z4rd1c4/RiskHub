from __future__ import annotations

from datetime import UTC

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_department_server_default_timestamps_are_timezone_aware(db_session: AsyncSession) -> None:
    department = Department(
        name="Postgres Timestamp Department",
        code="PG-TZ",
        description="Validates timestamptz round-trip behavior",
    )
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)

    assert department.created_at.tzinfo is not None
    assert department.created_at.utcoffset() is not None
    assert department.created_at.astimezone(UTC).tzinfo == UTC
