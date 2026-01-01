"""Helper functions for approval workflow."""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Control, Risk, ControlRiskLink


async def get_primary_approver_for_control(db: AsyncSession, control_id: int) -> Optional[int]:
    """
    Get the primary approver for a Control edit.
    
    Returns the owner_id of the highest-priority linked Risk.
    Priority is determined by:
    1. is_priority = True (highest priority)
    2. gross_score descending (secondary sort)
    
    Fallback: department head if no linked risks or no risk owner.
    
    Args:
        db: Database session
        control_id: ID of the control being edited
        
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
    
    # Return owner of highest-priority risk
    for risk in linked_risks:
        if risk.owner_id:
            return risk.owner_id
    
    # Fallback: department head
    if control.department and control.department.head_id:
        return control.department.head_id
    
    return None


async def check_control_requires_privileged_approval(db: AsyncSession, control_id: int) -> bool:
    """
    Check if a control edit requires privileged approval.
    
    Returns True if control is linked to any priority risk.
    
    Args:
        db: Database session
        control_id: ID of the control being edited
        
    Returns:
        True if privileged approval is required
    """
    from app.core.permissions import is_critical_risk
    
    # Query linked risks
    linked_risks_result = await db.execute(
        select(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(ControlRiskLink.control_id == control_id)
    )
    
    for risk in linked_risks_result.scalars():
        if is_critical_risk(risk):
            return True
    
    return False
