import pytest

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Permission, Role, RolePermission, User, Department
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_lookups_risk_filters_requires_risks_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    role = Role(name="no_risks_read", display_name="No Risks Read", description="Cannot read risks")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    # Intentionally do NOT grant risks:read.
    perm = Permission(resource="departments", action="read", description="Read departments")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    user = User(
        name="No Risks Read User",
        email="no-risks-read@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    resp = await client.get("/api/v1/lookups/risk-filters", headers={"X-Mock-User-Id": str(user.id)})
    assert resp.status_code == 403

