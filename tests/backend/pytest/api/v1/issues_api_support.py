from __future__ import annotations

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department


@pytest_asyncio.fixture
async def second_department(db_session: AsyncSession) -> Department:
    department = Department(name="Second Department", code="SEC", description="Second department")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department
