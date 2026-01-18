"""Tests for approval request uniqueness constraint.

Verifies that the ux_approval_pending partial unique index correctly prevents
duplicate PENDING/PENDING_PRIVILEGED approvals for the same (resource_type, resource_id, action_type).
"""
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from app.models.approval_request import (
    ApprovalRequest,
    ApprovalStatus,
    ApprovalResourceType,
    ApprovalActionType,
)


@pytest.mark.asyncio
async def test_duplicate_pending_approval_blocked_at_db_level(db_session, test_user):
    """Test that database blocks duplicate pending approvals for same resource/action.
    
    This tests the ux_approval_pending partial unique index directly.
    The index should prevent two PENDING approvals for the same triple.
    """
    # Create first pending approval
    approval1 = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=999,
        resource_name="Test Risk for Uniqueness",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="First approval request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval1)
    await db_session.commit()
    
    # Attempt to create duplicate pending approval - should fail
    approval2 = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=999,  # Same resource
        resource_name="Test Risk for Uniqueness",
        action_type=ApprovalActionType.DELETE,  # Same action
        requested_by_id=test_user.id,
        reason="Duplicate approval request",
        status=ApprovalStatus.PENDING,  # Also PENDING
    )
    db_session.add(approval2)
    
    with pytest.raises(IntegrityError) as exc_info:
        await db_session.commit()
    
    # Verify it's the uniqueness constraint that failed
    assert "ux_approval_pending" in str(exc_info.value) or "unique" in str(exc_info.value).lower()
    
    # Rollback and verify we can still create approvals for different resources
    await db_session.rollback()


@pytest.mark.asyncio
async def test_pending_privileged_also_blocked(db_session, test_user):
    """Test that PENDING_PRIVILEGED status is also covered by uniqueness constraint."""
    # Create PENDING_PRIVILEGED approval
    approval1 = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=888,
        resource_name="Test Control",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user.id,
        reason="First approval",
        status=ApprovalStatus.PENDING_PRIVILEGED,
    )
    db_session.add(approval1)
    await db_session.commit()
    
    # Attempt duplicate with PENDING status - should also fail
    # (same resource/action, both are in "pending queue")
    approval2 = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=888,
        resource_name="Test Control",
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user.id,
        reason="Duplicate approval",
        status=ApprovalStatus.PENDING,  # Different pending status
    )
    db_session.add(approval2)
    
    with pytest.raises(IntegrityError):
        await db_session.commit()
    
    await db_session.rollback()


@pytest.mark.asyncio
async def test_different_action_types_allowed(db_session, test_user):
    """Test that same resource can have pending approvals for different action types."""
    # Create pending DELETE approval
    delete_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=777,
        resource_name="Test KRI",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="Delete request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(delete_approval)
    await db_session.commit()
    
    # Create pending EDIT approval for same resource - should succeed
    edit_approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=777,  # Same resource
        resource_name="Test KRI",
        action_type=ApprovalActionType.EDIT,  # Different action
        requested_by_id=test_user.id,
        reason="Edit request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(edit_approval)
    await db_session.commit()  # Should succeed
    
    # Verify both exist
    assert delete_approval.id is not None
    assert edit_approval.id is not None


@pytest.mark.asyncio
async def test_resolved_approval_allows_new_pending(db_session, test_user, privileged_user):
    """Test that after resolving an approval, a new pending one can be created."""
    # Create and resolve first approval
    approval1 = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=666,
        resource_name="Test Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="First request",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval1)
    await db_session.commit()
    
    # Resolve it (APPROVED status is not in the pending queue)
    approval1.status = ApprovalStatus.APPROVED
    approval1.resolved_by_id = privileged_user.id
    await db_session.commit()
    
    # Now we should be able to create new pending approval for same resource/action
    approval2 = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=666,
        resource_name="Test Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=test_user.id,
        reason="Second request after first was approved",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval2)
    await db_session.commit()  # Should succeed
    
    assert approval2.id is not None


@pytest.mark.asyncio
async def test_index_exists_in_database(db_session):
    """Verify the ux_approval_pending index actually exists in the database."""
    result = await db_session.execute(text("""
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'approval_requests' 
        AND indexname = 'ux_approval_pending'
    """))
    rows = result.fetchall()
    
    assert len(rows) == 1, "ux_approval_pending index should exist"
    
    index_def = rows[0][1].lower()
    # Verify the predicate covers all pending statuses
    assert "pending" in index_def
    assert "unique" in index_def
