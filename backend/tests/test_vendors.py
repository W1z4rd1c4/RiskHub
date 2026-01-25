import pytest

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Role, RolePermission, User, Vendor
from app.models.user import AccessScope


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()


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

