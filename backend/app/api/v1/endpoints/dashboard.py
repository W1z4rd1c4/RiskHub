"""
Dashboard API endpoints for executive and department-level metrics.
"""
from typing import Optional, Literal
import logging
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User, Control, Risk, Department, ControlExecution
from app.models.control import ControlStatus, ControlForm, ControlFrequency
from app.models.risk import RiskStatus
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    DepartmentMetrics,
    RiskDistributionResponse,
    RiskDistributionItem,
    ControlFrequencyTrend,
)
from app.api import deps
from app.core.permissions import get_user_department_ids

router = APIRouter()
logger = logging.getLogger(__name__)

# Risk level score ranges
RISK_LEVEL_RANGES = {
    "critical": (15, 25),  # scores 15-25
    "high": (10, 14),       # scores 10-14
    "medium": (5, 9),       # scores 5-9
    "low": (1, 4),          # scores 1-4
}


def build_risk_level_condition(risk_level: str):
    """Build SQLAlchemy condition for risk level filtering."""
    if risk_level not in RISK_LEVEL_RANGES:
        return None
    min_score, max_score = RISK_LEVEL_RANGES[risk_level]
    return and_(Risk.net_score >= min_score, Risk.net_score <= max_score)


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    control_status: Optional[str] = Query(None, description="Filter by control status"),
    control_form: Optional[str] = Query(None, description="Filter by control form"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(None, description="Filter by risk level"),
    include_archived: bool = Query(False, description="Include archived items"),
):
    """Get overview statistics for executive dashboard with optional filters."""
    
    # Apply department filtering
    dept_ids = get_user_department_ids(current_user)
    control_dept_filter = None
    risk_dept_filter = None
    
    if dept_ids is not None:
        control_dept_filter = Control.department_id.in_(dept_ids)
        risk_dept_filter = Risk.department_id.in_(dept_ids)
    elif department_id:
        control_dept_filter = Control.department_id == department_id
        risk_dept_filter = Risk.department_id == department_id
    
    # Build control filters
    control_conditions = []
    if control_dept_filter is not None:
        control_conditions.append(control_dept_filter)
    if control_status:
        control_conditions.append(Control.status == control_status)
    elif not include_archived:
        # Default: exclude archived unless status filter or include_archived is set
        control_conditions.append(Control.status != ControlStatus.archived.value)
    if control_form:
        control_conditions.append(Control.control_form == control_form)
    
    # Build risk filters
    risk_conditions = []
    if risk_dept_filter is not None:
        risk_conditions.append(risk_dept_filter)
    if not include_archived:
        risk_conditions.append(Risk.status != RiskStatus.archived.value)
    if risk_level:
        risk_level_cond = build_risk_level_condition(risk_level)
        if risk_level_cond is not None:
            risk_conditions.append(risk_level_cond)
    
    # Total controls
    control_query = select(func.count(Control.id))
    if control_conditions:
        control_query = control_query.where(and_(*control_conditions))
    total_controls_result = await db.execute(control_query)
    total_controls = total_controls_result.scalar() or 0
    
    # Controls by status
    controls_by_status = {}
    for status in ControlStatus:
        conditions = [Control.status == status.value] + control_conditions
        result = await db.execute(
            select(func.count(Control.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_status[status.value] = count
    
    # Controls by form
    controls_by_form = {}
    for form in ControlForm:
        # Avoid including the form filter itself in the breakdown
        other_control_conditions = [c for c in control_conditions if not (hasattr(c, 'right') and str(c.right) == control_form)]
        conditions = [Control.control_form == form.value] + other_control_conditions
        result = await db.execute(
            select(func.count(Control.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_form[form.value] = count
    
    # Controls by frequency
    controls_by_frequency = {}
    for freq in ControlFrequency:
        conditions = [Control.frequency == freq.value] + control_conditions
        result = await db.execute(
            select(func.count(Control.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_frequency[freq.value] = count
    
    # Total risks
    risk_query = select(func.count(Risk.id))
    if risk_conditions:
        risk_query = risk_query.where(and_(*risk_conditions))
    total_risks_result = await db.execute(risk_query)
    total_risks = total_risks_result.scalar() or 0
    
    # Risks by status
    risks_by_status = {}
    for status in RiskStatus:
        conditions = [Risk.status == status.value] + risk_conditions
        result = await db.execute(
            select(func.count(Risk.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            risks_by_status[status.value] = count
    
    # Critical risks (net_score >= 15)
    critical_conditions = [Risk.net_score >= 15] + risk_conditions
    critical_result = await db.execute(
        select(func.count(Risk.id)).where(and_(*critical_conditions))
    )
    critical_risks_count = critical_result.scalar() or 0
    
    # Average net risk score
    avg_query = select(func.avg(Risk.net_score))
    if risk_conditions:
        avg_query = avg_query.where(and_(*risk_conditions))
    avg_result = await db.execute(avg_query)
    average_net_risk_score = float(avg_result.scalar() or 0)
    
    return DashboardSummaryResponse(
        total_controls=total_controls,
        controls_by_status=controls_by_status,
        controls_by_form=controls_by_form,
        controls_by_frequency=controls_by_frequency,
        total_risks=total_risks,
        risks_by_status=risks_by_status,
        critical_risks_count=critical_risks_count,
        average_net_risk_score=round(average_net_risk_score, 2),
    )


@router.get("/departments", response_model=list[DepartmentMetrics])
async def get_department_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter to specific department"),
    include_archived: bool = Query(False, description="Include archived items"),
):
    """Get per-department statistics, optionally filtered to a single department."""
    dept_ids = get_user_department_ids(current_user)

    # Get departments (filtered if department_id provided)
    dept_query = select(Department)
    if dept_ids is not None:
        dept_query = dept_query.where(Department.id.in_(dept_ids))
    elif department_id:
        dept_query = dept_query.where(Department.id == department_id)
    dept_result = await db.execute(dept_query)
    departments = dept_result.scalars().all()
    
    metrics = []
    for dept in departments:
        # Control count (exclude archived by default)
        control_query = select(func.count(Control.id)).where(Control.department_id == dept.id)
        if not include_archived:
            control_query = control_query.where(Control.status != ControlStatus.archived.value)
        control_count_result = await db.execute(control_query)
        control_count = control_count_result.scalar() or 0
        
        # Active control count for compliance rate
        active_control_result = await db.execute(
            select(func.count(Control.id)).where(
                Control.department_id == dept.id,
                Control.status == ControlStatus.active.value
            )
        )
        active_control_count = active_control_result.scalar() or 0
        
        # Risk count (exclude archived by default)
        risk_query = select(func.count(Risk.id)).where(Risk.department_id == dept.id)
        if not include_archived:
            risk_query = risk_query.where(Risk.status != RiskStatus.archived.value)
        risk_count_result = await db.execute(risk_query)
        risk_count = risk_count_result.scalar() or 0
        
        # High risk count (net_score >= 12, exclude archived by default)
        high_risk_query = select(func.count(Risk.id)).where(
            Risk.department_id == dept.id,
            Risk.net_score >= 12
        )
        if not include_archived:
            high_risk_query = high_risk_query.where(Risk.status != RiskStatus.archived.value)
        high_risk_result = await db.execute(high_risk_query)
        high_risk_count = high_risk_result.scalar() or 0
        
        # Compliance rate
        compliance_rate = (active_control_count / control_count) if control_count > 0 else 0.0
        
        metrics.append(DepartmentMetrics(
            department_id=dept.id,
            department_name=dept.name,
            control_count=control_count,
            risk_count=risk_count,
            high_risk_count=high_risk_count,
            compliance_rate=round(compliance_rate, 2),
        ))
    
    return metrics


@router.get("/risk-distribution", response_model=RiskDistributionResponse)
async def get_risk_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(None, description="Filter by risk level"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk distribution for 5x5 risk matrix visualization with optional filters."""
    dept_ids = get_user_department_ids(current_user)

    # Build conditions
    conditions = []
    if not include_archived:
        conditions.append(Risk.status != RiskStatus.archived.value)
    if dept_ids is not None:
        conditions.append(Risk.department_id.in_(dept_ids))
    elif department_id:
        conditions.append(Risk.department_id == department_id)
    if risk_level:
        risk_level_cond = build_risk_level_condition(risk_level)
        if risk_level_cond is not None:
            conditions.append(risk_level_cond)
    
    # Group risks by net_probability and net_impact
    distribution_query = select(
        Risk.net_probability,
        Risk.net_impact,
        func.count(Risk.id).label('count')
    )
    
    if conditions:
        distribution_query = distribution_query.where(and_(*conditions))
    
    distribution_query = distribution_query.group_by(Risk.net_probability, Risk.net_impact)
    
    result = await db.execute(distribution_query)
    rows = result.all()
    
    distribution = [
        RiskDistributionItem(
            probability=row.net_probability,
            impact=row.net_impact,
            count=row.count
        )
        for row in rows
        if row.net_probability and row.net_impact
    ]
    
    return RiskDistributionResponse(distribution=distribution)


@router.get("/control-trends", response_model=list[ControlFrequencyTrend])
async def get_control_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    response: Response = None,
    department_id: Optional[int] = Query(None, description="Filter by department"),
    control_status: Optional[str] = Query(None, description="Filter by control status"),
):
    """Get control execution trends by week (last 8 weeks) with optional filters."""
    
    try:
        dept_ids = get_user_department_ids(current_user)

        # Early return for users with no department access
        if dept_ids is not None and len(dept_ids) == 0:
            return []  # User has no department access - return empty results

        # Build base conditions
        conditions = [ControlExecution.executed_at.isnot(None)]
        
        # For department filtering, we need to join with Control
        if dept_ids is not None or department_id or control_status:
            # Build subquery for control IDs matching filters
            control_conditions = []
            if dept_ids is not None:
                control_conditions.append(Control.department_id.in_(dept_ids))
            elif department_id:
                control_conditions.append(Control.department_id == department_id)
            if control_status:
                control_conditions.append(Control.status == control_status)
            
            control_ids_query = select(Control.id).where(and_(*control_conditions))
            conditions.append(ControlExecution.control_id.in_(control_ids_query))
        
        # Check if there are any executions matching conditions
        count_query = select(func.count(ControlExecution.id))
        if len(conditions) > 1:
            count_query = count_query.where(and_(*conditions))
        else:
            count_query = count_query.where(conditions[0])
        count_result = await db.execute(count_query)
        total_count = count_result.scalar() or 0
        
        if total_count == 0:
            return []
        
        # Query control executions grouped by ISO week
        trends_query = select(
            func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW').label('period'),
            func.count(ControlExecution.id).label('execution_count')
        )
        
        if len(conditions) > 1:
            trends_query = trends_query.where(and_(*conditions))
        else:
            trends_query = trends_query.where(conditions[0])
        
        trends_query = trends_query.group_by(
            func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW')
        ).order_by(
            func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW').desc()
        ).limit(8)
        
        result = await db.execute(trends_query)
        rows = result.all()
        
        trends = [
            ControlFrequencyTrend(
                period=row.period,
                execution_count=row.execution_count
            )
            for row in rows
            if row.period
        ]
        
        # Reverse to show oldest first for charts
        return list(reversed(trends))
    except Exception as e:
        # Log the error for observability
        logger.exception("Error fetching control trends: %s", str(e))
        # Signal error via response header if response object available
        if response is not None:
            response.headers["X-Control-Trends-Error"] = "1"
        return []


@router.get("/risks-by-cell", response_model=list[dict])
async def get_risks_by_cell(
    probability: int = Query(..., ge=1, le=5, description="Probability value (1-5)"),
    impact: int = Query(..., ge=1, le=5, description="Impact value (1-5)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get list of risks at a specific probability/impact intersection for drill-down."""
    
    dept_ids = get_user_department_ids(current_user)

    conditions = [
        Risk.net_probability == probability,
        Risk.net_impact == impact
    ]
    
    if not include_archived:
        conditions.append(Risk.status != RiskStatus.archived.value)
    
    if dept_ids is not None:
        conditions.append(Risk.department_id.in_(dept_ids))
    elif department_id:
        conditions.append(Risk.department_id == department_id)
    
    query = select(
        Risk.id,
        Risk.risk_id_code,
        Risk.description,
        Risk.net_score,
        Department.name.label('department_name')
    ).join(
        Department, Risk.department_id == Department.id, isouter=True
    ).where(
        and_(*conditions)
    ).order_by(Risk.net_score.desc())
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": row.id,
            "name": row.risk_id_code,  # Use risk_id_code as display name
            "description": row.description[:100] + "..." if len(row.description) > 100 else row.description,
            "net_score": row.net_score,
            "department_name": row.department_name or "Unassigned"
        }
        for row in rows
    ]
