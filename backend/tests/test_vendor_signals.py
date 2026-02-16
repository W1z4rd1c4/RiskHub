import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Department, User, Vendor


@pytest.mark.asyncio
async def test_vendor_signals_refresh_creates_error_signal_when_not_configured(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    vendor = Vendor(
        name="Registry Vendor",
        process="Ops",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        registration_id="REG-123",
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

    resp = await auth_client.post(f"/api/v1/vendors/{vendor.id}/signals/refresh", json={})
    assert resp.status_code == 200
    items = resp.json()
    assert items
    assert items[0]["provider_key"] == "public_registry"
    assert items[0]["status"] == "error"


@pytest.mark.asyncio
async def test_vendor_signals_refresh_ok_when_registry_available(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("VENDOR_SIGNALS_PUBLIC_REGISTRY_BASE_URL", "https://registry.test/api")
    get_settings.cache_clear()

    async def mock_get(self, url: str, params=None, headers=None):  # noqa: ANN001
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            json={
                "status": "active",
                "address": "Example Street 1",
                "filings_url": "https://registry.test/filings/REG-999",
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get, raising=True)

    vendor = Vendor(
        name="Registry Vendor OK",
        process="Ops",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        registration_id="REG-999",
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

    resp = await auth_client.post(f"/api/v1/vendors/{vendor.id}/signals/refresh", json={})
    assert resp.status_code == 200
    items = resp.json()
    assert items
    assert any(i["status"] == "ok" for i in items)
    ok_item = next(i for i in items if i["status"] == "ok")
    assert ok_item["provider_key"] == "public_registry"
    assert ok_item["signal_type"] == "company_profile"
    assert ok_item["payload_json"]["company_status"] == "active"
