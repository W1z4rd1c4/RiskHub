from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, Risk, User

pytestmark = pytest.mark.contract


APPROVAL_READ_KEYS = {
    "id",
    "resource_type",
    "resource_id",
    "resource_name",
    "action_type",
    "pending_changes",
    "status",
    "reason",
    "requested_by_id",
    "requested_by_name",
    "requested_by_email",
    "resolved_by_id",
    "resolved_by_name",
    "resolved_at",
    "resolution_notes",
    "created_at",
    "can_approve",
    "can_reject",
    "capabilities",
}


async def _create_pending_approval(
    db_session: AsyncSession,
    *,
    risk: Risk,
    requester: User,
) -> ApprovalRequest:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=None,
        requested_by_id=requester.id,
        reason="Response parity approval",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()
    await db_session.refresh(approval)
    return approval


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path_template", "json_body"),
    (
        ("post", "/api/v1/approvals/{approval_id}/approve", {"resolution_notes": "Approve parity"}),
        ("post", "/api/v1/approvals/{approval_id}/reject", {"resolution_notes": "Reject parity"}),
        ("post", "/api/v1/approvals/{approval_id}/cancel", None),
        ("get", "/api/v1/approvals/{approval_id}", None),
    ),
)
async def test_approval_resolution_and_detail_endpoints_return_same_read_shape(
    client_factory,
    db_session: AsyncSession,
    test_risk: Risk,
    test_user_employee: User,
    test_user_cro: User,
    method: str,
    path_template: str,
    json_body: dict[str, str] | None,
) -> None:
    approval = await _create_pending_approval(
        db_session,
        risk=test_risk,
        requester=test_user_employee,
    )

    async with client_factory(current_user=test_user_cro) as client:
        request = getattr(client, method)
        path = path_template.format(approval_id=approval.id)
        response = await request(path, json=json_body) if json_body is not None else await request(path)

    assert response.status_code == 200
    assert set(response.json()) == APPROVAL_READ_KEYS
