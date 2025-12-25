from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Risk, ControlRiskLink
from app.schemas.risk import (
    RiskCreate, RiskUpdate, RiskRead, RiskSummary,
    RiskTypeEnum, RiskStatusEnum,
    ControlRiskLinkFromRisk, ControlRiskLinkRead, ControlEffectivenessEnum,
)
from app.core.security import get_current_user, check_permission, require_permission

router = APIRouter()


# ============== CRUD Operations ==============

@router.get("", response_model=list[RiskSummary])
async def list_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[RiskStatusEnum] = None,
    risk_type: Optional[RiskTypeEnum] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
):
    """
    List risks with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's risks.
    """
    query = select(Risk)
    
    # Department filtering based on role
    is_privileged = check_permission(current_user, "risks", "read_all") or \
                    current_user.role.name in ["admin", "cro", "risk_manager"]
    
    if not is_privileged and current_user.department_id:
        query = query.where(Risk.department_id == current_user.department_id)
    elif department_id:
        query = query.where(Risk.department_id == department_id)
    
    # Status filter
    if status:
        query = query.where(Risk.status == status.value)
    else:
        # Default: exclude archived
        query = query.where(Risk.status != RiskStatusEnum.archived.value)
    
    # Risk type filter
    if risk_type:
        query = query.where(Risk.risk_type == risk_type.value)
    
    # Priority filter
    if is_priority is not None:
        query = query.where(Risk.is_priority == is_priority)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )
    
    # Pagination
    query = query.offset(skip).limit(limit).order_by(Risk.risk_id_code)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single risk with all relationships."""
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
        )
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    return risk


@router.post("", response_model=RiskRead, status_code=status.HTTP_201_CREATED)
async def create_risk(
    risk_data: RiskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new risk. Requires risks:write permission."""
    # Calculate scores
    gross_score = risk_data.gross_probability * risk_data.gross_impact
    net_score = risk_data.net_probability * risk_data.net_impact
    
    risk = Risk(
        risk_id_code=risk_data.risk_id_code,
        process=risk_data.process,
        subprocess=risk_data.subprocess,
        risk_type=risk_data.risk_type.value,
        category=risk_data.category,
        description=risk_data.description,
        department_id=risk_data.department_id,
        owner_id=risk_data.owner_id,
        gross_probability=risk_data.gross_probability,
        gross_impact=risk_data.gross_impact,
        gross_score=gross_score,
        net_probability=risk_data.net_probability,
        net_impact=risk_data.net_impact,
        net_score=net_score,
        status=risk_data.status.value,
        is_priority=risk_data.is_priority,
        kri_indicator=risk_data.kri_indicator,
        kri_threshold_green=risk_data.kri_threshold_green,
        kri_threshold_yellow=risk_data.kri_threshold_yellow,
        kri_threshold_red=risk_data.kri_threshold_red,
    )
    
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    
    # Reload with relationships
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
        )
        .where(Risk.id == risk.id)
    )
    return result.scalar_one()


@router.put("/{risk_id}", response_model=RiskRead)
async def update_risk(
    risk_id: int,
    risk_data: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a risk. Requires risks:write permission OR being the risk owner.
    """
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Check permission: either risks:write or is risk owner
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id
    
    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: risks:write or risk owner required"
        )
    
    # Update fields
    update_data = risk_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(value, 'value'):  # Handle enums
            value = value.value
        setattr(risk, field, value)
    
    # Recalculate scores if probability/impact changed
    risk.gross_score = risk.gross_probability * risk.gross_impact
    risk.net_score = risk.net_probability * risk.net_impact
    
    await db.commit()
    await db.refresh(risk)
    
    # Reload with relationships
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
        )
        .where(Risk.id == risk.id)
    )
    return result.scalar_one()


@router.delete("/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """
    Soft delete a risk (set status to archived).
    Requires risks:delete permission.
    """
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    risk.status = RiskStatusEnum.archived.value
    
    await db.commit()


# ============== Risk-Control Linking Endpoints ==============

@router.get("/{risk_id}/controls", response_model=list[ControlRiskLinkRead])
async def list_risk_controls(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List controls that mitigate this risk."""
    # Verify risk exists
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Risk not found")
    
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.risk_id == risk_id)
    )
    return result.scalars().all()


@router.post("/{risk_id}/controls", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_risk_to_control(
    risk_id: int,
    link_data: ControlRiskLinkFromRisk,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Link a risk to a control."""
    from app.models import Control
    
    # Verify risk exists
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == link_data.control_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Check if link already exists
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == link_data.control_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")
    
    link = ControlRiskLink(
        control_id=link_data.control_id,
        risk_id=risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
    )
    
    db.add(link)
    await db.commit()
    await db.refresh(link)
    
    # Reload with relationships
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.id == link.id)
    )
    return result.scalar_one()


@router.delete("/{risk_id}/controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_risk_from_control(
    risk_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Remove link between risk and control."""
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == control_id)
    )
    link = result.scalar_one_or_none()
    
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    await db.delete(link)
    await db.commit()
