import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User, Vendor
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_vendor_reports_rbac_employee_blocked(
    client_employee: AsyncClient,
):
    resp = await client_employee.get("/api/v1/vendor-reports/annual?year=2025&format=csv")
    assert resp.status_code == 403
    assert "vendor reports" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_vendor_reports_cro_can_export_csv(
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

    resp = await client_cro.get("/api/v1/vendor-reports/annual?year=2025&format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    resp = await client_cro.get("/api/v1/vendor-reports/dora-register?format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    removed = await client_cro.get("/api/v1/vendor-reports/annual?year=2025&format=xlsx")
    assert removed.status_code == 410
    detail = removed.json()["detail"]
    assert detail["code"] == "excel_export_removed"

    dora_removed = await client_cro.get("/api/v1/vendor-reports/dora-register?format=xlsx")
    assert dora_removed.status_code == 410
    assert dora_removed.json()["detail"]["code"] == "excel_export_removed"


@pytest.mark.asyncio
async def test_vendor_report_capabilities_reflect_backend_policy(
    client_cro: AsyncClient,
    client_employee: AsyncClient,
):
    allowed = await client_cro.get("/api/v1/vendor-reports/capabilities")
    assert allowed.status_code == 200
    assert allowed.json()["can_read"] is True
    assert allowed.json()["can_download_annual_report"] is True
    assert allowed.json()["can_download_dora_register"] is True

    denied = await client_employee.get("/api/v1/vendor-reports/capabilities")
    assert denied.status_code == 200
    assert denied.json()["can_read"] is False
    assert denied.json()["can_download_annual_report"] is False
    assert denied.json()["can_download_dora_register"] is False


@pytest.mark.asyncio
async def test_vendor_reports_annual_rejects_pdf_format(
    client_cro: AsyncClient,
):
    resp = await client_cro.get("/api/v1/vendor-reports/annual?year=2025&format=pdf")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_dora_register_excludes_inactive_vendors(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    db_session.add_all(
        [
            Vendor(
                name="Active DORA Vendor",
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
            ),
            Vendor(
                name="Inactive DORA Vendor",
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
                is_archived=True,
            ),
        ]
    )
    await db_session.commit()

    resp = await client_cro.get("/api/v1/vendor-reports/dora-register?format=csv")
    assert resp.status_code == 200
    body = resp.text
    assert "Active DORA Vendor" in body
    assert "Inactive DORA Vendor" not in body


@pytest.mark.asyncio
async def test_vendor_reports_unfiltered_include_visible_cross_department_owner_vendor(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_cro: User,
):
    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = test_department.id

    other_dept = Department(name="Vendor Report Visible Other", code="VRVO", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    visible_owned_other = Vendor(
        name="Visible Owned Other Dept Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
    )
    unrelated_other = Vendor(
        name="Hidden Unrelated Other Dept Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
    )
    inactive_owned_other = Vendor(
        name="Inactive Owned Other Dept Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
        is_archived=True,
    )
    db_session.add_all([visible_owned_other, unrelated_other, inactive_owned_other])
    await db_session.commit()

    annual = await client_cro.get("/api/v1/vendor-reports/annual?year=2026&format=csv")
    assert annual.status_code == 200
    assert "Visible Owned Other Dept Vendor" in annual.text
    assert "Hidden Unrelated Other Dept Vendor" not in annual.text
    assert "Inactive Owned Other Dept Vendor" not in annual.text

    dora = await client_cro.get("/api/v1/vendor-reports/dora-register?format=csv")
    assert dora.status_code == 200
    assert "Visible Owned Other Dept Vendor" in dora.text
    assert "Hidden Unrelated Other Dept Vendor" not in dora.text
    assert "Inactive Owned Other Dept Vendor" not in dora.text


@pytest.mark.asyncio
async def test_vendor_reports_explicit_department_is_strict_for_scoped_user(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = test_department.id

    other_dept = Department(name="Vendor Report Other", code="VROP", description="Other")
    db_session.add(other_dept)
    await db_session.commit()
    await db_session.refresh(other_dept)

    owned_other = Vendor(
        name="Owned Other Dept Report Vendor",
        process="IT",
        subprocess=None,
        department_id=other_dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=5,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=True,
        has_alternative_providers=False,
        status="active",
    )
    in_dept = Vendor(
        name="In Dept Report Vendor",
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
    db_session.add_all([owned_other, in_dept])
    await db_session.commit()

    annual = await client_cro.get(
        f"/api/v1/vendor-reports/annual?year=2026&format=csv&department_id={test_department.id}"
    )
    assert annual.status_code == 200
    assert "In Dept Report Vendor" in annual.text
    assert "Owned Other Dept Report Vendor" not in annual.text

    dora = await client_cro.get(
        f"/api/v1/vendor-reports/dora-register?format=csv&department_id={test_department.id}"
    )
    assert dora.status_code == 200
    assert "In Dept Report Vendor" in dora.text
    assert "Owned Other Dept Report Vendor" not in dora.text
