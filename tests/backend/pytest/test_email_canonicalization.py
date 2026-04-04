from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_sqlite_rejects_case_variant_user_email_duplicates(
    db_session: AsyncSession,
    test_department,
    test_role,
):
    first_user = User(
        email="case.conflict@example.com",
        hashed_password="hash",
        name="Case Conflict One",
        role_id=test_role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(first_user)
    await db_session.commit()

    duplicate_user = User(
        email="Case.Conflict@Example.com",
        hashed_password="hash",
        name="Case Conflict Two",
        role_id=test_role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(duplicate_user)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_schema_rejects_case_variant_user_email_duplicates(
    db_session: AsyncSession,
    test_department,
    test_role,
):
    connection = await db_session.connection()
    if connection.dialect.name != "postgresql":
        pytest.skip("Postgres-only schema contract")

    first_user = User(
        email="postgres.case@example.com",
        hashed_password="hash",
        name="Postgres Case One",
        role_id=test_role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(first_user)
    await db_session.commit()

    duplicate_user = User(
        email="Postgres.Case@Example.com",
        hashed_password="hash",
        name="Postgres Case Two",
        role_id=test_role.id,
        department_id=test_department.id,
        is_active=True,
    )
    db_session.add(duplicate_user)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()
