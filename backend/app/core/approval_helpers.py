"""Helper functions for approval workflow."""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Control, Risk, ControlRiskLink


async def get_primary_approver_for_control(
    db: AsyncSession, 
    control_id: int,
    requester_id: Optional[int] = None,
) -> Optional[int]:
    """
    Get the primary approver for a Control edit.
    
    Returns the owner_id of the highest-priority linked Risk.
    Priority is determined by:
    1. is_priority = True (highest priority)
    2. gross_score descending (secondary sort)
    
    Fallback: department head if no linked risks or no risk owner.
    Self-approval prevention: if requester_id matches a potential approver, skip them.
    
    Args:
        db: Database session
        control_id: ID of the control being edited
        requester_id: ID of the user requesting the edit (for self-approval prevention)
        
    Returns:
        User ID of the primary approver, or None if no approver found
    """
    # Get control with department for fallback
    control_result = await db.execute(
        select(Control)
        .options(selectinload(Control.department))
        .where(Control.id == control_id)
    )
    control = control_result.scalar_one_or_none()
    if not control:
        return None
    
    # Query linked risks ordered by priority
    # First by is_priority (True first), then by gross_score descending
    linked_risks_result = await db.execute(
        select(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id == control_id)
        .order_by(Risk.is_priority.desc(), Risk.gross_score.desc())
    )
    linked_risks = linked_risks_result.scalars().all()
    
    # Return owner of highest-priority risk (skip self)
    for risk in linked_risks:
        if risk.owner_id:
            if requester_id and risk.owner_id == requester_id:
                continue  # Skip self-approval
            return risk.owner_id
    
    # Fallback: department head (skip self)
    if control.department and control.department.manager_id:
        if requester_id and control.department.manager_id == requester_id:
            return None  # Force escalation to privileged approvers
        return control.department.manager_id
    
    return None


async def check_control_requires_privileged_approval(db: AsyncSession, control_id: int) -> bool:
    """
    Check if a control edit requires privileged approval.
    
    Returns True if control is linked to any high-risk (or priority) risk.
    
    Args:
        db: Database session
        control_id: ID of the control being edited
        
    Returns:
        True if privileged approval is required
    """
    from app.core.permissions import is_high_risk_for_approval_async
    
    # Query linked risks
    linked_risks_result = await db.execute(
        select(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id == control_id)
    )
    
    for risk in linked_risks_result.scalars():
        if await is_high_risk_for_approval_async(risk, db):
            return True
    
    return False


async def get_primary_approver_for_risk(
    db: AsyncSession, 
    risk_id: int, 
    requester_id: Optional[int] = None
) -> Optional[int]:
    """
    Get primary approver for a Risk edit, preventing self-approval.
    
    Args:
        db: Database session
        risk_id: ID of the risk being edited
        requester_id: ID of the user requesting the edit (for self-approval prevention)
        
    Returns:
        User ID of the primary approver, or None if no approver found
    """
    from app.models import Department
    
    risk_result = await db.execute(
        select(Risk).options(selectinload(Risk.department)).where(Risk.id == risk_id)
    )
    risk = risk_result.scalar_one_or_none()
    if not risk:
        return None
    
    # Risk owner is primary approver (unless they're the requester)
    if risk.owner_id and risk.owner_id != requester_id:
        return risk.owner_id
    
    # Fallback: department head (unless they're the requester)
    if risk.department and risk.department.manager_id and risk.department.manager_id != requester_id:
        return risk.department.manager_id
    
    return None
