from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    Control,
    ControlRiskLink,
    Department,
    KeyRiskIndicator,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
)
from app.models.control import ControlStatus
from app.models.risk import RiskStatus
from app.models.user import AccessScope


def _uniq(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


async def _create_department(db_session: AsyncSession, *, prefix: str) -> Department:
    department = Department(
        name=_uniq(f"{prefix}-dept"),
        code=f"D{uuid4().hex[:9].upper()}",
        is_active=True,
    )
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)
    return department


async def _create_user(
    db_session: AsyncSession,
    *,
    role_id: int,
    department_id: int | None,
    prefix: str,
    is_active: bool = True,
    access_scope: AccessScope = AccessScope.DEPARTMENT,
) -> User:
    user = User(
        name=_uniq(prefix),
        email=f"{_uniq(prefix)}@example.com",
        role_id=role_id,
        department_id=department_id,
        is_active=is_active,
        access_scope=access_scope,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_role_with_permissions(
    db_session: AsyncSession,
    *,
    prefix: str,
    permissions: list[tuple[str, str]],
) -> Role:
    role = Role(
        name=_uniq(prefix),
        display_name=_uniq(f"{prefix}-display"),
        description=f"{prefix} test role",
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    permission_rows: list[Permission] = []
    for resource, action in permissions:
        permission = Permission(
            resource=resource,
            action=action,
            description=f"{resource}:{action}",
        )
        db_session.add(permission)
        permission_rows.append(permission)
    await db_session.commit()

    for permission in permission_rows:
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db_session.commit()
    await db_session.refresh(role)
    return role


async def _count_approvals(
    db_session: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> int:
    return int(
        await db_session.scalar(
            select(func.count(ApprovalRequest.id)).where(
                ApprovalRequest.resource_type == resource_type,
                ApprovalRequest.resource_id == resource_id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
            )
        )
        or 0
    )


async def _latest_approval(
    db_session: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> ApprovalRequest | None:
    return (
        await db_session.execute(
            select(ApprovalRequest)
            .where(
                ApprovalRequest.resource_type == resource_type,
                ApprovalRequest.resource_id == resource_id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
            )
            .order_by(ApprovalRequest.id.desc())
        )
    ).scalars().first()


async def _create_cross_department_reporting_owner_without_risks_read(
    db_session: AsyncSession,
    *,
    prefix: str,
) -> tuple[User, Risk, KeyRiskIndicator]:
    own_department = await _create_department(db_session, prefix=f"{prefix}-owner")
    target_department = await _create_department(db_session, prefix=f"{prefix}-target")
    role = await _create_role_with_permissions(
        db_session,
        prefix=f"{prefix}-role",
        permissions=[],
    )
    reporting_owner = await _create_user(
        db_session,
        role_id=role.id,
        department_id=own_department.id,
        prefix=f"{prefix}-user",
    )
    risk = Risk(
        risk_id_code=f"OWN-VAL-{uuid4().hex[:8].upper()}",
        name=f"{prefix} Hidden Risk",
        process="Validation",
        description="Cross-department risk assigned to reporting owner without read permission",
        department_id=target_department.id,
        owner_id=None,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name=f"{prefix} Hidden KRI",
        description="Cross-department KRI assigned to reporting owner without read permission",
        current_value=25,
        lower_limit=0,
        upper_limit=100,
        unit="%",
        frequency="monthly",
        reporting_owner_id=reporting_owner.id,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    return reporting_owner, risk, kri


@pytest.mark.asyncio
async def test_control_create_rejects_nonexistent_control_owner_id(
    auth_client: AsyncClient,
    test_department: Department,
):
    response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Invalid Control Owner",
            "description": "Should fail",
            "department_id": test_department.id,
            "control_owner_id": 999999,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Control owner not found"


@pytest.mark.asyncio
async def test_control_update_rejects_inactive_control_owner_id(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user: User,
):
    inactive_department = await _create_department(db_session, prefix="control-inactive")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=inactive_department.id,
        prefix="inactive-control-owner",
        is_active=False,
    )
    control = Control(
        name="Control Update Validation",
        description="Owned by active user",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await auth_client.patch(
        f"/api/v1/controls/{control.id}",
        json={"control_owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Control owner is inactive"
    await db_session.refresh(control)
    assert control.control_owner_id == test_user.id


@pytest.mark.asyncio
async def test_risk_create_rejects_nonexistent_owner_id(
    auth_client: AsyncClient,
    test_department: Department,
    seed_risk_types,
):
    response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "OWN-VAL-RISK-001",
            "name": "Invalid Risk Owner",
            "process": "Validation",
            "description": "Should fail",
            "department_id": test_department.id,
            "owner_id": 999999,
            "risk_type": "operational",
            "category": "Validation",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Risk owner not found"


@pytest.mark.asyncio
async def test_risk_update_rejects_inactive_owner_id(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user: User,
    seed_risk_types,
):
    inactive_department = await _create_department(db_session, prefix="risk-inactive")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=inactive_department.id,
        prefix="inactive-risk-owner",
        is_active=False,
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-002",
        name="Risk Update Validation",
        process="Validation",
        description="Owned by active user",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await auth_client.patch(
        f"/api/v1/risks/{risk.id}",
        json={"owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Risk owner is inactive"
    await db_session.refresh(risk)
    assert risk.owner_id == test_user.id


@pytest.mark.asyncio
async def test_kri_create_rejects_nonexistent_reporting_owner_id(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
):
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-003",
        name="KRI Create Validation Risk",
        process="Validation",
        description="Risk for KRI validation",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await auth_client.post(
        "/api/v1/kris",
        json={
            "risk_id": risk.id,
            "metric_name": "Invalid Reporting Owner",
            "description": "Should fail",
            "current_value": 10,
            "lower_limit": 0,
            "upper_limit": 100,
            "unit": "%",
            "frequency": "monthly",
            "reporting_owner_id": 999999,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reporting owner not found"


@pytest.mark.asyncio
async def test_kri_update_rejects_inactive_reporting_owner_id(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user: User,
    seed_risk_types,
):
    inactive_department = await _create_department(db_session, prefix="kri-inactive")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=inactive_department.id,
        prefix="inactive-kri-owner",
        is_active=False,
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-004",
        name="KRI Update Validation Risk",
        process="Validation",
        description="Risk for KRI update validation",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="KRI Update Validation",
        description="Owned by active user",
        current_value=25,
        lower_limit=0,
        upper_limit=100,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user.id,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    response = await auth_client.put(
        f"/api/v1/kris/{kri.id}",
        json={"reporting_owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reporting owner is inactive"
    await db_session.refresh(kri)
    assert kri.reporting_owner_id == test_user.id


@pytest.mark.asyncio
async def test_active_cross_department_owner_assignments_still_succeed(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user: User,
    seed_risk_types,
):
    other_department = await _create_department(db_session, prefix="cross-dept-active")
    active_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="active-cross-dept-owner",
    )

    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Cross-Dept Control",
            "description": "Should succeed",
            "department_id": test_department.id,
            "control_owner_id": active_owner.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    assert control_response.status_code == 201
    assert control_response.json()["control_owner_id"] == active_owner.id

    risk_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "OWN-VAL-RISK-005",
            "name": "Cross-Dept Risk",
            "process": "Validation",
            "description": "Should succeed",
            "department_id": test_department.id,
            "owner_id": active_owner.id,
            "risk_type": "operational",
            "category": "Validation",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    assert risk_response.status_code == 201
    risk_id = risk_response.json()["id"]
    assert risk_response.json()["owner_id"] == active_owner.id

    kri_response = await auth_client.post(
        "/api/v1/kris",
        json={
            "risk_id": risk_id,
            "metric_name": "Cross-Dept KRI",
            "description": "Should succeed",
            "current_value": 10,
            "lower_limit": 0,
            "upper_limit": 100,
            "unit": "%",
            "frequency": "monthly",
            "reporting_owner_id": active_owner.id,
        },
    )
    assert kri_response.status_code == 201
    assert kri_response.json()["reporting_owner_id"] == active_owner.id


@pytest.mark.asyncio
async def test_non_privileged_risk_owner_change_to_active_cross_department_user_creates_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
    seed_risk_types,
):
    other_department = await _create_department(db_session, prefix="risk-approval")
    active_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="active-risk-approval-owner",
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-006",
        name="Risk Approval Validation",
        process="Validation",
        description="Should queue approval",
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await client_approval_requester.patch(
        f"/api/v1/risks/{risk.id}",
        json={"owner_id": active_owner.id},
    )

    assert response.status_code == 202
    approval = await _latest_approval(
        db_session,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
    )
    assert approval is not None
    assert approval.pending_changes["owner_id"]["new"] == active_owner.id
    await db_session.refresh(risk)
    assert risk.owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_invalid_risk_owner_change_returns_400_and_creates_no_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
    seed_risk_types,
):
    other_department = await _create_department(db_session, prefix="risk-invalid")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="inactive-risk-approval-owner",
        is_active=False,
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-007",
        name="Risk Invalid Approval Validation",
        process="Validation",
        description="Should fail before approval",
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    response = await client_approval_requester.patch(
        f"/api/v1/risks/{risk.id}",
        json={"owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Risk owner is inactive"
    assert await _count_approvals(
        db_session,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
    ) == 0
    await db_session.refresh(risk)
    assert risk.owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_non_privileged_control_owner_change_to_active_cross_department_user_creates_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
):
    other_department = await _create_department(db_session, prefix="control-approval")
    active_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="active-control-approval-owner",
    )
    control = Control(
        name="Control Approval Validation",
        description="Should queue approval",
        department_id=test_department.id,
        control_owner_id=test_user_approval_requester.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client_approval_requester.patch(
        f"/api/v1/controls/{control.id}",
        json={"control_owner_id": active_owner.id},
    )

    assert response.status_code == 202
    approval = await _latest_approval(
        db_session,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
    )
    assert approval is not None
    assert approval.pending_changes["control_owner_id"]["new"] == active_owner.id
    await db_session.refresh(control)
    assert control.control_owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_invalid_control_owner_change_returns_400_and_creates_no_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
):
    other_department = await _create_department(db_session, prefix="control-invalid")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="inactive-control-approval-owner",
        is_active=False,
    )
    control = Control(
        name="Control Invalid Approval Validation",
        description="Should fail before approval",
        department_id=test_department.id,
        control_owner_id=test_user_approval_requester.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client_approval_requester.patch(
        f"/api/v1/controls/{control.id}",
        json={"control_owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Control owner is inactive"
    assert await _count_approvals(
        db_session,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
    ) == 0
    await db_session.refresh(control)
    assert control.control_owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_non_privileged_kri_reporting_owner_change_to_active_cross_department_user_creates_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
    seed_risk_types,
):
    other_department = await _create_department(db_session, prefix="kri-approval")
    active_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="active-kri-approval-owner",
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-008",
        name="KRI Approval Validation Risk",
        process="Validation",
        description="Risk for KRI approval validation",
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="KRI Approval Validation",
        description="Should queue approval",
        current_value=25,
        lower_limit=0,
        upper_limit=100,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_approval_requester.id,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    response = await client_approval_requester.put(
        f"/api/v1/kris/{kri.id}",
        json={"reporting_owner_id": active_owner.id},
    )

    assert response.status_code == 202
    approval = await _latest_approval(
        db_session,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
    )
    assert approval is not None
    assert approval.pending_changes["reporting_owner_id"]["new"] == active_owner.id
    await db_session.refresh(kri)
    assert kri.reporting_owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_invalid_kri_reporting_owner_change_returns_400_and_creates_no_approval(
    client_approval_requester: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_role_employee: Role,
    test_user_approval_requester: User,
    seed_risk_types,
):
    other_department = await _create_department(db_session, prefix="kri-invalid")
    inactive_owner = await _create_user(
        db_session,
        role_id=test_role_employee.id,
        department_id=other_department.id,
        prefix="inactive-kri-approval-owner",
        is_active=False,
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-009",
        name="KRI Invalid Approval Validation Risk",
        process="Validation",
        description="Risk for invalid KRI approval validation",
        department_id=test_department.id,
        owner_id=test_user_approval_requester.id,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="KRI Invalid Approval Validation",
        description="Should fail before approval",
        current_value=25,
        lower_limit=0,
        upper_limit=100,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_approval_requester.id,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    response = await client_approval_requester.put(
        f"/api/v1/kris/{kri.id}",
        json={"reporting_owner_id": inactive_owner.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Reporting owner is inactive"
    assert await _count_approvals(
        db_session,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
    ) == 0
    await db_session.refresh(kri)
    assert kri.reporting_owner_id == test_user_approval_requester.id


@pytest.mark.asyncio
async def test_control_owner_without_controls_read_gets_403_on_control_detail(
    client: AsyncClient,
    db_session: AsyncSession,
):
    own_department = await _create_department(db_session, prefix="owner-no-read")
    target_department = await _create_department(db_session, prefix="owner-no-read-target")
    role = await _create_role_with_permissions(
        db_session,
        prefix="owner-no-read",
        permissions=[],
    )
    owner = await _create_user(
        db_session,
        role_id=role.id,
        department_id=own_department.id,
        prefix="owner-no-read-user",
    )
    control = Control(
        name="No Read Control",
        description="Cross-department owned control",
        department_id=target_department.id,
        control_owner_id=owner.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client.get(
        f"/api/v1/controls/{control.id}",
        headers={"X-Mock-User-Id": str(owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: controls:read"


@pytest.mark.asyncio
async def test_control_owner_without_controls_execute_gets_403_on_execution_creation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    own_department = await _create_department(db_session, prefix="owner-no-execute")
    target_department = await _create_department(db_session, prefix="owner-no-execute-target")
    role = await _create_role_with_permissions(
        db_session,
        prefix="owner-no-execute",
        permissions=[("controls", "read")],
    )
    owner = await _create_user(
        db_session,
        role_id=role.id,
        department_id=own_department.id,
        prefix="owner-no-execute-user",
    )
    control = Control(
        name="No Execute Control",
        description="Cross-department owned control",
        department_id=target_department.id,
        control_owner_id=owner.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await client.post(
        f"/api/v1/controls/{control.id}/executions",
        headers={"X-Mock-User-Id": str(owner.id)},
        json={"result": "passed", "findings": "Should be denied"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: controls:execute"


@pytest.mark.asyncio
async def test_control_owner_without_risks_read_cannot_read_linked_risk_detail(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_risk_types,
):
    own_department = await _create_department(db_session, prefix="owner-no-risk-read")
    target_department = await _create_department(db_session, prefix="owner-no-risk-read-target")
    role = await _create_role_with_permissions(
        db_session,
        prefix="owner-no-risk-read",
        permissions=[("controls", "read")],
    )
    owner = await _create_user(
        db_session,
        role_id=role.id,
        department_id=own_department.id,
        prefix="owner-no-risk-read-user",
    )
    control = Control(
        name="No Risk Read Control",
        description="Cross-department owned control",
        department_id=target_department.id,
        control_owner_id=owner.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status=ControlStatus.active.value,
    )
    risk = Risk(
        risk_id_code="OWN-VAL-RISK-010",
        name="Linked Risk Hidden By Permission",
        process="Validation",
        description="Linked risk should remain unreadable",
        department_id=target_department.id,
        owner_id=None,
        risk_type="operational",
        category="Validation",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
    )
    db_session.add_all([control, risk])
    await db_session.commit()
    await db_session.refresh(control)
    await db_session.refresh(risk)

    db_session.add(
        ControlRiskLink(
            control_id=control.id,
            risk_id=risk.id,
            effectiveness="high",
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/risks/{risk.id}",
        headers={"X-Mock-User-Id": str(owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: risks:read"


@pytest.mark.asyncio
async def test_reporting_owner_without_risks_read_gets_403_on_kri_detail(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_risk_types,
):
    reporting_owner, _, kri = await _create_cross_department_reporting_owner_without_risks_read(
        db_session,
        prefix="reporting-owner-no-read-detail",
    )

    response = await client.get(
        f"/api/v1/kris/{kri.id}",
        headers={"X-Mock-User-Id": str(reporting_owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: risks:read"


@pytest.mark.asyncio
async def test_reporting_owner_without_risks_read_gets_403_on_kri_list(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_risk_types,
):
    reporting_owner, risk, _ = await _create_cross_department_reporting_owner_without_risks_read(
        db_session,
        prefix="reporting-owner-no-read-list",
    )

    response = await client.get(
        f"/api/v1/kris?risk_id={risk.id}",
        headers={"X-Mock-User-Id": str(reporting_owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: risks:read"


@pytest.mark.asyncio
async def test_reporting_owner_without_risks_read_gets_403_on_kri_history(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_risk_types,
):
    reporting_owner, _, kri = await _create_cross_department_reporting_owner_without_risks_read(
        db_session,
        prefix="reporting-owner-no-read-history",
    )

    response = await client.get(
        f"/api/v1/kris/{kri.id}/history",
        headers={"X-Mock-User-Id": str(reporting_owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: risks:read"


@pytest.mark.asyncio
async def test_reporting_owner_without_risks_read_gets_403_on_linked_risk_detail(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_risk_types,
):
    reporting_owner, risk, _ = await _create_cross_department_reporting_owner_without_risks_read(
        db_session,
        prefix="reporting-owner-no-read-risk",
    )

    response = await client.get(
        f"/api/v1/risks/{risk.id}",
        headers={"X-Mock-User-Id": str(reporting_owner.id)},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied: risks:read"
