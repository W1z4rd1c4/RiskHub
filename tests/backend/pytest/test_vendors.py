import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.vendors import crud as vendor_crud
from app.models import Department, Permission, Risk, Role, RolePermission, User, Vendor, VendorRiskLink


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    # Ensure subsequent request-scoped loads see updated role->permissions in the same session.
    db_session.expire(role, ["permissions"])


def _make_risk(*, name: str, risk_id_code: str, department_id: int | None) -> Risk:
    return Risk(
        risk_id_code=risk_id_code,
        name=name,
        process="Operations",
        subprocess=None,
        category="Third Party",
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


@pytest.mark.asyncio
async def test_vendors_requires_read_permission(client_department_head: AsyncClient):
    resp = await client_department_head.get("/api/v1/vendors")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_vendors_list_scoping_includes_cross_department_owner(
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

    v_in_dept = Vendor(
        name="Dept Vendor",
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
    v_cross_dept_owned = Vendor(
        name="Cross Dept Owned",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=4,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    v_cross_dept_not_owned = Vendor(
        name="Other Dept Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_employee.id + 999,
        vendor_type="ict",
        risk_score_1_5=2,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add_all([v_in_dept, v_cross_dept_owned, v_cross_dept_not_owned])
    await db_session.commit()

    resp = await client_employee.get("/api/v1/vendors")
    assert resp.status_code == 200
    data = resp.json()
    names = {v["name"] for v in data["items"]}
    assert "Dept Vendor" in names
    assert "Cross Dept Owned" in names
    assert "Other Dept Vendor" not in names


@pytest.mark.asyncio
async def test_vendor_owner_can_update_without_vendors_write(
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

    resp = await client_employee.patch(f"/api/v1/vendors/{vendor.id}", json={"name": "Owned Vendor Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Owned Vendor Updated"

    resp = await client_employee.patch(f"/api/v1/vendors/{vendor.id}", json={"department_id": None})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_vendor_create_requires_vendors_write(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_role_department_head: Role,
    test_user_employee: User,
):
    # no permissions => forbidden
    resp = await client_department_head.post(
        "/api/v1/vendors",
        json={
            "name": "New Vendor",
            "process": "IT",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user_employee.id,
            "vendor_type": "ict",
            "risk_score_1_5": 3,
            "supports_important_core_insurance_function": False,
            "dora_relevant": False,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert resp.status_code == 403

    await _grant(db_session, test_role_department_head, "vendors", "write")

    resp = await client_department_head.post(
        "/api/v1/vendors",
        json={
            "name": "New Vendor",
            "process": "IT",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user_employee.id,
            "vendor_type": "ict",
            "risk_score_1_5": 3,
            "supports_important_core_insurance_function": False,
            "dora_relevant": False,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_vendors_include_archived_toggle(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    """Inactive vendors are hidden by default and shown when include_archived=true."""
    await _grant(db_session, test_role_employee, "vendors", "read")

    active_vendor = Vendor(
        name="Active Toggle Vendor",
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
    inactive_vendor = Vendor(
        name="Inactive Toggle Vendor",
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
        status="inactive",
    )
    db_session.add_all([active_vendor, inactive_vendor])
    await db_session.commit()

    default_resp = await client_employee.get("/api/v1/vendors")
    assert default_resp.status_code == 200
    default_names = {v["name"] for v in default_resp.json()["items"]}
    assert "Active Toggle Vendor" in default_names
    assert "Inactive Toggle Vendor" not in default_names

    include_resp = await client_employee.get("/api/v1/vendors?include_archived=true")
    assert include_resp.status_code == 200
    include_names = {v["name"] for v in include_resp.json()["items"]}
    assert "Inactive Toggle Vendor" in include_names


@pytest.mark.asyncio
async def test_vendors_list_includes_visible_linked_risks_and_empty_arrays(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")
    await _grant(db_session, test_role_employee, "risks", "read")

    vendor_with_links = Vendor(
        name="Linked Vendor",
        process="Claims",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=4,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    vendor_without_links = Vendor(
        name="Unlinked Vendor",
        process="Finance",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="partner",
        risk_score_1_5=2,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    risk_one = _make_risk(name="Cyber Exposure", risk_id_code="R-001", department_id=test_department.id)
    risk_two = _make_risk(name="Concentration Risk", risk_id_code="R-002", department_id=test_department.id)
    db_session.add_all([vendor_with_links, vendor_without_links, risk_one, risk_two])
    await db_session.commit()
    await db_session.refresh(vendor_with_links)
    await db_session.refresh(risk_one)
    await db_session.refresh(risk_two)

    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor_with_links.id, risk_id=risk_one.id),
            VendorRiskLink(vendor_id=vendor_with_links.id, risk_id=risk_two.id),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/vendors")
    assert response.status_code == 200

    items = {item["name"]: item for item in response.json()["items"]}
    assert items["Linked Vendor"]["linked_risks"] == [
        {
            "risk_id": risk_one.id,
            "risk_id_code": "R-001",
            "risk_name": "Cyber Exposure",
        },
        {
            "risk_id": risk_two.id,
            "risk_id_code": "R-002",
            "risk_name": "Concentration Risk",
        },
    ]
    assert items["Unlinked Vendor"]["linked_risks"] == []


@pytest.mark.asyncio
async def test_vendors_list_filters_out_invisible_linked_risks(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")
    await _grant(db_session, test_role_employee, "risks", "read")

    other_department = Department(name="Other Department", code="OTHR", description="Other")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    vendor = Vendor(
        name="Scoped Vendor",
        process="Operations",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="outsourcing",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    visible_risk = _make_risk(name="Visible Risk", risk_id_code="R-101", department_id=test_department.id)
    invisible_risk = _make_risk(name="Hidden Risk", risk_id_code="R-999", department_id=other_department.id)
    db_session.add_all([vendor, visible_risk, invisible_risk])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(visible_risk)
    await db_session.refresh(invisible_risk)

    db_session.add_all(
        [
            VendorRiskLink(vendor_id=vendor.id, risk_id=visible_risk.id),
            VendorRiskLink(vendor_id=vendor.id, risk_id=invisible_risk.id),
        ]
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/vendors")
    assert response.status_code == 200

    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["linked_risks"] == [
        {
            "risk_id": visible_risk.id,
            "risk_id_code": "R-101",
            "risk_name": "Visible Risk",
        }
    ]


@pytest.mark.asyncio
async def test_vendors_list_hides_linked_risks_without_risks_read(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_role_department_head: Role,
    test_user_employee: User,
    monkeypatch: pytest.MonkeyPatch,
):
    await _grant(db_session, test_role_department_head, "vendors", "read")

    original_check_permission = vendor_crud.check_permission

    def deny_risk_read(current_user: User, resource: str, action: str) -> bool:
        if resource == "risks" and action == "read":
            return False
        return original_check_permission(current_user, resource, action)

    monkeypatch.setattr(vendor_crud, "check_permission", deny_risk_read)

    async def no_visible_risks(*args, **kwargs) -> set[int]:
        return set()

    monkeypatch.setattr(vendor_crud, "_get_visible_risk_ids", no_visible_risks)

    vendor = Vendor(
        name="No Risk Permission Vendor",
        process="Operations",
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
    risk = _make_risk(name="Should Stay Hidden", risk_id_code="R-777", department_id=test_department.id)
    db_session.add_all([vendor, risk])
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(risk)

    db_session.add(VendorRiskLink(vendor_id=vendor.id, risk_id=risk.id))
    await db_session.commit()

    response = await client_department_head.get("/api/v1/vendors")
    assert response.status_code == 200

    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["linked_risks"] == []


@pytest.mark.asyncio
async def test_vendor_restore_requires_vendors_delete(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    """Users without vendors:delete cannot restore vendors."""
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Restore Forbidden Vendor",
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
        status="inactive",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    forbidden = await client_employee.post(f"/api/v1/vendors/{vendor.id}/restore")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_vendor_restore_reactivates_inactive_vendor(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    """Restore endpoint sets vendor status from inactive to active."""
    await _grant(db_session, test_role_employee, "vendors", "read")
    await _grant(db_session, test_role_employee, "vendors", "delete")

    vendor = Vendor(
        name="Restore Active Vendor",
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
        status="inactive",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    restored = await client_employee.post(f"/api/v1/vendors/{vendor.id}/restore")
    assert restored.status_code == 200
    assert restored.json()["status"] == "active"
