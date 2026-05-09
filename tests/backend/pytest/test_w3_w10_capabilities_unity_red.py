from __future__ import annotations

import pytest

from app.models import Vendor
from app.schemas.vendor import VendorCapabilities


@pytest.mark.asyncio
async def test_capabilities_facade_exposes_can(test_user_employee):
    from app.services.authorization_capabilities import Capabilities

    capabilities = Capabilities.for_user(test_user_employee)

    assert capabilities.can("read", "risks") is True
    assert capabilities.can("write", "risks") is False


@pytest.mark.asyncio
async def test_me_capabilities_route_returns_backend_authz_gates(
    client_factory,
    test_user_cro,
    test_user_platform_admin,
):
    async with client_factory(current_user=test_user_cro) as client:
        cro_response = await client.get("/api/v1/auth/me/capabilities")

    assert cro_response.status_code == 200, cro_response.text
    cro_capabilities = cro_response.json()
    assert cro_capabilities["can_view_riskhub"] is True
    assert cro_capabilities["can_view_admin_console"] is False
    assert cro_capabilities["can_read_risks"] is True
    assert cro_capabilities["resource_permissions"]["risks:read"] is True
    assert cro_capabilities["resource_permissions"]["issues:read"] is True

    async with client_factory(current_user=test_user_platform_admin) as client:
        admin_response = await client.get("/api/v1/auth/me/capabilities")

    assert admin_response.status_code == 200, admin_response.text
    admin_capabilities = admin_response.json()
    assert admin_capabilities["can_view_admin_console"] is True
    assert admin_capabilities["can_view_riskhub"] is False
    assert admin_capabilities["can_view_activity_log"] is False


@pytest.mark.asyncio
async def test_me_response_embeds_capabilities_for_frontend_authz(client_factory, test_user_cro):
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["me_capabilities"]["can_view_riskhub"] is True
    assert payload["me_capabilities"]["resource_permissions"]["risks:read"] is True
    assert payload["me_capabilities"]["resource_permissions"]["issues:read"] is True


def test_vendor_capabilities_live_in_capabilities_module_and_are_typed(test_user_employee):
    import app.services._vendor_workflow as vendor_workflow
    from app.services._authorization_capabilities.vendors import vendor_capabilities

    vendor = Vendor(
        id=100,
        name="Payments Processor",
        process="Payments",
        department_id=test_user_employee.department_id,
        outsourcing_owner_user_id=test_user_employee.id,
        status="active",
    )

    capabilities = vendor_capabilities(test_user_employee, vendor)

    assert isinstance(capabilities, VendorCapabilities)
    assert capabilities.can_read is True
    assert "vendor_capabilities" not in getattr(vendor_workflow, "__all__", ())
