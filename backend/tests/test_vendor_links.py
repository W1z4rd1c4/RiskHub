import pytest

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    Department,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
    VendorControlLink,
    VendorRiskLink,
)
from app.models.user import AccessScope


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


def _make_risk(*, risk_id_code: str, department_id: int | None) -> Risk:
    return Risk(
        risk_id_code=risk_id_code,
        name=f"Risk {risk_id_code}",
        process="IT",
        subprocess=None,
        category=None,
        description="Test risk",
        department_id=department_id,
        owner_id=None,
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )


def _make_control(*, name: str, department_id: int | None) -> Control:
    return Control(
        name=name,
        description="Test control",
        data_source=None,
        methodology_reference=None,
        control_form="manual",
        process_owner_position=None,
        control_owner_id=None,
        executor_position=None,
        frequency="monthly",
        risk_level=3,
        output_description=None,
        report_recipient=None,
        documentation_location=None,
        department_id=department_id,
        status="draft",
        created_by_id=None,
        updated_by_id=None,
    )


@pytest.mark.asyncio
async def test_vendor_risk_factors_crud(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Owned Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    resp = await client_employee.get(f"/api/v1/vendors/{vendor.id}/risk-factors")
    assert resp.status_code == 200
    assert resp.json() == []

    resp = await client_employee.post(
        f"/api/v1/vendors/{vendor.id}/risk-factors",
        json={"category_key": "cyber_supply_chain", "description": "SOC2 coverage"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["vendor_id"] == vendor.id
    assert data["category_key"] == "cyber_supply_chain"
    assert data["description"] == "SOC2 coverage"

    factor_id = data["id"]
    resp = await client_employee.patch(
        f"/api/v1/vendor-risk-factors/{factor_id}",
        json={"category_key": "info_security_data", "description": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["category_key"] == "info_security_data"
    assert resp.json()["description"] == "Updated"

    resp = await client_employee.delete(f"/api/v1/vendor-risk-factors/{factor_id}")
    assert resp.status_code == 204

    resp = await client_employee.get(f"/api/v1/vendors/{vendor.id}/risk-factors")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_vendor_links_require_vendor_write_or_owner(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Not Owned Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=99999,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    risk = _make_risk(risk_id_code="IT-R001", department_id=test_department.id)
    db_session.add_all([vendor, risk])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(risk)

    resp = await client_employee.post(
        f"/api/v1/vendors/{vendor.id}/linked-risks",
        json={"risk_id": risk.id},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_vendor_risk_link_blocks_cross_department_risk(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    other_dept = Department(name="Other Department", code="OTHR", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    vendor = Vendor(
        name="Owned Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    risk_other = _make_risk(risk_id_code="OTHR-R001", department_id=other_dept.id)
    db_session.add_all([vendor, risk_other])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(risk_other)

    resp = await client_employee.post(
        f"/api/v1/vendors/{vendor.id}/linked-risks",
        json={"risk_id": risk_other.id},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_vendor_linked_entities_filter_invisible_and_prevent_unlink(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    other_dept = Department(name="Other Department", code="OTHR", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    vendor = Vendor(
        name="Owned Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    risk_visible = _make_risk(risk_id_code="IT-R001", department_id=test_department.id)
    risk_hidden = _make_risk(risk_id_code="OTHR-R001", department_id=other_dept.id)
    control_visible = _make_control(name="Visible Control", department_id=test_department.id)
    control_hidden = _make_control(name="Hidden Control", department_id=other_dept.id)

    db_session.add_all([vendor, risk_visible, risk_hidden, control_visible, control_hidden])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(risk_visible)
    await db_session.refresh(risk_hidden)
    await db_session.refresh(control_visible)
    await db_session.refresh(control_hidden)

    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor.id, risk_id=risk_visible.id),
            VendorRiskLink(vendor_id=vendor.id, risk_id=risk_hidden.id),
            VendorControlLink(vendor_id=vendor.id, control_id=control_visible.id),
            VendorControlLink(vendor_id=vendor.id, control_id=control_hidden.id),
        ]
    )
    await db_session.commit()
    vendor_id = vendor.id
    risk_hidden_id = risk_hidden.id
    control_hidden_id = control_hidden.id
    db_session.expire_all()

    resp = await client_employee.get(f"/api/v1/vendors/{vendor_id}/linked-risks")
    assert resp.status_code == 200
    assert [r["risk_id_code"] for r in resp.json()] == ["IT-R001"]

    resp = await client_employee.get(f"/api/v1/vendors/{vendor_id}/linked-controls")
    assert resp.status_code == 200
    assert [c["name"] for c in resp.json()] == ["Visible Control"]

    resp = await client_employee.delete(f"/api/v1/vendors/{vendor_id}/linked-risks/{risk_hidden_id}")
    assert resp.status_code == 404

    resp = await client_employee.delete(f"/api/v1/vendors/{vendor_id}/linked-controls/{control_hidden_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_vendor_linked_risks_requires_risks_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    role = Role(name="vendor_only", display_name="Vendor Only", description="Vendors read only")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    user = User(
        name="Vendor User",
        email="vendor-only@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    vendor = Vendor(
        name="Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    resp = await client.get(f"/api/v1/vendors/{vendor.id}/linked-risks", headers={"X-Mock-User-Id": str(user.id)})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_vendor_linked_controls_requires_controls_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    role = Role(name="vendor_only", display_name="Vendor Only", description="Vendors read only")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    user = User(
        name="Vendor User",
        email="vendor-only-controls@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    vendor = Vendor(
        name="Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    resp = await client.get(f"/api/v1/vendors/{vendor.id}/linked-controls", headers={"X-Mock-User-Id": str(user.id)})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_risk_vendors_endpoint_filters_invisible_vendors(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    other_dept = Department(name="Other Department", code="OTHR", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    risk = _make_risk(risk_id_code="IT-R001", department_id=test_department.id)

    vendor_visible = Vendor(
        name="Visible Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=99999,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    vendor_hidden = Vendor(
        name="Hidden Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=99999,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    vendor_cross_dept_owner = Vendor(
        name="Cross Dept Owned Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )

    db_session.add_all([risk, vendor_visible, vendor_hidden, vendor_cross_dept_owner])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(vendor_visible)
    await db_session.refresh(vendor_hidden)
    await db_session.refresh(vendor_cross_dept_owner)

    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor_visible.id, risk_id=risk.id),
            VendorRiskLink(vendor_id=vendor_hidden.id, risk_id=risk.id),
            VendorRiskLink(vendor_id=vendor_cross_dept_owner.id, risk_id=risk.id),
        ]
    )
    await db_session.commit()

    resp = await client_employee.get(f"/api/v1/risks/{risk.id}/vendors")
    assert resp.status_code == 200
    names = {v["name"] for v in resp.json()}
    assert "Visible Vendor" in names
    assert "Cross Dept Owned Vendor" in names
    assert "Hidden Vendor" not in names


@pytest.mark.asyncio
async def test_vendor_linked_entities_include_archive_status_metadata(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    """Linked risk/control payloads include status for archived rendering in frontend."""
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Status Metadata Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    active_risk = _make_risk(risk_id_code="META-R001", department_id=test_department.id)
    archived_risk = _make_risk(risk_id_code="META-R002", department_id=test_department.id)
    archived_risk.status = "archived"
    active_control = _make_control(name="Metadata Active Control", department_id=test_department.id)
    active_control.status = "active"
    archived_control = _make_control(name="Metadata Archived Control", department_id=test_department.id)
    archived_control.status = "archived"

    db_session.add_all([vendor, active_risk, archived_risk, active_control, archived_control])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(active_risk)
    await db_session.refresh(archived_risk)
    await db_session.refresh(active_control)
    await db_session.refresh(archived_control)

    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor.id, risk_id=active_risk.id),
            VendorRiskLink(vendor_id=vendor.id, risk_id=archived_risk.id),
            VendorControlLink(vendor_id=vendor.id, control_id=active_control.id),
            VendorControlLink(vendor_id=vendor.id, control_id=archived_control.id),
        ]
    )
    await db_session.commit()

    risks_resp = await client_employee.get(f"/api/v1/vendors/{vendor.id}/linked-risks")
    assert risks_resp.status_code == 200
    risk_status_map = {item["risk_id_code"]: item.get("status") for item in risks_resp.json()}
    assert risk_status_map["META-R001"] == "active"
    assert risk_status_map["META-R002"] == "archived"

    controls_resp = await client_employee.get(f"/api/v1/vendors/{vendor.id}/linked-controls")
    assert controls_resp.status_code == 200
    control_status_map = {item["name"]: item.get("status") for item in controls_resp.json()}
    assert control_status_map["Metadata Active Control"] == "active"
    assert control_status_map["Metadata Archived Control"] == "archived"
