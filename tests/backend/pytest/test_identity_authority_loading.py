"""Public identity edits retain eagerly loaded authority in fresh sessions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import User


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["users", "access/users"])
async def test_user_update_policy_with_fresh_authority_relationships(
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    client_factory,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
    route: str,
):
    """A subordinate reload must not expire its manager's authorization graph."""
    # Admin owns identity edits; only CRO can reach business-access validation.
    actor = test_user if route == "users" else test_user_cro
    subordinate = User(
        name="Managed subordinate",
        email="managed-subordinate@example.com",
        role_id=actor.role_id,
        department_id=test_user_employee.department_id,
        manager_id=test_user_employee.id,
        is_active=True,
    )
    db_session.add(subordinate)
    await db_session.commit()
    manager_id = test_user_employee.id
    subordinate_id = subordinate.id
    session_maker = async_sessionmaker(async_engine, expire_on_commit=False)

    async def independent_db():
        async with session_maker() as session:
            yield session

    async with client_factory(user=actor, db_override=independent_db) as client:
        response = await client.patch(
            f"/api/v1/{route}/{manager_id}", json={"manager_id": subordinate_id}
        )
        if route == "users":
            assert response.status_code == 403, response.json()
            assert response.json()["detail"] == "Only CRO can update user business access fields"
            # Keep the original fresh-session authority-loading regression on
            # a permitted Admin mutation, not just the early refusal path.
            identity_edit = await client.patch(
                f"/api/v1/users/{manager_id}", json={"name": "Updated manager identity"}
            )
            assert identity_edit.status_code == 200, identity_edit.json()
            assert identity_edit.json()["name"] == "Updated manager identity"
        else:
            assert response.status_code == 400, response.json()
            assert response.json()["detail"] == "User manager hierarchy cannot contain a cycle"

    async with session_maker() as session:
        manager = await session.get(User, manager_id)
        subordinate = await session.get(User, subordinate_id)
        assert manager.manager_id is None
        assert subordinate.manager_id == manager_id
        if route == "users":
            assert manager.name == "Updated manager identity"
