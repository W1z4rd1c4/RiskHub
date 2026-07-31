from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import case

from app.core.datetime_utils import utc_now
from app.core.pagination import DEPARTMENT_RECENT_EXECUTIONS_LIMIT
from app.core.permissions import (
    control_visibility_clause,
    get_issue_scope_clause,
    has_permission,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Asset, Control, ControlExecution, Issue, KeyRiskIndicator, Process, Risk, User, Vendor
from app.models.control import ControlStatus
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.issue import IssueStatus
from app.schemas.department import ControlStats, DepartmentDetail, RecentExecution, RiskDistribution
from app.services._access_workflow import (
    build_department_access_roster_query,
    can_view_department_access_roster,
)
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._monitoring_status import KRIMonitoringStatus, get_kri_monitoring_config
from app.services._monitoring_status.queries import apply_kri_monitoring_status_filter

from ._shared import RISK_LEVEL_RANGES, _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}", response_model=DepartmentDetail)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
):
    """
    Get detailed department information with metrics.

    Access: 404 if department not found; 403 if out of user's scope.
    Excludes: Archived risks/controls/KRIs from counts and distributions.
    Metrics: risk_distribution uses RISK_LEVEL_RANGES; control_stats groups by form/frequency.
    """
    dept = await _assert_department_in_scope(department_id, db, current_user)

    can_read_users = can_view_department_access_roster(current_user)
    can_read_risks = has_permission(current_user, "risks", "read")
    can_read_controls = has_permission(current_user, "controls", "read")
    can_read_issues = has_permission(current_user, "issues", "read")
    can_read_processes = has_permission(current_user, "processes", "read")
    can_read_assets = has_permission(current_user, "assets", "read")
    can_read_vendors = has_permission(current_user, "vendors", "read")

    risk_visibility = await risk_visibility_clause(db, current_user, department_id=department_id)
    control_visibility = control_visibility_clause(current_user, department_id=department_id)
    kri_visibility = await kri_visibility_clause(db, current_user, department_id=department_id)
    issue_visibility = await get_issue_scope_clause(db, current_user)
    process_visibility = process_visibility_clause(current_user)
    asset_visibility = asset_visibility_clause(current_user)
    vendor_visibility = vendor_visibility_clause(current_user, department_id=department_id)
    issue_visibility = true() if issue_visibility is None else issue_visibility
    process_visibility = true() if process_visibility is None else process_visibility
    asset_visibility = true() if asset_visibility is None else asset_visibility

    # Count active users only (consistent with list_departments)
    user_count_result = await db.execute(
        select(func.count())
        .select_from(
            build_department_access_roster_query(
                current_user,
                department_id=department_id,
            ).subquery()
        )
    )
    user_count = user_count_result.scalar() or 0

    # Count risks
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(
            Risk.department_id == department_id,
            Risk.live(),
            risk_visibility,
        )
    )
    risk_count = risk_count_result.scalar() or 0
    high_risk_min_net_score = await get_config_int(
        db,
        "high_risk_min_net_score",
        ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    )
    high_risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(
            and_(
                Risk.department_id == department_id,
                Risk.live(),
                Risk.net_score >= high_risk_min_net_score,
                risk_visibility,
            )
        )
    )
    high_risk_count = high_risk_count_result.scalar() or 0

    # Count controls (non-archived)
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(
            Control.department_id == department_id,
            Control.live(),
            control_visibility,
        )
    )
    control_count = control_count_result.scalar() or 0

    # Count KRIs (only non-archived KRIs from non-archived risks)
    kri_base_query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.live(),
                KeyRiskIndicator.is_archived.is_(False),
                kri_visibility,
            )
        )
    )
    kri_count_result = await db.execute(select(func.count()).select_from(kri_base_query.subquery()))
    kri_count = kri_count_result.scalar() or 0
    now = utc_now()

    issue_count = int(
        (
            await db.execute(
                select(func.count(Issue.id)).where(
                    Issue.department_id == department_id,
                    issue_visibility,
                )
            )
        ).scalar()
        or 0
    )
    overdue_issue_count = int(
        (
            await db.execute(
                select(func.count(Issue.id)).where(
                    Issue.department_id == department_id,
                    Issue.status != IssueStatus.closed.value,
                    Issue.due_at.is_not(None),
                    Issue.due_at < now,
                    issue_visibility,
                )
            )
        ).scalar()
        or 0
    )
    process_count = int(
        (
            await db.execute(
                select(func.count(Process.id)).where(
                    Process.owning_department_id == department_id,
                    Process.live(),
                    process_visibility,
                )
            )
        ).scalar()
        or 0
    )
    process_accountability_gap_count = int(
        (
            await db.execute(
                select(func.count(Process.id)).where(
                    Process.owning_department_id == department_id,
                    Process.live(),
                    Process.process_owner_user_id.is_(None),
                    process_visibility,
                )
            )
        ).scalar()
        or 0
    )
    asset_count = int(
        (
            await db.execute(
                select(func.count(Asset.id)).where(
                    Asset.owning_department_id == department_id,
                    Asset.live(),
                    asset_visibility,
                )
            )
        ).scalar()
        or 0
    )
    asset_accountability_gap_count = int(
        (
            await db.execute(
                select(func.count(Asset.id)).where(
                    Asset.owning_department_id == department_id,
                    Asset.live(),
                    (
                        Asset.business_owner_user_id.is_(None)
                        | Asset.ict_owner_user_id.is_(None)
                    ),
                    asset_visibility,
                )
            )
        ).scalar()
        or 0
    )
    vendor_count = int(
        (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.department_id == department_id,
                    Vendor.live(),
                    vendor_visibility,
                )
            )
        ).scalar()
        or 0
    )
    significant_vendor_count = int(
        (
            await db.execute(
                select(func.count(Vendor.id)).where(
                    Vendor.department_id == department_id,
                    Vendor.live(),
                    Vendor.is_significant_vendor.is_(True),
                    vendor_visibility,
                )
            )
        ).scalar()
        or 0
    )

    kri_monitoring_config = await get_kri_monitoring_config(db)
    kri_monitoring_counts: dict[str, int] = {}
    for monitoring_status in KRIMonitoringStatus:
        filtered_kri_query = apply_kri_monitoring_status_filter(
            kri_base_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            warning_upper_margin_ratio=kri_monitoring_config.warning_upper_margin_ratio,
        )
        count_result = await db.execute(select(func.count()).select_from(filtered_kri_query.subquery()))
        kri_monitoring_counts[monitoring_status.value] = int(count_result.scalar() or 0)

    # Risk distribution by level (single query, avoids N+1)
    risk_distribution_columns = []
    for level, (min_score, max_score) in RISK_LEVEL_RANGES.items():
        risk_distribution_columns.append(
            func.sum(
                case(
                    (
                        and_(
                            Risk.net_score >= min_score,
                            Risk.net_score <= max_score,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label(level)
        )

    risk_distribution_stmt = select(*risk_distribution_columns).where(
        and_(
            Risk.department_id == department_id,
            Risk.live(),
            risk_visibility,
        )
    )
    risk_distribution_row = (await db.execute(risk_distribution_stmt)).one()
    risk_distribution = RiskDistribution(
        low=int(getattr(risk_distribution_row, "low") or 0),
        medium=int(getattr(risk_distribution_row, "medium") or 0),
        high=int(getattr(risk_distribution_row, "high") or 0),
        critical=int(getattr(risk_distribution_row, "critical") or 0),
    )

    # Risk by status (single grouped query)
    risk_by_status_stmt = (
        select(Risk.status, func.count(Risk.id))
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.live(),
                risk_visibility,
            )
        )
        .group_by(Risk.status)
    )
    risk_by_status = {row[0]: row[1] for row in (await db.execute(risk_by_status_stmt)).all() if row[1] > 0}

    # Control stats
    control_stats = ControlStats(total=control_count, active=0, inactive=0, by_form={}, by_frequency={})

    # Controls by status (single grouped query for the two statuses we expose)
    control_status_stmt = (
        select(Control.status, func.count(Control.id))
        .where(
            and_(
                Control.department_id == department_id,
                Control.live(),
                Control.status.in_([ControlStatus.active.value, ControlStatus.inactive.value]),
                control_visibility,
            )
        )
        .group_by(Control.status)
    )
    status_counts = {row[0]: row[1] for row in (await db.execute(control_status_stmt)).all()}
    control_stats.active = int(status_counts.get(ControlStatus.active.value, 0))
    control_stats.inactive = int(status_counts.get(ControlStatus.inactive.value, 0))

    # Controls by form (single grouped query, live controls only)
    control_form_stmt = (
        select(Control.control_form, func.count(Control.id))
        .where(
            Control.department_id == department_id,
            Control.live(),
            control_visibility,
        )
        .group_by(Control.control_form)
    )
    control_stats.by_form = {
        row[0]: row[1] for row in (await db.execute(control_form_stmt)).all() if row[0] and row[1] > 0
    }

    # Controls by frequency (single grouped query, live controls only)
    control_frequency_stmt = (
        select(Control.frequency, func.count(Control.id))
        .where(
            Control.department_id == department_id,
            Control.live(),
            control_visibility,
        )
        .group_by(Control.frequency)
    )
    control_stats.by_frequency = {
        row[0]: row[1] for row in (await db.execute(control_frequency_stmt)).all() if row[0] and row[1] > 0
    }

    # Recent executions
    exec_result = await db.execute(
        select(ControlExecution)
        .join(Control)
        .options(selectinload(ControlExecution.control), selectinload(ControlExecution.executed_by))
        .where(
            Control.department_id == department_id,
            Control.live(),
            control_visibility,
        )
        .order_by(ControlExecution.executed_at.desc())
        .limit(DEPARTMENT_RECENT_EXECUTIONS_LIMIT)
    )
    executions = exec_result.scalars().all()

    recent_executions = [
        RecentExecution(
            id=ex.id,
            control_id=ex.control_id,
            control_name=ex.control.name if ex.control else "Unknown",
            result=ex.result,
            executed_at=ex.executed_at,
            executed_by=ex.executed_by.name if ex.executed_by else "Unknown",
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
        user_count=user_count if can_read_users else None,
        risk_count=risk_count if can_read_risks else None,
        high_risk_count=high_risk_count if can_read_risks else None,
        control_count=control_count if can_read_controls else None,
        kri_count=kri_count if can_read_risks else None,
        kri_monitoring_counts=kri_monitoring_counts if can_read_risks else None,
        issue_count=issue_count if can_read_issues else None,
        overdue_issue_count=overdue_issue_count if can_read_issues else None,
        process_count=process_count if can_read_processes else None,
        process_accountability_gap_count=process_accountability_gap_count if can_read_processes else None,
        asset_count=asset_count if can_read_assets else None,
        asset_accountability_gap_count=asset_accountability_gap_count if can_read_assets else None,
        vendor_count=vendor_count if can_read_vendors else None,
        significant_vendor_count=significant_vendor_count if can_read_vendors else None,
        risk_distribution=risk_distribution if can_read_risks else None,
        risk_by_status=risk_by_status if can_read_risks else None,
        control_stats=control_stats if can_read_controls else None,
        recent_executions=recent_executions if can_read_controls else None,
    )
