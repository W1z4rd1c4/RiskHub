from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.db.session import get_db
from app.models import Department, User, Risk, Control, ControlExecution, KeyRiskIndicator
from app.models.risk import RiskStatus
from app.models.control import ControlStatus, ControlForm, ControlFrequency
from app.schemas.department import (
    DepartmentRead,
    DepartmentSummary,
    DepartmentDetail,
    RiskDistribution,
    ControlStats,
    RecentExecution,
)
from app.schemas.risk import RiskSummary
from app.schemas.control import ControlSummary
from app.schemas.kri import KRIResponse
from app.api import deps
from app.core.permissions import get_user_department_ids


router = APIRouter()


# Risk level score ranges
RISK_LEVEL_RANGES = {
    "critical": (16, 25),
    "high": (10, 15),
    "medium": (5, 9),
    "low": (1, 4),
}


@router.get("", response_model=list[DepartmentSummary])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List all departments with summary statistics."""
    query = select(Department).order_by(Department.name)
    
    # Apply department filtering
    dept_ids = get_user_department_ids(current_user)
    if dept_ids:
        query = query.filter(Department.id.in_(dept_ids))
    
    result = await db.execute(query)
    departments = result.scalars().all()
    
    summaries = []
    for dept in departments:
        # Count users
        user_count_result = await db.execute(
            select(func.count(User.id)).where(User.department_id == dept.id)
        )
        user_count = user_count_result.scalar() or 0
        
        # Count risks
        risk_count_result = await db.execute(
            select(func.count(Risk.id)).where(
                and_(
                    Risk.department_id == dept.id,
                    Risk.status != RiskStatus.archived.value
                )
            )
        )
        risk_count = risk_count_result.scalar() or 0
        
        # Count KRIs (only from non-archived risks)
        kri_count_result = await db.execute(
            select(func.count(KeyRiskIndicator.id))
            .join(Risk)
            .where(
                and_(
                    Risk.department_id == dept.id,
                    Risk.status != RiskStatus.archived.value
                )
            )
        )
        kri_count = kri_count_result.scalar() or 0
        
        # Count high risks (net_score >= 16)
        high_risk_count_result = await db.execute(
            select(func.count(Risk.id)).where(
                and_(
                    Risk.department_id == dept.id,
                    Risk.status != RiskStatus.archived.value,
                    Risk.net_score >= 16
                )
            )
        )
        high_risk_count = high_risk_count_result.scalar() or 0
        
        # Count controls
        control_count_result = await db.execute(
            select(func.count(Control.id)).where(Control.department_id == dept.id)
        )
        control_count = control_count_result.scalar() or 0
        
        summaries.append(DepartmentSummary(
            id=dept.id,
            name=dept.name,
            code=dept.code,
            user_count=user_count,
            risk_count=risk_count,
            control_count=control_count,
            high_risk_count=high_risk_count,
            kri_count=kri_count,
        ))
    
    return summaries


@router.get("/{department_id}", response_model=DepartmentDetail)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed department information with metrics."""
    result = await db.execute(
        select(Department).where(Department.id == department_id)
    )
    dept = result.scalar_one_or_none()
    
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Count users
    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.department_id == department_id)
    )
    user_count = user_count_result.scalar() or 0
    
    # Count risks
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
    )
    risk_count = risk_count_result.scalar() or 0
    
    # Count controls
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(Control.department_id == department_id)
    )
    control_count = control_count_result.scalar() or 0
    
    # Count KRIs (only from non-archived risks)
    kri_count_result = await db.execute(
        select(func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
    )
    kri_count = kri_count_result.scalar() or 0

    # Risk distribution by level
    risk_distribution = RiskDistribution()
    for level, (min_score, max_score) in RISK_LEVEL_RANGES.items():
        count_result = await db.execute(
            select(func.count(Risk.id)).where(
                and_(
                    Risk.department_id == department_id,
                    Risk.status != RiskStatus.archived.value,
                    Risk.net_score >= min_score,
                    Risk.net_score <= max_score
                )
            )
        )
        setattr(risk_distribution, level, count_result.scalar() or 0)
    
    # Risk by status
    risk_by_status = {}
    for status in RiskStatus:
        if status == RiskStatus.archived:
            continue
        count_result = await db.execute(
            select(func.count(Risk.id)).where(
                and_(
                    Risk.department_id == department_id,
                    Risk.status == status.value
                )
            )
        )
        count = count_result.scalar() or 0
        if count > 0:
            risk_by_status[status.value] = count

    # Control stats
    control_stats = ControlStats(
        total=control_count,
        active=0,
        inactive=0,
        by_form={},
        by_frequency={}
    )
    
    # Controls by status
    for status in [ControlStatus.active, ControlStatus.inactive]:
        count_result = await db.execute(
            select(func.count(Control.id)).where(
                and_(
                    Control.department_id == department_id,
                    Control.status == status.value
                )
            )
        )
        count = count_result.scalar() or 0
        if status == ControlStatus.active:
            control_stats.active = count
        else:
            control_stats.inactive = count
    
    # Controls by form
    for form in ControlForm:
        count_result = await db.execute(
            select(func.count(Control.id)).where(
                and_(
                    Control.department_id == department_id,
                    Control.control_form == form.value
                )
            )
        )
        count = count_result.scalar() or 0
        if count > 0:
            control_stats.by_form[form.value] = count
    
    # Controls by frequency
    for freq in ControlFrequency:
        count_result = await db.execute(
            select(func.count(Control.id)).where(
                and_(
                    Control.department_id == department_id,
                    Control.frequency == freq.value
                )
            )
        )
        count = count_result.scalar() or 0
        if count > 0:
            control_stats.by_frequency[freq.value] = count
    
    # Recent executions
    exec_result = await db.execute(
        select(ControlExecution)
        .join(Control)
        .options(
            selectinload(ControlExecution.control),
            selectinload(ControlExecution.executed_by)
        )
        .where(Control.department_id == department_id)
        .order_by(ControlExecution.executed_at.desc())
        .limit(10)
    )
    executions = exec_result.scalars().all()
    
    recent_executions = [
        RecentExecution(
            id=ex.id,
            control_id=ex.control_id,
            control_name=ex.control.name if ex.control else "Unknown",
            result=ex.result,
            executed_at=ex.executed_at,
            executed_by=ex.executed_by.name if ex.executed_by else "Unknown"
        )
        for ex in executions
    ]
    
    return DepartmentDetail(
        id=dept.id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
        user_count=user_count,
        risk_count=risk_count,
        control_count=control_count,
        kri_count=kri_count,
        risk_distribution=risk_distribution,
        risk_by_status=risk_by_status,
        control_stats=control_stats,
        recent_executions=recent_executions,
    )


@router.get("/{department_id}/risks", response_model=list[RiskSummary])
async def list_department_risks(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
):
    """List risks for a specific department with KRI metadata."""
    # Verify department exists
    dept_result = await db.execute(
        select(Department).where(Department.id == department_id)
    )
    if not dept_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Load risks with their KRIs eagerly
    query = (
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.kris)  # Load KRIs for count and breach check
        )
        .where(Risk.department_id == department_id)
    )
    
    if status:
        query = query.where(Risk.status == status)
    else:
        query = query.where(Risk.status != RiskStatus.archived.value)
    
    query = query.offset(skip).limit(limit).order_by(Risk.risk_id_code)
    
    result = await db.execute(query)
    risks = result.scalars().all()
    
    # Build response with KRI metadata
    items = []
    for r in risks:
        kris = r.kris if r.kris else []
        kri_count = len(kris)
        # Check if any KRI is in breach (outside limits)
        has_breach = any(
            k.current_value < k.lower_limit or k.current_value > k.upper_limit
            for k in kris
        )
        
        items.append({
            **{c.name: getattr(r, c.name) for c in Risk.__table__.columns},
            "department_name": r.department.name if r.department else None,
            "gross_probability": r.gross_probability,
            "gross_impact": r.gross_impact,
            "kri_count": kri_count,
            "has_breach": has_breach,
        })
    
    return items


@router.get("/{department_id}/controls", response_model=list[ControlSummary])
async def list_department_controls(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
):
    """List controls for a specific department."""
    # Verify department exists
    dept_result = await db.execute(
        select(Department).where(Department.id == department_id)
    )
    if not dept_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Department not found")
    
    query = select(Control).where(Control.department_id == department_id)
    
    if status:
        query = query.where(Control.status == status)
    
    query = query.offset(skip).limit(limit).order_by(Control.name)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{department_id}/kris", response_model=list[KRIResponse])
async def list_department_kris(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """List KRIs for a specific department."""
    
    # Verify department exists
    dept_result = await db.execute(
        select(Department).where(Department.id == department_id)
    )
    if not dept_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Query KRIs via Risk (exclude archived risks)
    query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
        .options(joinedload(KeyRiskIndicator.risk).joinedload(Risk.department))
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    kris = result.scalars().all()
    
    # Map to response with metadata (same logic as in kris.py)
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)
        
    return items
