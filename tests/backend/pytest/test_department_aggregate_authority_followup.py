"""Separate follow-up: domain-denied Department aggregates must be unavailable."""

import pytest

from app.models import Permission, Role, RolePermission, User
from app.models.user import AccessScope
from tests.backend.pytest.factories import create_test_control, create_test_risk


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "can_read_risks,can_read_controls", [(False, False), (True, False), (False, True), (True, True)]
)
async def test_department_list_domain_aggregates_match_detail_authority(
    client, db_session, test_department, can_read_risks, can_read_controls, monkeypatch
):
    role = Role(name="department_aggregate_reader", display_name="Department aggregate reader")
    permissions = [Permission(resource="departments", action="read")]
    if can_read_risks:
        permissions.append(Permission(resource="risks", action="read"))
    if can_read_controls:
        permissions.append(Permission(resource="controls", action="read"))
    db_session.add_all([role, *permissions])
    await db_session.flush()
    db_session.add_all([RolePermission(role_id=role.id, permission_id=p.id) for p in permissions])
    actor = User(
        name="Aggregate reader",
        email="aggregate-reader@example.test",
        role_id=role.id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(actor)
    await db_session.flush()
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=actor.id,
        risk_id_code="R-PRIVATE-AGGREGATE",
        overrides={"net_probability": 4, "net_impact": 4, "net_score": 16},
    )
    await create_test_control(
        db_session, department_id=test_department.id, owner_id=actor.id, name="Private control aggregate"
    )
    async def forbidden_aggregate(*args, **kwargs):
        pytest.fail("A denied domain aggregate must not be queried")

    list_module = "app.api.v1.endpoints.departments.list"
    if not can_read_risks:
        for helper in ("_count_risks_by_dept", "_count_high_risks_by_dept", "_sum_net_scores_by_dept"):
            monkeypatch.setattr(f"{list_module}.{helper}", forbidden_aggregate)
    if not can_read_controls:
        monkeypatch.setattr(f"{list_module}._count_controls_by_dept", forbidden_aggregate)
    headers = {"X-Mock-User-Id": str(actor.id)}
    listed = await client.get("/api/v1/departments", headers=headers)
    detail = await client.get(f"/api/v1/departments/{test_department.id}", headers=headers)
    risk_register = await client.get("/api/v1/risks", headers=headers)
    control_register = await client.get("/api/v1/controls", headers=headers)
    assert listed.status_code == detail.status_code == 200
    assert risk_register.status_code == (200 if can_read_risks else 403)
    assert control_register.status_code == (200 if can_read_controls else 403)
    row = next(row for row in listed.json() if row["id"] == test_department.id)
    expected = {
        "risk_count": 1 if can_read_risks else None,
        "high_risk_count": int(risk.net_score >= 10) if can_read_risks else None,
        "total_net_score": risk.net_score if can_read_risks else None,
        "control_count": 1 if can_read_controls else None,
    }
    # Detail already honors these domain-denied unavailable states.
    for key in ("risk_count", "high_risk_count", "control_count"):
        assert detail.json()[key] == expected[key]
    assert {key: row[key] for key in expected} == expected


@pytest.mark.asyncio
async def test_department_list_user_count_matches_denied_roster_authority(client, db_session, test_department):
    role = Role(name="department_shell_only", display_name="Department shell only")
    permission = Permission(resource="departments", action="read")
    db_session.add_all([role, permission])
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    actor = User(
        name="Shell reader",
        email="shell-reader@example.test",
        role_id=role.id,
        department_id=test_department.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db_session.add(actor)
    await db_session.commit()
    headers = {"X-Mock-User-Id": str(actor.id)}
    listed = await client.get("/api/v1/departments", headers=headers)
    detail = await client.get(f"/api/v1/departments/{test_department.id}", headers=headers)
    roster = await client.get(
        "/api/v1/access/users/my-department", params={"department_id": test_department.id}, headers=headers
    )
    assert listed.status_code == detail.status_code == 200
    assert roster.status_code == 403
    row = next(row for row in listed.json() if row["id"] == test_department.id)
    assert detail.json()["user_count"] is None
    assert row["user_count"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_kind", ["department_head", "department_head_global", "cro", "admin"])
async def test_department_list_roster_count_reuses_target_and_admin_concealment(client, db_session, actor_kind):
    from app.models import Department
    from app.models.role import RoleType

    role_names = {"department_head": RoleType.DEPARTMENT_HEAD, "cro": RoleType.CRO, "admin": RoleType.ADMIN}
    roles = {key: Role(name=value, display_name=key) for key, value in role_names.items()}
    employee_role = Role(name=RoleType.EMPLOYEE, display_name="Employee")
    own = Department(name="Roster count target", code="COUNT-TARGET", is_system=True)
    empty = Department(name="Roster count empty", code="COUNT-EMPTY", is_system=True)
    dept_read = Permission(resource="departments", action="read")
    users_read = Permission(resource="users", action="read")
    db_session.add_all([*roles.values(), employee_role, own, empty, dept_read, users_read])
    await db_session.flush()
    is_head = actor_kind.startswith("department_head")
    actor_role = roles["department_head" if is_head else actor_kind]
    db_session.add(RolePermission(role_id=actor_role.id, permission_id=dept_read.id))
    if not is_head:
        db_session.add(RolePermission(role_id=actor_role.id, permission_id=users_read.id))
    actor = User(
        name="Roster count actor",
        email="roster-count-actor@example.test",
        role_id=actor_role.id,
        department_id=own.id if is_head else None,
        access_scope=AccessScope.DEPARTMENT if actor_kind == "department_head" else AccessScope.GLOBAL,
        is_active=True,
    )
    employee = User(
        name="Visible employee",
        email="visible-count@example.test",
        role_id=employee_role.id,
        department_id=own.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    admin = User(
        name="Platform admin decoy",
        email="admin-count@example.test",
        role_id=roles["admin"].id,
        department_id=own.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    inactive = User(
        name="Inactive decoy",
        email="inactive-count@example.test",
        role_id=employee_role.id,
        department_id=own.id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=False,
    )
    db_session.add_all([actor, employee, admin, inactive])
    await db_session.commit()
    headers = {"X-Mock-User-Id": str(actor.id)}
    listed = await client.get("/api/v1/departments", headers=headers)
    detail = await client.get(f"/api/v1/departments/{own.id}", headers=headers)
    roster = await client.get("/api/v1/access/users/my-department", params={"department_id": own.id}, headers=headers)
    assert listed.status_code == detail.status_code == roster.status_code == 200
    ids = {row["id"] for row in roster.json()}
    expected = {employee.id}
    if is_head:
        expected.add(actor.id)
    if actor_kind == "admin":
        expected.add(admin.id)
    assert ids == expected
    rows = {row["id"]: row for row in listed.json()}
    assert rows[own.id]["user_count"] == detail.json()["user_count"] == len(expected)
    empty_roster = await client.get(
        "/api/v1/access/users/my-department", params={"department_id": empty.id}, headers=headers
    )
    if is_head:
        assert empty_roster.status_code == 403
        # Department Head authority remains own-department only, without users:read.
        if actor_kind == "department_head_global":
            assert empty.id in rows
            assert rows[empty.id]["user_count"] is None
        else:
            assert empty.id not in rows
    else:
        assert empty_roster.status_code == 200
        assert empty_roster.json() == []
        assert rows[empty.id]["user_count"] == 0
