import pytest


@pytest.mark.asyncio
async def test_my_approvals_static_route_not_shadowed(auth_client):
    resp = await auth_client.get("/api/v1/approvals/my-approvals")
    assert resp.status_code == 200, resp.text
