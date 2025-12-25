"""
Dashboard API endpoints for executive and department-level metrics.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
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
from app.core.security import get_current_user

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get overview statistics for executive dashboard."""
    
    # Total controls
    total_controls_result = await db.execute(select(func.count(Control.id)))
    total_controls = total_controls_result.scalar() or 0
    
    # Controls by status
    controls_by_status = {}
    for status in ControlStatus:
        result = await db.execute(
            select(func.count(Control.id)).where(Control.status == status.value)
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_status[status.value] = count
    
    # Controls by form
    controls_by_form = {}
    for form in ControlForm:
        result = await db.execute(
            select(func.count(Control.id)).where(Control.control_form == form.value)
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_form[form.value] = count
    
    # Controls by frequency
    controls_by_frequency = {}
    for freq in ControlFrequency:
        result = await db.execute(
            select(func.count(Control.id)).where(Control.frequency == freq.value)
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_frequency[freq.value] = count
    
    # Total risks
    total_risks_result = await db.execute(select(func.count(Risk.id)))
    total_risks = total_risks_result.scalar() or 0
    
    # Risks by status
    risks_by_status = {}
    for status in RiskStatus:
        result = await db.execute(
            select(func.count(Risk.id)).where(Risk.status == status.value)
        )
        count = result.scalar() or 0
        if count > 0:
            risks_by_status[status.value] = count
    
    # Critical risks (net_score >= 15)
    critical_result = await db.execute(
        select(func.count(Risk.id)).where(Risk.net_score >= 15)
    )
    critical_risks_count = critical_result.scalar() or 0
    
    # Average net risk score
    avg_result = await db.execute(select(func.avg(Risk.net_score)))
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
    current_user: User = Depends(get_current_user),
):
    """Get per-department statistics."""
    
    # Get all departments
    dept_result = await db.execute(select(Department))
    departments = dept_result.scalars().all()
    
    metrics = []
    for dept in departments:
        # Control count
        control_count_result = await db.execute(
            select(func.count(Control.id)).where(Control.department_id == dept.id)
        )
        control_count = control_count_result.scalar() or 0
        
        # Active control count for compliance rate
        active_control_result = await db.execute(
            select(func.count(Control.id)).where(
                Control.department_id == dept.id,
                Control.status == ControlStatus.active.value
            )
        )
        active_control_count = active_control_result.scalar() or 0
        
        # Risk count
        risk_count_result = await db.execute(
            select(func.count(Risk.id)).where(Risk.department_id == dept.id)
        )
        risk_count = risk_count_result.scalar() or 0
        
        # High risk count (using risk_level >= 4 from controls, approximating with net_score >= 12)
        high_risk_result = await db.execute(
            select(func.count(Risk.id)).where(
                Risk.department_id == dept.id,
                Risk.net_score >= 12
            )
        )
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
    current_user: User = Depends(get_current_user),
):
    """Get risk distribution for 5x5 risk matrix visualization."""
    
    # Group risks by net_probability and net_impact
    distribution_query = select(
        Risk.net_probability,
        Risk.net_impact,
        func.count(Risk.id).label('count')
    ).group_by(Risk.net_probability, Risk.net_impact)
    
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
    current_user: User = Depends(get_current_user),
):
    """Get control execution trends by week (last 8 weeks)."""
    
    try:
        # Check if there are any executions
        count_result = await db.execute(select(func.count(ControlExecution.id)))
        total_count = count_result.scalar() or 0
        
        if total_count == 0:
            # Return empty list if no executions exist
            return []
        
        # Query control executions grouped by ISO week
        trends_query = select(
            func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW').label('period'),
            func.count(ControlExecution.id).label('execution_count')
        ).where(
            ControlExecution.executed_at.isnot(None)
        ).group_by(
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
    except Exception:
        # Return empty list on any error (e.g., table doesn't exist)
        return []
