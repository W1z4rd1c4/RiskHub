"""
API endpoints for Key Risk Indicators.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRICreate, KRIUpdate, KRIResponse, KRIListResponse
from app.api import deps
from app.core.permissions import get_user_department_ids

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])


@router.get("", response_model=KRIListResponse)
async def list_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=1000),
):
    """List all KRIs with optional filters."""
    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids:
        query = query.filter(Risk.department_id.in_(dept_ids))
    
    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)
    
    # Apply breach filter BEFORE count and pagination
    if breach_only:
        query = query.where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
            )
        )
    
    # Count total after all filters are applied
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Eagerly load risk and department for grouping metadata
    query = query.options(
        joinedload(KeyRiskIndicator.risk).joinedload(Risk.department)
    )
    
    # Paginate
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    kris = result.scalars().all()
    
    # Map to response with metadata
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)
    
    return KRIListResponse(items=items, total=total, page=page, size=size)


@router.get("/breaches", response_model=list[KRIResponse])
async def list_breaches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List only breached KRIs for dashboard widget."""
    result = await db.execute(select(KeyRiskIndicator))
    kris = result.scalars().all()
    
    # Filter to breached only
    items = [KRIResponse.model_validate(k) for k in kris]
    breaches = [i for i in items if i.breach_status != "within"]
    
    return breaches


@router.get("/{kri_id}", response_model=KRIResponse)
async def get_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single KRI by ID."""
    result = await db.execute(
        select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id)
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    return KRIResponse.model_validate(kri)


@router.post("", response_model=KRIResponse, status_code=201)
async def create_kri(
    data: KRICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Create a new KRI. Requires risk_id."""
    # Verify risk exists
    risk_result = await db.execute(
        select(Risk).where(Risk.id == data.risk_id)
    )
    if not risk_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Validate limits
    if data.lower_limit >= data.upper_limit:
        raise HTTPException(
            status_code=400, 
            detail="lower_limit must be less than upper_limit"
        )
    
    kri = KeyRiskIndicator(**data.model_dump())
    db.add(kri)
    await db.commit()
    await db.refresh(kri)
    
    return KRIResponse.model_validate(kri)


@router.put("/{kri_id}", response_model=KRIResponse)
async def update_kri(
    kri_id: int,
    data: KRIUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Update a KRI."""
    result = await db.execute(
        select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id)
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate limits if both provided
    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise HTTPException(
            status_code=400, 
            detail="lower_limit must be less than upper_limit"
        )
    
    for field, value in update_data.items():
        setattr(kri, field, value)
    
    await db.commit()
    await db.refresh(kri)
    
    return KRIResponse.model_validate(kri)


@router.delete("/{kri_id}", status_code=204)
async def delete_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Delete a KRI."""
    result = await db.execute(
        select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id)
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    await db.delete(kri)
    await db.commit()
