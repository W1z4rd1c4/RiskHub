import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Control,
    Department,
    KeyRiskIndicator,
    KRIFrequency,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
    VendorControlLink,
    VendorKRILink,
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


def _make_kri(*, risk_id: int, metric_name: str, reporting_owner_id: int | None = None) -> KeyRiskIndicator:
    return KeyRiskIndicator(
        risk_id=risk_id,
        metric_name=metric_name,
        description=f"{metric_name} description",
        current_value=50,
        lower_limit=10,
        upper_limit=90,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        reporting_owner_id=reporting_owner_id,
    )


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
    linked_risks = resp.json()
    assert [r["risk_id_code"] for r in linked_risks] == ["IT-R001"]
    assert linked_risks[0]["gross_score"] == 9
    assert linked_risks[0]["net_score"] == 4
    assert linked_risks[0]["is_priority"] is False
    assert "risk_type" in linked_risks[0]

    resp = await client_employee.get(f"/api/v1/vendors/{vendor_id}/linked-controls")
    assert resp.status_code == 200
    linked_controls = resp.json()
    assert [c["name"] for c in linked_controls] == ["Visible Control"]
    assert linked_controls[0]["frequency"] == "monthly"
    assert linked_controls[0]["risk_level"] == 3
    assert linked_controls[0]["status"] == "draft"
    assert "monitoring_status" in linked_controls[0]
    assert "execution_log_count" in linked_controls[0]

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


@pytest.mark.asyncio
async def test_vendor_linked_kris_filter_invisible_and_support_unlink(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    other_dept = Department(name="Hidden KRI Department", code="HKRI", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    vendor = Vendor(
        name="KRI Vendor",
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
    visible_risk = _make_risk(risk_id_code="KRI-R001", department_id=test_department.id)
    hidden_risk = _make_risk(risk_id_code="KRI-R002", department_id=other_dept.id)
    db_session.add_all([vendor, visible_risk, hidden_risk])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(visible_risk)
    await db_session.refresh(hidden_risk)

    visible_kri = _make_kri(
        risk_id=visible_risk.id, metric_name="Visible Vendor KRI", reporting_owner_id=test_user_employee.id
    )
    hidden_kri = _make_kri(risk_id=hidden_risk.id, metric_name="Hidden Vendor KRI")
    hidden_kri.is_archived = True
    db_session.add_all([visible_kri, hidden_kri])
    await db_session.commit()
    await db_session.refresh(visible_kri)
    await db_session.refresh(hidden_kri)

    db_session.add_all(
        [
            VendorKRILink(vendor_id=vendor.id, kri_id=visible_kri.id),
            VendorKRILink(vendor_id=vendor.id, kri_id=hidden_kri.id),
        ]
    )
    await db_session.commit()

    response = await client_employee.get(f"/api/v1/vendors/{vendor.id}/linked-kris")
    assert response.status_code == 200
    payload = response.json()
    assert [item["metric_name"] for item in payload] == ["Visible Vendor KRI"]
    assert payload[0]["risk_process"] == "IT"
    assert payload[0]["risk_department_name"] == test_department.name
    assert payload[0]["is_archived"] is False

    response = await client_employee.delete(f"/api/v1/vendors/{vendor.id}/linked-kris/{hidden_kri.id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_kri_list_linked_vendors_filter_invisible_vendors(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    other_dept = Department(name="Hidden Vendor Department", code="HVND", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    risk = _make_risk(risk_id_code="LIST-KRI-001", department_id=test_department.id)
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = _make_kri(risk_id=risk.id, metric_name="Vendor-linked KRI", reporting_owner_id=test_user_employee.id)
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    visible_vendor = Vendor(
        name="Visible Linked Vendor",
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
    hidden_vendor = Vendor(
        name="Hidden Linked Vendor",
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
    cross_dept_owned_vendor = Vendor(
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
    db_session.add_all([visible_vendor, hidden_vendor, cross_dept_owned_vendor])
    await db_session.commit()
    await db_session.refresh(visible_vendor)
    await db_session.refresh(hidden_vendor)
    await db_session.refresh(cross_dept_owned_vendor)

    db_session.add_all(
        [
            VendorKRILink(vendor_id=visible_vendor.id, kri_id=kri.id),
            VendorKRILink(vendor_id=hidden_vendor.id, kri_id=kri.id),
            VendorKRILink(vendor_id=cross_dept_owned_vendor.id, kri_id=kri.id),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/kris")
    assert response.status_code == 200
    item = next(row for row in response.json()["items"] if row["id"] == kri.id)
    vendor_names = {vendor["name"] for vendor in item["linked_vendors"]}
    assert "Visible Linked Vendor" in vendor_names
    assert "Cross Dept Owned Vendor" in vendor_names
    assert "Hidden Linked Vendor" not in vendor_names
