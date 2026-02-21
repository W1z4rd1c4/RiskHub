from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_state_machine_employee_approval_write_not_session_revoked(client_employee):
    response = await client_employee.post(
        "/api/v1/approvals/999999/approve",
        json={"resolution_notes": "state-machine-probe"},
    )
    assert response.status_code in {403, 404, 422}
    assert response.status_code != 401


@pytest.mark.asyncio
async def test_state_machine_risk_manager_cancel_not_session_revoked(client_risk_manager):
    response = await client_risk_manager.post("/api/v1/approvals/999999/cancel")
    assert response.status_code in {403, 404, 422}
    assert response.status_code != 401


@pytest.mark.asyncio
async def test_state_machine_employee_issue_close_not_session_revoked(client_employee):
    response = await client_employee.post(
        "/api/v1/issues/999999/close",
        json={"validation_note": "x", "completion_notes": "x"},
    )
    assert response.status_code in {403, 404, 422}
    assert response.status_code != 401


@pytest.mark.asyncio
async def test_state_machine_employee_vendor_delete_not_session_revoked(client_employee):
    response = await client_employee.delete("/api/v1/vendors/999999")
    assert response.status_code in {403, 404, 422}
    assert response.status_code != 401
