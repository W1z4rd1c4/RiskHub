import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Role, RolePermission, User, Vendor
from app.schemas.risk import RiskSummary
from app.schemas.vendor import VendorRead


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


@pytest.mark.asyncio
async def test_vendors_list_has_exact_vendorread_keys(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Leak Check Vendor",
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

    resp = await client_employee.get("/api/v1/vendors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"], "Expected at least one vendor in list"

    expected_keys = set(VendorRead.model_fields.keys())
    assert set(data["items"][0].keys()) == expected_keys


@pytest.mark.asyncio
async def test_risks_list_has_exact_risksummary_keys(
    auth_client: AsyncClient,
    test_risk,
):
    resp = await auth_client.get("/api/v1/risks")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"], "Expected at least one risk in list"

    expected_keys = set(RiskSummary.model_fields.keys())
    assert set(data["items"][0].keys()) == expected_keys
