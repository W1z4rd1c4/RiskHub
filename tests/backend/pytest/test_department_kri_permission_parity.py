"""Independent #244 public-seam permission parity probe."""

import pytest

from app.models import Permission, Role, RolePermission, User
from app.models.user import AccessScope
from tests.backend.pytest.factories import create_test_kri, create_test_risk


@pytest.mark.asyncio
async def test_department_list_hides_kri_counts_without_risks_read(client, db_session, test_department):
    permission = Permission(resource="departments", action="read")
    role = Role(name="review_department_only", display_name="Department only")
    db_session.add_all([permission, role])
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    caller = User(
        name="Review department reader",
        email="review-department-reader@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(caller)
    await db_session.flush()
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=caller.id,
        risk_id_code="REVIEW-HIDDEN-KRI",
    )
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Private KRI",
        overrides={"current_value": 150.0, "lower_limit": 0.0, "upper_limit": 100.0},
    )
    await db_session.commit()
    headers = {"X-Mock-User-Id": str(caller.id)}
    listed = await client.get("/api/v1/departments", headers=headers)
    detail = await client.get(f"/api/v1/departments/{test_department.id}", headers=headers)
    register = await client.get("/api/v1/kris", headers=headers)
    assert listed.status_code == detail.status_code == 200
    assert register.status_code == 403
    row = next(r for r in listed.json() if r["id"] == test_department.id)
    assert detail.json()["kri_count"] is None
    assert (row["kri_count"], row["breaching_kri_count"]) == (None, None), {
        "list": row,
        "detail_kri_count": detail.json()["kri_count"],
        "register_status": register.status_code,
    }
