"""
Dashboard API endpoints for executive and department-level metrics.
"""
from typing import Optional, Literal
import logging
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select, func, and_, or_, cast, String
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
    RiskTrendPoint,
    KRIBreachTrendPoint,
)
from app.models.kri_history import KRIValueHistory
from app.models.key_risk_indicator import KeyRiskIndicator
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
    # Only include "active" departments: system departments or those with active users
    active_dept_ids = select(User.department_id).where(
        and_(User.department_id.isnot(None), User.is_active == True)
    ).distinct()

    dept_query = select(Department).where(
        or_(
            Department.is_system == True,
            Department.id.in_(active_dept_ids)
        )
    )

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
        
        # Audited control count (controls with at least one execution)
        audited_control_query = select(func.count(Control.id.distinct())).join(ControlExecution).where(
            Control.department_id == dept.id
        )
        if not include_archived:
            audited_control_query = audited_control_query.where(Control.status != ControlStatus.archived.value)
        audited_control_result = await db.execute(audited_control_query)
        audited_control_count = audited_control_result.scalar() or 0

        # Breaching KRI count (KRIs linked to department's risks, outside limits)
        breaching_kri_query = select(func.count(KeyRiskIndicator.id.distinct())).join(Risk).where(
            Risk.department_id == dept.id,
            Risk.status != RiskStatus.archived.value,
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
            )
        )
        breaching_kri_result = await db.execute(breaching_kri_query)
        breaching_kri_count = breaching_kri_result.scalar() or 0
        
        # Total KRI count (KRIs linked to department's risks)
        total_kri_query = select(func.count(KeyRiskIndicator.id.distinct())).join(Risk).where(
            Risk.department_id == dept.id,
            Risk.status != RiskStatus.archived.value
        )
        total_kri_result = await db.execute(total_kri_query)
        total_kri_count = total_kri_result.scalar() or 0
        
        # Compliance rate
        compliance_rate = (active_control_count / control_count) if control_count > 0 else 0.0
        
        metrics.append(DepartmentMetrics(
            department_id=dept.id,
            department_name=dept.name,
            control_count=control_count,
            risk_count=risk_count,
            high_risk_count=high_risk_count,
            audited_control_count=audited_control_count,
            breaching_kri_count=breaching_kri_count,
            total_kri_count=total_kri_count,
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


@router.get("/risk-trends", response_model=list[RiskTrendPoint])
async def get_risk_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk creation trends by month (last 12 months)."""
    try:
        dept_ids = get_user_department_ids(current_user)

        # Early return for users with no department access
        if dept_ids is not None and len(dept_ids) == 0:
            return []

        # Build conditions
        conditions = []
        if not include_archived:
            conditions.append(Risk.status != RiskStatus.archived.value)
        if dept_ids is not None:
            conditions.append(Risk.department_id.in_(dept_ids))
        elif department_id:
            conditions.append(Risk.department_id == department_id)

        # Query risk counts grouped by month
        period_label = func.to_char(Risk.created_at, 'YYYY-MM').label('period')
        query = select(
            period_label,
            func.count(Risk.id).label('total_new'),
            func.sum(
                func.case((Risk.net_score >= 15, 1), else_=0)
            ).label('critical_new')
        )
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.group_by(period_label).order_by(period_label.desc()).limit(12)
        
        result = await db.execute(query)
        rows = result.all()
        
        # Reverse to show oldest first
        trends = [
            RiskTrendPoint(
                period=row.period,
                total_new=row.total_new or 0,
                critical_new=int(row.critical_new or 0)
            )
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as e:
        logger.exception("Error fetching risk trends: %s", str(e))
        return []


@router.get("/kri-breach-trends", response_model=list[KRIBreachTrendPoint])
async def get_kri_breach_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department"),
):
    """Get KRI breach trends by month (last 12 months)."""
    try:
        dept_ids = get_user_department_ids(current_user)

        # Early return for users with no department access
        if dept_ids is not None and len(dept_ids) == 0:
            return []

        # Build conditions: join KRIValueHistory -> KRI -> Risk; filter active risks
        conditions = [
            KRIValueHistory.period_end.isnot(None),
            Risk.status != RiskStatus.archived.value,
        ]
        if dept_ids is not None:
            conditions.append(Risk.department_id.in_(dept_ids))
        elif department_id:
            conditions.append(Risk.department_id == department_id)

        # Query breach counts grouped by month
        period_label = func.to_char(KRIValueHistory.period_end, 'YYYY-MM').label('period')
        query = select(
            period_label,
            func.count(KRIValueHistory.id).label('total_entries'),
            func.sum(
                func.case((KRIValueHistory.breach_status != 'within', 1), else_=0)
            ).label('breached_entries')
        ).select_from(
            KRIValueHistory
        ).join(
            KeyRiskIndicator, KRIValueHistory.kri_id == KeyRiskIndicator.id
        ).join(
            Risk, KeyRiskIndicator.risk_id == Risk.id
        ).where(
            and_(*conditions)
        ).group_by(
            period_label
        ).order_by(
            period_label.desc()
        ).limit(12)
        
        result = await db.execute(query)
        rows = result.all()
        
        trends = [
            KRIBreachTrendPoint(
                period=row.period,
                total_entries=row.total_entries or 0,
                breached_entries=int(row.breached_entries or 0)
            )
            for row in rows
            if row.period
        ]
        return list(reversed(trends))
    except Exception as e:
        logger.exception("Error fetching KRI breach trends: %s", str(e))
        return []


@router.get("/quarterly-comparison")
async def get_quarterly_comparison(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get quarter-over-quarter comparison metrics for Risk Committee view.
    
    Returns:
        - this_quarter: metrics for current quarter
        - last_quarter: metrics for previous quarter
        - changes: percentage/absolute changes
    """
    try:
        from datetime import datetime, timedelta
        from dateutil.relativedelta import relativedelta
        from app.models.approval_request import ApprovalRequest, ApprovalStatus
        
        now = datetime.now()
        
        # Calculate quarter boundaries
        current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1)
        last_quarter_start = current_quarter_start - relativedelta(months=3)
        last_quarter_end = current_quarter_start - timedelta(days=1)
        
        async def get_quarter_metrics(start: datetime, end: datetime) -> dict:
            """Get metrics for a quarter period."""
            from app.models.orphaned_item import OrphanedItem
            from app.models.activity_log import ActivityLog
            
            # Risks created in period
            risk_count = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.created_at >= start,
                    Risk.created_at <= end,
                    Risk.status != RiskStatus.archived.value
                )
            )
            
            # Risks closed in period
            closed_count = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.updated_at >= start,
                    Risk.updated_at <= end,
                    Risk.status == RiskStatus.closed.value
                )
            )
            
            # Active risks at end of period
            active_risks = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.created_at <= end,
                    Risk.status.in_([RiskStatus.active.value, RiskStatus.monitoring.value])
                )
            )
            
            # Priority risks
            priority_count = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.is_priority == True,
                    Risk.status != RiskStatus.archived.value
                )
            )
            
            # KRI breaches (value outside limits)
            kri_breaches = await db.scalar(
                select(func.count(KeyRiskIndicator.id)).where(
                    or_(
                        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
                    )
                )
            )
            
            # Pending approvals
            pending_approvals = await db.scalar(
                select(func.count(ApprovalRequest.id)).where(
                    cast(ApprovalRequest.status, String).in_(["pending", "pending_privileged"])
                )
            )
            
            # --- NEW METRICS: Audit & Control Effectiveness ---
            
            # Audit activity: control executions in period
            audit_activity = await db.scalar(
                select(func.count(ControlExecution.id)).where(
                    ControlExecution.executed_at >= start,
                    ControlExecution.executed_at <= end
                )
            )
            
            # Failed audits: executions with result='failed' in period
            from app.models.control_execution import ExecutionResult
            failed_audits = await db.scalar(
                select(func.count(ControlExecution.id)).where(
                    ControlExecution.executed_at >= start,
                    ControlExecution.executed_at <= end,
                    ControlExecution.result == ExecutionResult.failed.value
                )
            )
            
            # Control coverage: % of active risks with at least 1 linked control
            from app.models.risk import ControlRiskLink
            total_active_risks = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.status == RiskStatus.active.value
                )
            ) or 1  # Avoid division by zero
            risks_with_controls = await db.scalar(
                select(func.count(Risk.id.distinct())).select_from(Risk).join(
                    ControlRiskLink, ControlRiskLink.risk_id == Risk.id
                ).where(
                    Risk.status == RiskStatus.active.value
                )
            )
            control_coverage = round((risks_with_controls or 0) / total_active_risks * 100)
            
            # Unaudited controls: active controls with 0 executions in period
            controls_with_executions = select(ControlExecution.control_id.distinct()).where(
                ControlExecution.executed_at >= start,
                ControlExecution.executed_at <= end
            )
            unaudited_controls = await db.scalar(
                select(func.count(Control.id)).where(
                    Control.status == ControlStatus.active.value,
                    Control.id.notin_(controls_with_executions)
                )
            )
            
            # --- NEW METRICS: Governance Health ---
            
            # Orphaned items (unresolved)
            orphaned_items = await db.scalar(
                select(func.count(OrphanedItem.id)).where(
                    OrphanedItem.resolved_at.is_(None)
                )
            )
            
            # KRI health: % of KRIs within limits
            total_kris = await db.scalar(select(func.count(KeyRiskIndicator.id))) or 1
            kris_within = await db.scalar(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.current_value >= KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value <= KeyRiskIndicator.upper_limit
                )
            )
            kri_health = round((kris_within or 0) / total_kris * 100)
            
            # Overdue KRIs: KRIs past due date (last_period_end + 15 days < now)
            overdue_kris = await db.scalar(
                select(func.count(KeyRiskIndicator.id)).where(
                    KeyRiskIndicator.last_period_end.isnot(None),
                    func.date(KeyRiskIndicator.last_period_end) + 15 < func.current_date()
                )
            )
            
            # Activity volume: activity log entries in period
            activity_volume = await db.scalar(
                select(func.count(ActivityLog.id)).where(
                    ActivityLog.created_at >= start,
                    ActivityLog.created_at <= end
                )
            )
            
            # Risks without KRI: active risks with no linked KRI
            risks_with_kri = select(KeyRiskIndicator.risk_id.distinct())
            risks_without_kri = await db.scalar(
                select(func.count(Risk.id)).where(
                    Risk.status == RiskStatus.active.value,
                    Risk.id.notin_(risks_with_kri)
                )
            )
            
            return {
                # Row 1: Risk Posture
                "new_risks": risk_count or 0,
                "closed_risks": closed_count or 0,
                "active_risks": active_risks or 0,
                "priority_risks": priority_count or 0,
                "kri_breaches": kri_breaches or 0,
                "pending_approvals": pending_approvals or 0,
                # Row 2: Audit & Control Effectiveness
                "audit_activity": audit_activity or 0,
                "failed_audits": failed_audits or 0,
                "control_coverage": control_coverage,
                "unaudited_controls": unaudited_controls or 0,
                # Row 3: Governance Health
                "orphaned_items": orphaned_items or 0,
                "kri_health": kri_health,
                "overdue_kris": overdue_kris or 0,
                "activity_volume": activity_volume or 0,
                "risks_without_kri": risks_without_kri or 0,
            }
        
        this_quarter = await get_quarter_metrics(current_quarter_start, now)
        last_quarter = await get_quarter_metrics(last_quarter_start, last_quarter_end)
        
        # Calculate changes
        changes = {}
        for key in this_quarter:
            old_val = last_quarter[key]
            new_val = this_quarter[key]
            if old_val == 0:
                pct_change = 100 if new_val > 0 else 0
            else:
                pct_change = round(((new_val - old_val) / old_val) * 100, 1)
            changes[key] = {
                "absolute": new_val - old_val,
                "percentage": pct_change,
                "direction": "up" if new_val > old_val else ("down" if new_val < old_val else "same"),
            }
        
        return {
            "this_quarter": this_quarter,
            "last_quarter": last_quarter,
            "changes": changes,
            "period": {
                "this_start": current_quarter_start.isoformat(),
                "this_end": now.isoformat(),
                "last_start": last_quarter_start.isoformat(),
                "last_end": last_quarter_end.isoformat(),
            }
        }
    except Exception as e:
        logger.exception("Error in quarterly-comparison endpoint: %s", str(e))
        raise


@router.get("/committee-summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get executive summary for Risk Committee meetings.
    
    Returns high-level overview with key decision points.
    """
    from datetime import datetime, timedelta
    from app.models.activity_log import ActivityLog
    
    # Top 5 critical risks (by net_score, priority first)
    # Eager load owner and department
    from sqlalchemy.orm import joinedload
    critical_risks = await db.execute(
        select(Risk)
        .options(
            joinedload(Risk.owner),
            joinedload(Risk.department)
        )
        .where(Risk.status == RiskStatus.active.value)
        .order_by(Risk.is_priority.desc(), Risk.net_score.desc())
        .limit(5)
    )
    
    # Recent significant changes (last 30 days)
    thirty_days_ago = datetime.now() - timedelta(days=30)
    recent_activity = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.created_at >= thirty_days_ago)
        .where(ActivityLog.action.in_(["create", "delete", "archive", "approve", "reject"]))
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
    )
    
    # Departments with highest risk exposure
    dept_exposure = await db.execute(
        select(
            Department.id,
            Department.name,
            func.sum(Risk.net_score).label("total_exposure"),
            func.count(Risk.id).label("risk_count"),
        )
        .join(Risk, Risk.department_id == Department.id)
        .where(Risk.status == RiskStatus.active.value)
        .group_by(Department.id)
        .order_by(func.sum(Risk.net_score).desc())
        .limit(5)
    )
    
    return {
        "critical_risks": [
            {
                "id": r.id,
                "risk_id_code": r.risk_id_code,
                "process": r.process,  # Risk Name
                "description": r.description[:100] if r.description else "",
                "net_score": r.net_score,
                "is_priority": r.is_priority,
                "owner_name": r.owner.name if r.owner else "Unassigned",
                "department_name": r.department.name if r.department else "Unassigned",
            }
            for r in critical_risks.scalars()
        ],
        "recent_activity": [
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_name": a.entity_name,
                "description": a.description,
                "created_at": a.created_at.isoformat(),
            }
            for a in recent_activity.scalars()
        ],
        "department_exposure": [
            {
                "id": d.id,
                "name": d.name,
                "total_exposure": d.total_exposure,
                "risk_count": d.risk_count,
            }
            for d in dept_exposure
        ],
    }
