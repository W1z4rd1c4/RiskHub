import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User, Vendor


@pytest.mark.asyncio
async def test_vendor_reports_rbac_employee_blocked(
    client_employee: AsyncClient,
):
    resp = await client_employee.get("/api/v1/vendor-reports/annual?year=2025&format=xlsx")
    assert resp.status_code == 403
    assert "vendor reports" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_vendor_reports_cro_can_export_excel(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    vendor = Vendor(
        name="Acme ICT",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    resp = await client_cro.get("/api/v1/vendor-reports/annual?year=2025&format=xlsx")
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]

    resp = await client_cro.get("/api/v1/vendor-reports/dora-register?format=xlsx")
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_vendor_reports_annual_rejects_pdf_format(
    client_cro: AsyncClient,
):
    resp = await client_cro.get("/api/v1/vendor-reports/annual?year=2025&format=pdf")
    assert resp.status_code == 422
