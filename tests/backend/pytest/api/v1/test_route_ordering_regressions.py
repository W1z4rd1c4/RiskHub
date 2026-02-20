import pytest


@pytest.mark.asyncio
async def test_my_approvals_static_route_not_shadowed(auth_client):
    resp = await auth_client.get("/api/v1/approvals/my-approvals")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_vendor_slas_due_soon_static_route_not_shadowed(auth_client):
    resp = await auth_client.get("/api/v1/vendor-slas/due-soon")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_vendor_slas_overdue_static_route_not_shadowed(auth_client):
    resp = await auth_client.get("/api/v1/vendor-slas/overdue")
    assert resp.status_code == 200, resp.text
