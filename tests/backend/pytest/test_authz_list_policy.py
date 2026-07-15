import pytest
from httpx import AsyncClient

from app.models import Department, Permission, Role, RolePermission, User
from app.models.user import AccessScope


async def _grant(db_session, role: Role, resource: str, action: str) -> None:
    permission = Permission(resource=resource, action=action, description=f"Test {resource}:{action}")
    db_session.add(permission)
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


@pytest.mark.asyncio
async def test_users_lookup_requires_users_read_before_applying_scope_filters(
    db_session,
    client_employee: AsyncClient,
):
    other_department = Department(name="Other Dept (lookup)", code="LKP-2", description="Other dept")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    resp = await client_employee.get(f"/api/v1/users/lookup?department_id={other_department.id}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_assignment_owner_lookups_use_exact_write_permission_and_department_scope(
    db_session,
    client_department_head: AsyncClient,
    test_department: Department,
    test_role_department_head: Role,
    test_user_employee: User,
):
    other_department = Department(name="Other Assignment Dept", code="ASN-2", description="Other dept")
    db_session.add(other_department)
    await db_session.flush()
    other_owner = User(
        name="Other Department Owner",
        email="other-assignment-owner@example.com",
        hashed_password="x",
        role_id=test_role_department_head.id,
        department_id=other_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(other_owner)
    await db_session.commit()

    for path in ("control-owners", "vendor-owners", "risk-owners"):
        denied = await client_department_head.get(f"/api/v1/users/lookup/{path}")
        assert denied.status_code == 403

    await _grant(db_session, test_role_department_head, "controls", "write")
    await _grant(db_session, test_role_department_head, "vendors", "write")

    for path in ("control-owners", "vendor-owners"):
        response = await client_department_head.get(f"/api/v1/users/lookup/{path}?limit=200")
        assert response.status_code == 200
        owners = response.json()
        owner_ids = {owner["id"] for owner in owners}
        assert test_user_employee.id in owner_ids
        assert other_owner.id not in owner_ids
        assert all(
            set(owner)
            == {"id", "name", "email", "role_name", "department_id", "department_name"}
            for owner in owners
        )

    risk_denied = await client_department_head.get("/api/v1/users/lookup/risk-owners")
    assert risk_denied.status_code == 403

    await _grant(db_session, test_role_department_head, "risks", "write")
    response = await client_department_head.get("/api/v1/users/lookup/risk-owners?limit=200")
    assert response.status_code == 200
    assert test_user_employee.id in {owner["id"] for owner in response.json()}
    generic_still_denied = await client_department_head.get("/api/v1/users/lookup")
    assert generic_still_denied.status_code == 403
