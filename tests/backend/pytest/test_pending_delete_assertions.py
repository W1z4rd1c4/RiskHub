from __future__ import annotations

import inspect

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from app.services._entity_mutation_lifecycle import policy
from app.services._entity_mutation_lifecycle.policy import (
    assert_no_existing_pending_delete_request,
    assert_no_pending_delete,
)


async def _add_delete_approval(db_session, *, status: ApprovalStatus = ApprovalStatus.PENDING) -> None:
    db_session.add(
        ApprovalRequest(
            resource_type=ApprovalResourceType.RISK,
            resource_id=701,
            resource_name="Pending Delete Assertion Risk",
            action_type=ApprovalActionType.DELETE,
            requested_by_id=1,
            reason="Already pending",
            status=status,
        )
    )
    await db_session.commit()


def test_pending_delete_assertions_share_one_query_helper() -> None:
    source = inspect.getsource(policy)

    assert "async def _get_pending_delete_request(" in source
    assert source.count("ApprovalRequest.action_type == ApprovalActionType.DELETE") == 1
    assert "await _get_pending_delete_request(" in inspect.getsource(assert_no_pending_delete)
    assert "await _get_pending_delete_request(" in inspect.getsource(assert_no_existing_pending_delete_request)


@pytest.mark.asyncio
async def test_pending_delete_update_assertion_keeps_conflict_contract(db_session) -> None:
    await _add_delete_approval(db_session)

    with pytest.raises(ConflictError) as exc_info:
        await assert_no_pending_delete(
            db_session,
            resource_type=ApprovalResourceType.RISK,
            resource_id=701,
            detail="Cannot update risk while deletion is pending approval",
        )

    assert exc_info.value.detail == "Cannot update risk while deletion is pending approval"


@pytest.mark.asyncio
async def test_pending_delete_archive_assertion_keeps_validation_contract(db_session) -> None:
    await _add_delete_approval(db_session)

    with pytest.raises(ValidationError) as exc_info:
        await assert_no_existing_pending_delete_request(
            db_session,
            resource_type=ApprovalResourceType.RISK,
            resource_id=701,
            detail="Deletion request already pending",
        )

    assert exc_info.value.detail == "Deletion request already pending"


@pytest.mark.parametrize("status", [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED])
@pytest.mark.asyncio
async def test_terminal_delete_approvals_do_not_block_active_entities(db_session, status: ApprovalStatus) -> None:
    await _add_delete_approval(db_session, status=status)

    await assert_no_pending_delete(
        db_session,
        resource_type=ApprovalResourceType.RISK,
        resource_id=701,
        detail="Cannot update risk while deletion is pending approval",
    )
    await assert_no_existing_pending_delete_request(
        db_session,
        resource_type=ApprovalResourceType.RISK,
        resource_id=701,
        detail="Deletion request already pending",
    )
