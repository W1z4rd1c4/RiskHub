import pytest
from httpx import AsyncClient
from sqlalchemy import event, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
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
from app.models.risk import ControlEffectiveness
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


@pytest.mark.asyncio
async def test_risk_form_lookup_is_bulk_sorted_live_and_uses_canonical_visibility(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
):
    outside_department = Department(
        name="Outside Department",
        code="OUTSIDE",
        description="Outside the employee's department scope",
    )
    db_session.add(outside_department)
    await db_session.flush()

    def make_risk(
        code: str,
        process: str,
        subprocess: str,
        category: str,
        *,
        department_id: int,
        owner_id: int | None = None,
        is_archived: bool = False,
    ) -> Risk:
        return Risk(
            risk_id_code=code,
            name=f"{process} risk",
            process=process,
            subprocess=subprocess,
            risk_type="operational",
            category=category,
            description=f"Risk for {process}",
            department_id=department_id,
            owner_id=owner_id,
            gross_probability=3,
            gross_impact=3,
            net_probability=2,
            net_impact=2,
            status="active",
            is_archived=is_archived,
        )

    department_risk = make_risk(
        "LOOKUP-DEPT",
        "Claims",
        "FNOL",
        "Operations",
        department_id=test_department.id,
    )
    duplicate_department_risk = make_risk(
        "LOOKUP-DEPT-DUP",
        "Claims",
        "FNOL",
        "Operations",
        department_id=test_department.id,
    )
    owned_risk = make_risk(
        "LOOKUP-OWNER",
        "Treasury",
        "Liquidity",
        "Financial",
        department_id=outside_department.id,
        owner_id=test_user_employee.id,
    )
    reporting_owner_risk = make_risk(
        "LOOKUP-KRI",
        "Finance",
        "Reconciliation",
        "Compliance",
        department_id=outside_department.id,
    )
    control_owner_risk = make_risk(
        "LOOKUP-CONTROL",
        "Technology",
        "Access review",
        "Security",
        department_id=outside_department.id,
    )
    hidden_risk = make_risk(
        "LOOKUP-HIDDEN",
        "Hidden process",
        "Hidden subprocess",
        "Hidden category",
        department_id=outside_department.id,
    )
    archived_owned_risk = make_risk(
        "LOOKUP-ARCHIVED",
        "Archived process",
        "Archived subprocess",
        "Archived category",
        department_id=outside_department.id,
        owner_id=test_user_employee.id,
        is_archived=True,
    )
    db_session.add_all([
        department_risk,
        duplicate_department_risk,
        owned_risk,
        reporting_owner_risk,
        control_owner_risk,
        hidden_risk,
        archived_owned_risk,
    ])
    await db_session.flush()

    db_session.add(KeyRiskIndicator(
        risk_id=reporting_owner_risk.id,
        metric_name="Reporting owner lookup KRI",
        description="Makes the outside risk visible through KRI reporting ownership.",
        current_value=1,
        lower_limit=0,
        upper_limit=2,
        reporting_owner_id=test_user_employee.id,
    ))
    owned_control = Control(
        name="Employee-owned lookup control",
        description="Makes the outside risk visible through control ownership.",
        control_owner_id=test_user_employee.id,
        department_id=outside_department.id,
        status="active",
    )
    db_session.add(owned_control)
    await db_session.flush()
    db_session.add(ControlRiskLink(
        control_id=owned_control.id,
        risk_id=control_owner_risk.id,
        effectiveness=ControlEffectiveness.medium.value,
    ))
    await db_session.commit()

    bulk_risks = []
    for index in range(10_002):
        fixture_kind = index % 3
        bulk_risks.append({
            "risk_id_code": f"LOOKUP-BULK-{index}",
            "name": f"Bulk lookup Risk {index}",
            "process": "Bulk visible" if fixture_kind == 0 else "Bulk hidden",
            "subprocess": "Bulk subprocess",
            "risk_type": "operational",
            "category": "Bulk category",
            "description": "Large-register lookup fixture.",
            "department_id": test_department.id if fixture_kind != 1 else outside_department.id,
            "gross_probability": 3,
            "gross_impact": 3,
            "gross_score": 9,
            "net_probability": 2,
            "net_impact": 2,
            "net_score": 4,
            "status": "active",
            "is_priority": False,
            "is_archived": fixture_kind == 2,
        })
    await db_session.execute(insert(Risk), bulk_risks)
    await db_session.commit()

    risk_selects: list[str] = []

    def capture_risk_select(_connection, _cursor, statement, _parameters, _context, _executemany):
        normalized = statement.upper()
        if normalized.lstrip().startswith("SELECT") and "FROM RISKS" in normalized:
            risk_selects.append(statement)

    engine = db_session.bind.sync_engine
    event.listen(engine, "before_cursor_execute", capture_risk_select)

    try:
        async with client_factory(user=test_user_employee) as employee_client:
            employee_response = await employee_client.get("/api/v1/lookups/risk-filters")
    finally:
        event.remove(engine, "before_cursor_execute", capture_risk_select)

    assert employee_response.status_code == 200
    assert len(risk_selects) == 1
    assert employee_response.json() == {
        "processes": ["Bulk visible", "Claims", "Finance", "Technology", "Treasury"],
        "categories": ["Bulk category", "Compliance", "Financial", "Operations", "Security"],
        "subprocesses_by_process": {
            "Bulk visible": ["Bulk subprocess"],
            "Claims": ["FNOL"],
            "Finance": ["Reconciliation"],
            "Technology": ["Access review"],
            "Treasury": ["Liquidity"],
        },
    }

    async with client_factory(user=test_user_cro) as cro_client:
        privileged_response = await cro_client.get("/api/v1/lookups/risk-filters")

    assert privileged_response.status_code == 200
    privileged_payload = privileged_response.json()
    assert privileged_payload["processes"] == [
        "Bulk hidden",
        "Bulk visible",
        "Claims",
        "Finance",
        "Hidden process",
        "Technology",
        "Treasury",
    ]
    assert "Archived process" not in privileged_payload["processes"]
    assert "Bulk visible" in privileged_payload["processes"]
    assert "Bulk hidden" in privileged_payload["processes"]
    assert privileged_payload["subprocesses_by_process"]["Hidden process"] == ["Hidden subprocess"]
