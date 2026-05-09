"""
Tests for Control API endpoints.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Control, ControlRiskLink, Department, Permission, Risk, Role, RolePermission, User
from app.models.user import AccessScope


async def _grant_control_permissions(db_session, role: Role, actions: list[str]) -> None:
    for action in actions:
        permission = (
            await db_session.execute(
                select(Permission).where(Permission.resource == "controls", Permission.action == action)
            )
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(resource="controls", action=action, description=f"controls:{action}")
            db_session.add(permission)
            await db_session.flush()

        existing = (
            await db_session.execute(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))

    await db_session.commit()


@pytest.mark.asyncio
async def test_create_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test creating a new control."""
    response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Test Control",
            "description": "A test control for verification",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Control"
    assert data["status"] == "active"
    assert data["capabilities"]["can_read"] is True
    assert data["capabilities"]["can_update"] is True
    assert data["capabilities"]["can_log_execution"] is True
    assert data["capabilities"]["is_executable"] is True


@pytest.mark.asyncio
async def test_list_controls(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test listing controls with pagination."""
    # Create a control first
    await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "List Test Control",
            "description": "Control for list test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "automatic",
            "frequency": "daily",
            "risk_level": 2,
            "status": "active",
        },
    )

    response = await auth_client.get("/api/v1/controls")

    assert response.status_code == 200
    data = response.json().get("items", [])
    assert isinstance(data, list)
    assert len(data) >= 1
    item = next(entry for entry in data if entry["name"] == "List Test Control")
    assert item["capabilities"]["can_view_executions"] is True
    assert item["capabilities"]["can_link_risk"] is True


@pytest.mark.asyncio
async def test_list_controls_shows_linked_risk_visible_by_direct_ownership(
    client_employee: AsyncClient,
    db_session,
    test_department: Department,
    test_user_employee: User,
):
    other_department = Department(name="Control Risk Owner Other", code="CROO", is_active=True)
    db_session.add(other_department)
    await db_session.flush()

    owned_cross_department_risk = Risk(
        risk_id_code="RISK-CTRL-OWNER",
        name="Directly Owned Cross Department Risk",
        process="Owner Visible Process",
        description="Direct ownership should make this linked risk visible",
        category="Operational",
        department_id=other_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    hidden_cross_department_risk = Risk(
        risk_id_code="RISK-CTRL-HIDDEN",
        name="Hidden Cross Department Risk",
        process="Hidden Process",
        description="Unowned cross-department risk should remain hidden",
        category="Operational",
        department_id=other_department.id,
        owner_id=None,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    owned_risk_control = Control(
        name="Control Linked To Direct Owner Risk",
        description="Control visible in the user's department",
        department_id=test_department.id,
        control_owner_id=test_user_employee.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    hidden_risk_control = Control(
        name="Control Linked To Hidden Risk",
        description="Control visible in the user's department",
        department_id=test_department.id,
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add_all(
        [
            owned_cross_department_risk,
            hidden_cross_department_risk,
            owned_risk_control,
            hidden_risk_control,
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            ControlRiskLink(
                control_id=owned_risk_control.id,
                risk_id=owned_cross_department_risk.id,
                effectiveness="medium",
            ),
            ControlRiskLink(
                control_id=hidden_risk_control.id,
                risk_id=hidden_cross_department_risk.id,
                effectiveness="medium",
            ),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/controls")

    assert response.status_code == 200
    items = response.json()["items"]
    owned_item = next(item for item in items if item["id"] == owned_risk_control.id)
    hidden_item = next(item for item in items if item["id"] == hidden_risk_control.id)
    assert owned_item["risk_name"] == owned_cross_department_risk.name
    assert owned_item["risk_id_code"] == owned_cross_department_risk.risk_id_code
    assert hidden_item["risk_name"] is None
    assert hidden_item["risk_id_code"] is None


@pytest.mark.asyncio
async def test_control_linked_risks_show_direct_owner_risk_and_redact_hidden_risk(
    client_employee: AsyncClient,
    db_session,
    test_department: Department,
    test_user_employee: User,
):
    other_department = Department(name="Control Link Risk Other", code="CLRO", is_active=True)
    db_session.add(other_department)
    await db_session.flush()

    visible_risk = Risk(
        risk_id_code="RISK-LINK-OWNER",
        name="Linked Direct Owner Risk",
        process="Visible Process",
        description="Directly owned linked risk",
        category="Operational",
        department_id=other_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    hidden_risk = Risk(
        risk_id_code="RISK-LINK-HIDDEN",
        name="Linked Hidden Risk",
        process="Hidden Process",
        description="Cross-department hidden linked risk",
        category="Operational",
        department_id=other_department.id,
        owner_id=None,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
    )
    control = Control(
        name="Control Linked Risk Redaction",
        description="Control visible in user's department",
        department_id=test_department.id,
        control_owner_id=None,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add_all([visible_risk, hidden_risk, control])
    await db_session.flush()
    db_session.add_all(
        [
            ControlRiskLink(control_id=control.id, risk_id=visible_risk.id, effectiveness="medium"),
            ControlRiskLink(control_id=control.id, risk_id=hidden_risk.id, effectiveness="medium"),
        ]
    )
    await db_session.commit()

    response = await client_employee.get(f"/api/v1/controls/{control.id}/risks")

    assert response.status_code == 200
    links = sorted(response.json(), key=lambda link: link["risk_id"])
    visible_link = next(link for link in links if link["risk_id"] == visible_risk.id)
    hidden_link = next(link for link in links if link["risk_id"] == hidden_risk.id)
    assert visible_link["risk"]["name"] == visible_risk.name
    assert hidden_link["risk"] is None


@pytest.mark.asyncio
async def test_control_linked_risk_payload_includes_archive_state(
    auth_client: AsyncClient,
    db_session,
    test_department: Department,
    test_user: User,
):
    """Linked risk payloads must carry archive truth separately from lifecycle status."""
    archived_risk = Risk(
        risk_id_code="RISK-LINK-ARCHIVED",
        name="Archived linked risk",
        process="Archive payload",
        description="Archived linked risk normalized to active lifecycle status",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
        is_archived=True,
    )
    control = Control(
        name="Control Linked Archived Risk",
        description="Control with archived linked risk",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add_all([archived_risk, control])
    await db_session.flush()
    db_session.add(ControlRiskLink(control_id=control.id, risk_id=archived_risk.id, effectiveness="medium"))
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/controls/{control.id}/risks")

    assert response.status_code == 200
    link = next(item for item in response.json() if item["risk_id"] == archived_risk.id)
    assert link["risk"]["status"] == "active"
    assert link["risk"]["is_archived"] is True


@pytest.mark.asyncio
async def test_list_controls_normalizes_legacy_semi_annual_frequency(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """List endpoint should normalize legacy semi-annual frequency aliases."""
    legacy_control = Control(
        name="Legacy Frequency List Control",
        description="Control with legacy frequency alias",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="semi_annually",
        risk_level=3,
        status="active",
    )
    db_session.add(legacy_control)
    await db_session.commit()
    await db_session.refresh(legacy_control)

    response = await auth_client.get("/api/v1/controls?include_archived=true")
    assert response.status_code == 200

    item = next(
        (entry for entry in response.json()["items"] if entry["id"] == legacy_control.id),
        None,
    )
    assert item is not None
    assert item["frequency"] == "semi-annually"


@pytest.mark.asyncio
async def test_get_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test retrieving a single control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Get Test Control",
            "description": "Control for get test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "weekly",
            "risk_level": 4,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    # Get the control
    response = await auth_client.get(f"/api/v1/controls/{control_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == control_id
    assert data["name"] == "Get Test Control"
    assert data["capabilities"]["can_archive_immediately"] is True
    assert data["capabilities"]["has_pending_update_approval"] is False


@pytest.mark.asyncio
async def test_get_control_normalizes_legacy_semi_annual_frequency(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Detail endpoint should normalize legacy semi-annual frequency aliases."""
    legacy_control = Control(
        name="Legacy Frequency Detail Control",
        description="Control with legacy frequency alias",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="semiannual",
        risk_level=3,
        status="active",
    )
    db_session.add(legacy_control)
    await db_session.commit()
    await db_session.refresh(legacy_control)

    response = await auth_client.get(f"/api/v1/controls/{legacy_control.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == legacy_control.id
    assert data["frequency"] == "semi-annually"


@pytest.mark.asyncio
async def test_control_payloads_emit_archive_state(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Control detail and list payloads must expose the archive flag used by restore UI."""
    archived_control = Control(
        name="Archived Payload Control",
        description="Archived control normalized to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add(archived_control)
    await db_session.commit()
    await db_session.refresh(archived_control)

    detail_response = await auth_client.get(f"/api/v1/controls/{archived_control.id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["is_archived"] is True

    list_response = await auth_client.get("/api/v1/controls?status=archived")
    assert list_response.status_code == 200
    archived_item = next(item for item in list_response.json()["items"] if item["id"] == archived_control.id)
    assert archived_item["is_archived"] is True


@pytest.mark.asyncio
async def test_inactive_control_capabilities_do_not_expose_execution(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    inactive_control = Control(
        name="Inactive Capability Control",
        description="Inactive controls should not expose execution logging",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="inactive",
    )
    db_session.add(inactive_control)
    await db_session.commit()
    await db_session.refresh(inactive_control)

    response = await auth_client.get(f"/api/v1/controls/{inactive_control.id}")

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_log_execution"] is False
    assert capabilities["is_executable"] is False


@pytest.mark.asyncio
async def test_archived_active_control_capabilities_do_not_expose_execution(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    archived_control = Control(
        name="Archived Active Capability Control",
        description="Archived active controls should not expose execution logging",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add(archived_control)
    await db_session.commit()
    await db_session.refresh(archived_control)

    response = await auth_client.get(f"/api/v1/controls/{archived_control.id}")

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_log_execution"] is False
    assert capabilities["is_executable"] is False


@pytest.mark.asyncio
async def test_cross_department_control_owner_delete_permission_does_not_expose_lifecycle_capabilities(
    client: AsyncClient,
    db_session,
    test_department: Department,
):
    second_department = Department(
        name="Control Lifecycle Finance",
        description="Department for cross-department control lifecycle capability checks",
        code="CLF",
        is_active=True,
    )
    role = Role(
        name="cross_dept_control_owner",
        display_name="Cross Department Control Owner",
        description="Control owner with read write delete permissions",
    )
    db_session.add_all([second_department, role])
    await db_session.commit()
    await db_session.refresh(second_department)
    await db_session.refresh(role)
    await _grant_control_permissions(db_session, role, ["read", "write", "delete"])

    owner = User(
        name="Cross Department Control Owner",
        email="cross-dept-control-owner@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)

    control = Control(
        name="Cross Department Owned Control",
        description="Owned across department boundary",
        department_id=second_department.id,
        control_owner_id=owner.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    headers = {"X-Mock-User-Id": str(owner.id)}
    response = await client.get(f"/api/v1/controls/{control.id}", headers=headers)

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_update"] is True
    assert capabilities["can_archive_immediately"] is False
    assert capabilities["can_request_archive_approval"] is False
    assert capabilities["can_restore"] is False

    update_response = await client.patch(
        f"/api/v1/controls/{control.id}",
        headers=headers,
        json={"name": "Cross Department Owned Control Updated"},
    )
    assert update_response.status_code == 202

    control.is_archived = True
    db_session.add(control)
    await db_session.commit()

    archived_response = await client.get(f"/api/v1/controls/{control.id}", headers=headers)
    assert archived_response.status_code == 200
    assert archived_response.json()["capabilities"]["can_restore"] is False


@pytest.mark.asyncio
async def test_update_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test updating a control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Update Test Control",
            "description": "Control for update test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    # Update the control
    response = await auth_client.patch(
        f"/api/v1/controls/{control_id}",
        json={
            "name": "Updated Control Name",
            "risk_level": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Control Name"
    assert data["risk_level"] == 5


@pytest.mark.asyncio
async def test_delete_control(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test soft deleting (archiving) a control."""
    # Create a control first
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Delete Test Control",
            "description": "Control for delete test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "quarterly",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    # Delete the control
    response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Testing deletion")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_control_not_found(auth_client: AsyncClient, test_user: User):
    """Test getting a non-existent control returns 404."""
    response = await auth_client.get("/api/v1/controls/99999")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_control_list_include_archived_toggle(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    """Default list excludes archived controls; include_archived=true returns them."""
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Archived Toggle Control",
            "description": "Control used to validate include_archived",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Archive+for+test")
    assert archive_response.status_code == 204

    default_list = await auth_client.get("/api/v1/controls")
    assert default_list.status_code == 200
    default_ids = {item["id"] for item in default_list.json()["items"]}
    assert control_id not in default_ids

    archived_list = await auth_client.get("/api/v1/controls?include_archived=true")
    assert archived_list.status_code == 200
    archived_ids = {item["id"] for item in archived_list.json()["items"]}
    assert control_id in archived_ids


@pytest.mark.asyncio
async def test_control_status_filter_excludes_archived_normalized_controls(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Lifecycle status filters should still exclude soft-archived controls."""
    live_control = Control(
        name="Active Status Filter Control",
        description="Live control for active-status archive filtering",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=False,
    )
    archived_control = Control(
        name="Archived Normalized Control",
        description="Archived control normalized back to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_control, archived_control])
    await db_session.commit()
    await db_session.refresh(live_control)
    await db_session.refresh(archived_control)

    active_response = await auth_client.get("/api/v1/controls?status=active")
    assert active_response.status_code == 200
    active_ids = {item["id"] for item in active_response.json()["items"]}
    assert live_control.id in active_ids
    assert archived_control.id not in active_ids

    archived_response = await auth_client.get("/api/v1/controls?status=archived")
    assert archived_response.status_code == 200
    archived_ids = {item["id"] for item in archived_response.json()["items"]}
    assert archived_control.id in archived_ids
    assert live_control.id not in archived_ids


@pytest.mark.asyncio
async def test_control_restore_reactivates_archived_control(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
):
    """Restore endpoint sets archived control back to active."""
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Restore Control",
            "description": "Control used to validate restore",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Archive+for+restore")
    assert archive_response.status_code == 204

    archived_detail_response = await auth_client.get(f"/api/v1/controls/{control_id}")
    assert archived_detail_response.status_code == 200
    assert archived_detail_response.json()["capabilities"]["can_restore"] is True

    restore_response = await auth_client.post(f"/api/v1/controls/{control_id}/restore")
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "active"
    assert restore_response.json()["capabilities"]["can_archive_immediately"] is True


@pytest.mark.asyncio
async def test_control_restore_requires_delete_permission(
    client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Users without controls:delete cannot call restore endpoint."""
    admin_headers = {"X-Mock-User-Id": str(test_user.id)}

    create_response = await client.post(
        "/api/v1/controls",
        json={
            "name": "Forbidden Restore Control",
            "description": "Control used to validate restore RBAC",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 2,
            "status": "active",
        },
        headers=admin_headers,
    )
    control_id = create_response.json()["id"]

    archive_response = await client.delete(
        f"/api/v1/controls/{control_id}?reason=Archive+for+rbac",
        headers=admin_headers,
    )
    assert archive_response.status_code == 204

    from app.models import Role
    from app.models import User as UserModel
    from app.models.user import AccessScope

    readonly_role = Role(name="control_readonly", display_name="Control Read Only", description="control read only")
    db_session.add(readonly_role)
    await db_session.commit()
    await db_session.refresh(readonly_role)

    readonly_user = UserModel(
        name="Control Readonly User",
        email="control-readonly@test.com",
        department_id=test_department.id,
        role_id=readonly_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(readonly_user)
    await db_session.commit()
    await db_session.refresh(readonly_user)

    forbidden = await client.post(
        f"/api/v1/controls/{control_id}/restore",
        headers={"X-Mock-User-Id": str(readonly_user.id)},
    )
    assert forbidden.status_code == 403
