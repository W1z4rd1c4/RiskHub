"""
Dashboard API endpoints for executive and department-level metrics.
"""
import logging
from datetime import UTC, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.limits import (
    DASHBOARD_CONTROL_TREND_WEEKS,
    DASHBOARD_RECENT_ACTIVITY,
    DASHBOARD_TOP_BREACHED_SLAS,
    DASHBOARD_TOP_CRITICAL_RISKS,
    DASHBOARD_TOP_CRITICAL_VENDORS,
    DASHBOARD_TOP_DEPARTMENT_EXPOSURE,
    DASHBOARD_TOP_MAJOR_INCIDENTS,
    DASHBOARD_TOP_OVERDUE_VENDORS,
    DASHBOARD_TREND_MONTHS,
)
from app.core.permissions import get_issue_scope_clause, get_user_department_ids, has_permission
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, Department, Issue, Risk, User, Vendor, VendorSLA
from app.models.control import ControlForm, ControlFrequency, ControlStatus
from app.models.global_config import ConfigDefaults, build_risk_level_ranges
from app.models.issue import IssueSeverity, IssueStatus
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory
from app.models.risk import RiskStatus
from app.schemas.dashboard import (
    ControlFrequencyTrend,
    DashboardSummaryResponse,
    DepartmentMetrics,
    IssueAgingBucket,
    IssueAgingResponse,
    IssueDashboardSummaryResponse,
    IssueSeverityBreakdownItem,
    IssueSeverityBreakdownResponse,
    KRIBreachTrendPoint,
    RiskDistributionItem,
    RiskDistributionResponse,
    RiskTrendPoint,
)
from app.services.issue_visibility_service import coerce_utc, issue_has_active_approved_exception

router = APIRouter()
logger = logging.getLogger(__name__)

# Default risk level score ranges (fallback, uses ConfigDefaults)
# For dynamic thresholds, use get_risk_level_ranges_async() in endpoint handlers
RISK_LEVEL_RANGES = build_risk_level_ranges(
    ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE,
    ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
)


def build_risk_level_condition(risk_level: str):
    """Build SQLAlchemy condition for risk level filtering."""
    if risk_level not in RISK_LEVEL_RANGES:
        return None
    min_score, max_score = RISK_LEVEL_RANGES[risk_level]
    return and_(Risk.net_score >= min_score, Risk.net_score <= max_score)


def _issue_age_days(issue: Issue, now: datetime) -> int:
    opened_at = coerce_utc(issue.opened_at)
    if opened_at is None:
        return 0
    delta = now - opened_at
    return max(delta.days, 0)


async def _load_scoped_issues(
    db: AsyncSession,
    current_user: User,
    *,
    department_id: int | None,
) -> list[Issue]:
    query = select(Issue).options(selectinload(Issue.exceptions))
    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)
    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    result = await db.execute(query)
    return list(result.scalars().all())


def _open_unsuppressed_issues(issues: list[Issue], now: datetime) -> list[Issue]:
    return [
        issue
        for issue in issues
        if issue.status != IssueStatus.closed.value and not issue_has_active_approved_exception(issue, now)
    ]


@router.get("/issues-summary", response_model=IssueDashboardSummaryResponse)
async def get_issue_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueDashboardSummaryResponse:
    now = datetime.now(UTC)
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)
    overdue = [issue for issue in open_issues if coerce_utc(issue.due_at) is not None and coerce_utc(issue.due_at) < now]
    high_severity = [
        issue
        for issue in open_issues
        if issue.severity in (IssueSeverity.high.value, IssueSeverity.critical.value)
    ]

    ages = sorted(_issue_age_days(issue, now) for issue in open_issues)
    if not ages:
        median_days_open = 0
    elif len(ages) % 2 == 1:
        median_days_open = ages[len(ages) // 2]
    else:
        mid = len(ages) // 2
        median_days_open = (ages[mid - 1] + ages[mid]) // 2

    return IssueDashboardSummaryResponse(
        open_issues=len(open_issues),
        overdue_issues=len(overdue),
        high_severity_open=len(high_severity),
        median_days_open=median_days_open,
    )


@router.get("/issues-aging", response_model=IssueAgingResponse)
async def get_issue_aging(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueAgingResponse:
    now = datetime.now(UTC)
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)

    buckets: dict[str, int] = {"0-7": 0, "8-30": 0, "31-60": 0, "61+": 0}
    for issue in open_issues:
        age_days = _issue_age_days(issue, now)
        if age_days <= 7:
            buckets["0-7"] += 1
        elif age_days <= 30:
            buckets["8-30"] += 1
        elif age_days <= 60:
            buckets["31-60"] += 1
        else:
            buckets["61+"] += 1

    return IssueAgingResponse(
        buckets=[
            IssueAgingBucket(bucket="0-7", count=buckets["0-7"]),
            IssueAgingBucket(bucket="8-30", count=buckets["8-30"]),
            IssueAgingBucket(bucket="31-60", count=buckets["31-60"]),
            IssueAgingBucket(bucket="61+", count=buckets["61+"]),
        ]
    )


@router.get("/issues-by-severity", response_model=IssueSeverityBreakdownResponse)
async def get_issues_by_severity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
) -> IssueSeverityBreakdownResponse:
    now = datetime.now(UTC)
    issues = await _load_scoped_issues(db, current_user, department_id=department_id)
    open_issues = _open_unsuppressed_issues(issues, now)

    counts = {severity.value: 0 for severity in IssueSeverity}
    for issue in open_issues:
        if issue.severity in counts:
            counts[issue.severity] += 1

    return IssueSeverityBreakdownResponse(
        items=[
            IssueSeverityBreakdownItem(severity=IssueSeverity.low.value, count=counts[IssueSeverity.low.value]),
            IssueSeverityBreakdownItem(severity=IssueSeverity.medium.value, count=counts[IssueSeverity.medium.value]),
            IssueSeverityBreakdownItem(severity=IssueSeverity.high.value, count=counts[IssueSeverity.high.value]),
            IssueSeverityBreakdownItem(
                severity=IssueSeverity.critical.value, count=counts[IssueSeverity.critical.value]
            ),
        ]
    )


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
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
    for control_status_enum in ControlStatus:
        conditions = [Control.status == control_status_enum.value] + control_conditions
        result = await db.execute(
            select(func.count(Control.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            controls_by_status[control_status_enum.value] = count
    
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
    for risk_status_enum in RiskStatus:
        conditions = [Risk.status == risk_status_enum.value] + risk_conditions
        result = await db.execute(
            select(func.count(Risk.id)).where(and_(*conditions))
        )
        count = result.scalar() or 0
        if count > 0:
            risks_by_status[risk_status_enum.value] = count
    
    # Critical risks (net_score >= critical threshold)
    critical_threshold = ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE
    critical_conditions = [Risk.net_score >= critical_threshold] + risk_conditions
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

    # Vendor metrics (Phase 18-11)
    total_vendors = 0
    high_risk_vendors_count = 0
    overdue_vendor_reassessments_count = 0
    breached_vendor_slas_count = 0

    vendor_conditions = [Vendor.status == "active"]
    vendor_scope_filter = None
    if dept_ids is not None:
        if dept_ids:
            vendor_scope_filter = or_(
                Vendor.department_id.in_(dept_ids),
                Vendor.outsourcing_owner_user_id == current_user.id,
            )
        else:
            vendor_scope_filter = None
    elif department_id:
        vendor_scope_filter = Vendor.department_id == department_id

    if vendor_scope_filter is not None:
        vendor_conditions.append(vendor_scope_filter)

    if has_permission(current_user, "vendors", "read") and (dept_ids is None or (dept_ids is not None and dept_ids)):
        total_vendors = (await db.execute(select(func.count(Vendor.id)).where(and_(*vendor_conditions)))).scalar() or 0
        high_risk_vendors_count = (
            await db.execute(
                select(func.count(Vendor.id)).where(and_(*(vendor_conditions + [Vendor.risk_score_1_5 >= 4])))
            )
        ).scalar() or 0

        now = datetime.now(UTC).replace(tzinfo=None)
        overdue_vendor_reassessments_count = (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    and_(
                        *(vendor_conditions + [Vendor.next_reassessment_due_at.isnot(None), Vendor.next_reassessment_due_at < now])
                    )
                )
            )
        ).scalar() or 0

        sla_conditions = [
            VendorSLA.is_archived == False,
            or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit),
            Vendor.status == "active",
        ]
        sla_query = select(func.count(VendorSLA.id)).join(Vendor, VendorSLA.vendor_id == Vendor.id).where(and_(*sla_conditions))
        if vendor_scope_filter is not None:
            sla_query = sla_query.where(vendor_scope_filter)
        breached_vendor_slas_count = (await db.execute(sla_query)).scalar() or 0
    
    return DashboardSummaryResponse(
        total_controls=total_controls,
        controls_by_status=controls_by_status,
        controls_by_form=controls_by_form,
        controls_by_frequency=controls_by_frequency,
        total_risks=total_risks,
        risks_by_status=risks_by_status,
        critical_risks_count=critical_risks_count,
        average_net_risk_score=round(average_net_risk_score, 2),
        total_vendors=total_vendors,
        high_risk_vendors_count=high_risk_vendors_count,
        overdue_vendor_reassessments_count=overdue_vendor_reassessments_count,
        breached_vendor_slas_count=breached_vendor_slas_count,
    )


@router.get("/departments", response_model=list[DepartmentMetrics])
async def get_department_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
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
        
        # High risk count (net_score >= high threshold, exclude archived by default)
        high_threshold = ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
        high_risk_query = select(func.count(Risk.id)).where(
            Risk.department_id == dept.id,
            Risk.net_score >= high_threshold
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

        # Breaching KRI count (KRIs linked to department's risks, outside limits, non-archived)
        breaching_kri_query = select(func.count(KeyRiskIndicator.id.distinct())).join(Risk).where(
            Risk.department_id == dept.id,
            Risk.status != RiskStatus.archived.value,
            KeyRiskIndicator.is_archived == False,
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
            )
        )
        breaching_kri_result = await db.execute(breaching_kri_query)
        breaching_kri_count = breaching_kri_result.scalar() or 0
        
        # Total KRI count (KRIs linked to department's risks, non-archived)
        total_kri_query = select(func.count(KeyRiskIndicator.id.distinct())).join(Risk).where(
            Risk.department_id == dept.id,
            Risk.status != RiskStatus.archived.value,
            KeyRiskIndicator.is_archived == False,
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
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(None, description="Filter by risk level"),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get risk distribution for 5x5 risk matrix visualization with optional filters.
    
    Args:
        risk_type: 'gross' uses gross_probability/gross_impact; 'net' uses net_probability/net_impact
    """
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
    
    # Select probability/impact columns based on risk_type
    if risk_type == "gross":
        prob_col = Risk.gross_probability
        impact_col = Risk.gross_impact
    else:
        prob_col = Risk.net_probability
        impact_col = Risk.net_impact
    
    # Group risks by selected probability and impact
    distribution_query = select(
        prob_col.label('probability'),
        impact_col.label('impact'),
        func.count(Risk.id).label('count')
    )
    
    if conditions:
        distribution_query = distribution_query.where(and_(*conditions))
    
    distribution_query = distribution_query.group_by(prob_col, impact_col)
    
    result = await db.execute(distribution_query)
    rows = result.all()
    
    distribution = [
        RiskDistributionItem(
            probability=row.probability,
            impact=row.impact,
            count=row.count
        )
        for row in rows
        if row.probability and row.impact
    ]
    
    return RiskDistributionResponse(distribution=distribution)


@router.get("/control-trends", response_model=list[ControlFrequencyTrend])
async def get_control_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
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
        
        # Define period expression once to avoid GROUP BY mismatch
        period_expr = func.to_char(ControlExecution.executed_at, 'IYYY-"W"IW')
        
        # Query control executions grouped by ISO week
        trends_query = select(
            period_expr.label('period'),
            func.count(ControlExecution.id).label('execution_count')
        )
        
        if len(conditions) > 1:
            trends_query = trends_query.where(and_(*conditions))
        else:
            trends_query = trends_query.where(conditions[0])
        
        # Group and order by the period expression
        trends_query = trends_query.group_by(
            period_expr
        ).order_by(
            desc(period_expr)
        ).limit(DASHBOARD_CONTROL_TREND_WEEKS)
        
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
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    risk_type: Literal["gross", "net"] = Query("net", description="Type of risk matrix: 'gross' or 'net'"),
    include_archived: bool = Query(False, description="Include archived risks"),
):
    """Get list of risks at a specific probability/impact intersection for drill-down.
    
    Args:
        risk_type: 'gross' uses gross_probability/gross_impact; 'net' uses net_probability/net_impact
    """
    
    dept_ids = get_user_department_ids(current_user)

    # Select probability/impact columns based on risk_type
    if risk_type == "gross":
        prob_col = Risk.gross_probability
        impact_col = Risk.gross_impact
        score_col = Risk.gross_score
    else:
        prob_col = Risk.net_probability
        impact_col = Risk.net_impact
        score_col = Risk.net_score

    conditions = [
        prob_col == probability,
        impact_col == impact
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
        Risk.name.label('risk_name'),
        Risk.description,
        score_col.label('score'),
        Department.name.label('department_name'),
        User.name.label('owner_name')
    ).join(
        Department, Risk.department_id == Department.id, isouter=True
    ).join(
        User, Risk.owner_id == User.id, isouter=True
    ).where(
        and_(*conditions)
    ).order_by(score_col.desc())
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": row.id,
            "risk_id_code": row.risk_id_code,
            "name": row.risk_name or row.risk_id_code,  # Risk name, fallback to code
            "description": row.description[:150] + "..." if row.description and len(row.description) > 150 else (row.description or ""),
            "net_score": row.score,  # Keep key as net_score for backwards compatibility
            "department_name": row.department_name or "Unassigned",
            "owner_name": row.owner_name or "Unassigned"
        }
        for row in rows
    ]


@router.get("/risk-trends", response_model=list[RiskTrendPoint])
async def get_risk_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
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
        period_expr = func.to_char(Risk.created_at, 'YYYY-MM')
        critical_threshold = ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE
        query = select(
            period_expr.label('period'),
            func.count(Risk.id).label('total_new'),
            func.sum(
                case((Risk.net_score >= critical_threshold, 1), else_=0)
            ).label('critical_new')
        )
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.group_by(period_expr).order_by(desc(period_expr)).limit(DASHBOARD_TREND_MONTHS)
        
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
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
):
    """Get KRI breach trends by month (last 12 months)."""
    try:
        dept_ids = get_user_department_ids(current_user)

        # Early return for users with no department access
        if dept_ids is not None and len(dept_ids) == 0:
            return []

        # Build conditions: join KRIValueHistory -> KRI -> Risk; filter active/non-archived
        conditions = [
            KRIValueHistory.period_end.isnot(None),
            Risk.status != RiskStatus.archived.value,
            KeyRiskIndicator.is_archived == False,
        ]
        if dept_ids is not None:
            conditions.append(Risk.department_id.in_(dept_ids))
        elif department_id:
            conditions.append(Risk.department_id == department_id)

        # Query breach counts grouped by month
        period_expr = func.to_char(KRIValueHistory.period_end, 'YYYY-MM')
        query = select(
            period_expr.label('period'),
            func.count(KRIValueHistory.id).label('total_entries'),
            func.sum(
                case((KRIValueHistory.breach_status != 'within', 1), else_=0)
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
            period_expr
        ).order_by(
            desc(period_expr)
        ).limit(DASHBOARD_TREND_MONTHS)
        
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
    current_user: User = Depends(deps.get_current_committee_user),
    current_quarter: Optional[str] = Query(None, description="Current quarter in format 'YYYY-QN' (e.g., '2026-Q1'). Defaults to current quarter."),
    compare_quarter: Optional[str] = Query(None, description="Comparison quarter in format 'YYYY-QN' (e.g., '2025-Q4'). Defaults to previous quarter."),
):
    """
    Get quarter-over-quarter comparison metrics for Risk Committee view.
    
    Returns:
        - this_quarter: metrics for current quarter
        - last_quarter: metrics for previous quarter
        - changes: percentage/absolute changes
        
    Optional query params:
        - current_quarter: Quarter to analyze (e.g., '2026-Q1')
        - compare_quarter: Quarter to compare against (e.g., '2025-Q4')
    """
    from app.services.quarterly_comparison_service import build_quarterly_comparison

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")
    
    try:
        return await build_quarterly_comparison(
            db=db,
            current_user=current_user,
            current_quarter=current_quarter,
            compare_quarter=compare_quarter,
        )
    except ValueError as e:
        # Invalid quarter format
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error in quarterly-comparison endpoint: %s", str(e))
        raise


@router.get("/available-periods")
async def get_available_periods(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get available years and quarters for period selection.
    
    Returns:
        - years: List of unique years with data (from snapshots + entity creation dates)
        - current_quarter: Current quarter label (e.g., '2026-Q1')
    """
    from datetime import datetime, timezone

    from app.core.snapshot_service import get_quarter_label
    from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")
    
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    current_quarter_label = get_quarter_label(now)
    current_year = now.year
    
    # Get distinct years from quarterly snapshots
    snapshot_years_result = await db.execute(
        select(QuarterlyMetricSnapshot.year.distinct())
        .order_by(QuarterlyMetricSnapshot.year)
    )
    snapshot_years = set(row[0] for row in snapshot_years_result.fetchall())
    
    # Get distinct years from risk creation dates
    risk_years_result = await db.execute(
        select(func.extract('year', Risk.created_at).distinct())
        .where(Risk.created_at.isnot(None))
    )
    risk_years = set(int(row[0]) for row in risk_years_result.fetchall() if row[0])
    
    # Combine all years and include current year
    all_years = sorted(snapshot_years | risk_years | {current_year})
    
    return {
        "years": all_years,
        "current_quarter": current_quarter_label,
    }


@router.get("/committee-summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get executive summary for Risk Committee meetings.
    
    Returns high-level overview with key decision points.
    """
    from datetime import datetime, timedelta

    from sqlalchemy.orm import joinedload

    from app.core.permissions import get_user_department_ids
    from app.models.activity_log import ActivityLog
    from app.models.vendor import Vendor
    from app.models.vendor_incident import VendorIncident
    from app.models.vendor_sla import VendorSLA

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    dept_ids = get_user_department_ids(current_user)
    
    # Top 5 critical risks (by net_score, priority first)
    # Eager load owner and department
    critical_risks_query = (
        select(Risk)
        .options(joinedload(Risk.owner), joinedload(Risk.department))
        .where(Risk.status == RiskStatus.active.value)
    )
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        critical_risks_query = critical_risks_query.where(Risk.department_id.in_(dept_ids))
    critical_risks = await db.execute(
        critical_risks_query.order_by(Risk.is_priority.desc(), Risk.net_score.desc()).limit(DASHBOARD_TOP_CRITICAL_RISKS)
    )
    
    # Recent significant changes (last 30 days)
    thirty_days_ago = datetime.now() - timedelta(days=30)
    recent_activity_query = (
        select(ActivityLog)
        .where(ActivityLog.created_at >= thirty_days_ago)
        .where(ActivityLog.action.in_(["create", "delete", "archive", "approve", "reject"]))
        .order_by(ActivityLog.created_at.desc())
        .limit(DASHBOARD_RECENT_ACTIVITY)
    )
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        recent_activity_query = recent_activity_query.where(ActivityLog.department_id.in_(dept_ids))
    recent_activity = await db.execute(
        recent_activity_query
    )
    
    # Departments with highest risk exposure
    dept_exposure_query = (
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
        .limit(DASHBOARD_TOP_DEPARTMENT_EXPOSURE)
    )
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        dept_exposure_query = dept_exposure_query.where(Department.id.in_(dept_ids))
    dept_exposure = await db.execute(
        dept_exposure_query
    )

    # Vendor sections (Phase 18-11)
    can_read_vendors = has_permission(current_user, "vendors", "read")
    vendor_scope_filter = None
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": [], "critical_vendors": [], "vendor_alerts": {}}
        vendor_scope_filter = Vendor.department_id.in_(dept_ids)

    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)

    critical_vendors: list[Vendor] = []
    overdue_vendors: list[Vendor] = []
    overdue_total = 0
    breached_slas: list[VendorSLA] = []
    sla_breach_total = 0
    major_incidents: list[VendorIncident] = []
    incident_total = 0

    if can_read_vendors:
        critical_vendors_query = (
            select(Vendor)
            .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            critical_vendors_query = critical_vendors_query.where(vendor_scope_filter)
        critical_vendors = (
            await db.execute(
                critical_vendors_query.order_by(Vendor.risk_score_1_5.desc(), Vendor.name.asc()).limit(DASHBOARD_TOP_CRITICAL_VENDORS)
            )
        ).scalars().all()

        overdue_query = select(Vendor).options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department)).where(
            Vendor.status == "active",
            Vendor.next_reassessment_due_at.isnot(None),
            Vendor.next_reassessment_due_at < now,
        )
        if vendor_scope_filter is not None:
            overdue_query = overdue_query.where(vendor_scope_filter)
        overdue_vendors = (
            await db.execute(overdue_query.order_by(Vendor.next_reassessment_due_at.asc()).limit(DASHBOARD_TOP_OVERDUE_VENDORS))
        ).scalars().all()
        overdue_total_query = select(func.count(Vendor.id)).where(
            Vendor.status == "active",
            Vendor.next_reassessment_due_at.isnot(None),
            Vendor.next_reassessment_due_at < now,
        )
        if vendor_scope_filter is not None:
            overdue_total_query = overdue_total_query.where(vendor_scope_filter)
        overdue_total = (await db.execute(overdue_total_query)).scalar() or 0

        sla_breach_query = (
            select(VendorSLA)
            .options(joinedload(VendorSLA.vendor).joinedload(Vendor.department), joinedload(VendorSLA.vendor).joinedload(Vendor.outsourcing_owner))
            .where(VendorSLA.is_archived == False)
            .where(or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit))
            .join(Vendor, VendorSLA.vendor_id == Vendor.id)
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            sla_breach_query = sla_breach_query.where(vendor_scope_filter)
        breached_slas = (
            await db.execute(sla_breach_query.order_by(VendorSLA.last_reported_at.desc()).limit(DASHBOARD_TOP_BREACHED_SLAS))
        ).scalars().all()
        sla_breach_total_query = (
            select(func.count(VendorSLA.id))
            .join(Vendor, VendorSLA.vendor_id == Vendor.id)
            .where(VendorSLA.is_archived == False)
            .where(or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit))
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            sla_breach_total_query = sla_breach_total_query.where(vendor_scope_filter)
        sla_breach_total = (await db.execute(sla_breach_total_query)).scalar() or 0

        incident_query = (
            select(VendorIncident)
            .options(joinedload(VendorIncident.vendor).joinedload(Vendor.department), joinedload(VendorIncident.vendor).joinedload(Vendor.outsourcing_owner))
            .where(VendorIncident.is_major == True)
            .where(or_(VendorIncident.occurred_at >= thirty_days_ago, and_(VendorIncident.occurred_at.is_(None), VendorIncident.created_at >= thirty_days_ago)))
            .join(Vendor, VendorIncident.vendor_id == Vendor.id)
            .where(Vendor.status == "active")
            .order_by(desc(VendorIncident.occurred_at), desc(VendorIncident.created_at))
            .limit(DASHBOARD_TOP_MAJOR_INCIDENTS)
        )
        if vendor_scope_filter is not None:
            incident_query = incident_query.where(vendor_scope_filter)
        major_incidents = (await db.execute(incident_query)).scalars().all()
        incident_total_query = (
            select(func.count(VendorIncident.id))
            .join(Vendor, VendorIncident.vendor_id == Vendor.id)
            .where(VendorIncident.is_major == True)
            .where(or_(VendorIncident.occurred_at >= thirty_days_ago, and_(VendorIncident.occurred_at.is_(None), VendorIncident.created_at >= thirty_days_ago)))
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            incident_total_query = incident_total_query.where(vendor_scope_filter)
        incident_total = (await db.execute(incident_total_query)).scalar() or 0

    return {
        "critical_risks": [
            {
                "id": r.id,
                "risk_id_code": r.risk_id_code,
                "name": r.name,
                "process": r.process,
                "description": r.description[:300] if r.description else "",  # Increased limit for dashboard
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
        "critical_vendors": [
            {
                "id": v.id,
                "name": v.name,
                "process": v.process,
                "subprocess": v.subprocess,
                "risk_score_1_5": v.risk_score_1_5,
                "supports_important_core_insurance_function": bool(v.supports_important_core_insurance_function),
                "dora_relevant": bool(v.dora_relevant),
                "is_significant_vendor": bool(v.is_significant_vendor),
                "next_reassessment_due_at": v.next_reassessment_due_at.isoformat() if v.next_reassessment_due_at else None,
                "outsourcing_owner_name": v.outsourcing_owner.name if v.outsourcing_owner else "Unassigned",
                "department_name": v.department.name if v.department else "Unassigned",
            }
            for v in critical_vendors
        ],
        "vendor_alerts": {
            "overdue_reassessments": {
                "count": overdue_total,
                "items": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "next_reassessment_due_at": v.next_reassessment_due_at.isoformat() if v.next_reassessment_due_at else None,
                        "department_name": v.department.name if v.department else "Unassigned",
                    }
                    for v in overdue_vendors
                ],
            },
            "sla_breaches": {
                "count": sla_breach_total,
                "items": [
                    {
                        "vendor_id": s.vendor_id,
                        "vendor_name": s.vendor.name if s.vendor else "",
                        "sla_id": s.id,
                        "metric_name": s.metric_name,
                        "breach_status": s.breach_status,
                        "last_reported_at": s.last_reported_at.isoformat() if s.last_reported_at else None,
                        "department_name": s.vendor.department.name if s.vendor and s.vendor.department else "Unassigned",
                    }
                    for s in breached_slas
                ],
            },
            "major_incidents_30d": {
                "count": incident_total,
                "items": [
                    {
                        "vendor_id": i.vendor_id,
                        "vendor_name": i.vendor.name if i.vendor else "",
                        "incident_id": i.id,
                        "incident_type": i.incident_type.value if hasattr(i.incident_type, "value") else str(i.incident_type),
                        "summary": i.summary,
                        "occurred_at": (i.occurred_at or i.created_at).isoformat() if (i.occurred_at or i.created_at) else None,
                        "department_name": i.vendor.department.name if i.vendor and i.vendor.department else "Unassigned",
                    }
                    for i in major_incidents
                ],
            },
        },
    }
