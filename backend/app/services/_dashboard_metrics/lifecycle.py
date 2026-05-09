from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import and_, false, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.datetime_utils import utc_now
from app.core.permissions import (
    control_visibility_clause,
    get_user_department_ids,
    has_permission,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.core.snapshot_service import get_quarter_label
from app.models import Control, Risk, User, Vendor
from app.models.control import ControlForm, ControlFrequency, ControlStatus
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot
from app.models.risk import RiskStatus
from app.schemas.dashboard import DashboardSummaryResponse
from app.services._dashboard_metrics.risk_levels import (
    build_risk_level_condition_from_ranges,
    get_configured_risk_level_ranges,
)


@dataclass(frozen=True)
class DashboardMetricPlan:
    actor: User
    department_id: int | None = None
    period: str | None = None
    filters: dict[str, Any] | None = None


@dataclass(frozen=True)
class DashboardMetricOutcome:
    value: Any
    availability: str = "available"
    source: str = "live"


@dataclass(frozen=True)
class DashboardSnapshotDecision:
    source: str
    available: bool


async def build_dashboard_summary_metrics(
    *,
    db: AsyncSession,
    current_user: User,
    department_id: int | None,
    control_status: str | None,
    control_form: str | None,
    risk_level: Literal["critical", "high", "medium", "low"] | None,
    include_archived: bool,
) -> DashboardSummaryResponse:
    control_visibility = control_visibility_clause(current_user, department_id=department_id)
    risk_visibility = await risk_visibility_clause(db, current_user, department_id=department_id)
    risk_level_ranges = await get_configured_risk_level_ranges(db)

    control_conditions: list[ColumnElement[bool]] = []
    if control_visibility is not None:
        control_conditions.append(control_visibility)
    if control_status:
        control_conditions.append(Control.status == control_status)
    if not include_archived:
        control_conditions.append(Control.live())
    if control_form:
        control_conditions.append(Control.control_form == control_form)

    risk_conditions: list[ColumnElement[bool]] = []
    if risk_visibility is not None:
        risk_conditions.append(risk_visibility)
    if not include_archived:
        risk_conditions.append(Risk.live())
    risk_level_condition = build_risk_level_condition_from_ranges(risk_level, risk_level_ranges)
    if risk_level_condition is not None:
        risk_conditions.append(risk_level_condition)

    control_query = select(func.count(Control.id))
    if control_conditions:
        control_query = control_query.where(and_(*control_conditions))
    total_controls = (await db.execute(control_query)).scalar() or 0

    controls_by_status = {}
    for control_status_enum in ControlStatus:
        conditions = [Control.status == control_status_enum.value] + control_conditions
        count = (await db.execute(select(func.count(Control.id)).where(and_(*conditions)))).scalar() or 0
        if count > 0:
            controls_by_status[control_status_enum.value] = count

    controls_by_form = {}
    for form in ControlForm:
        form_filter = Control.control_form == control_form if control_form else None
        conditions = [Control.control_form == form.value] + [
            condition
            for condition in control_conditions
            if form_filter is None or condition.compare(form_filter) is False
        ]
        count = (await db.execute(select(func.count(Control.id)).where(and_(*conditions)))).scalar() or 0
        if count > 0:
            controls_by_form[form.value] = count

    controls_by_frequency = {}
    for frequency in ControlFrequency:
        conditions = [Control.frequency == frequency.value] + control_conditions
        count = (await db.execute(select(func.count(Control.id)).where(and_(*conditions)))).scalar() or 0
        if count > 0:
            controls_by_frequency[frequency.value] = count

    risk_query = select(func.count(Risk.id))
    if risk_conditions:
        risk_query = risk_query.where(and_(*risk_conditions))
    total_risks = (await db.execute(risk_query)).scalar() or 0

    risks_by_status = {}
    for risk_status_enum in RiskStatus:
        conditions = [Risk.status == risk_status_enum.value] + risk_conditions
        count = (await db.execute(select(func.count(Risk.id)).where(and_(*conditions)))).scalar() or 0
        if count > 0:
            risks_by_status[risk_status_enum.value] = count

    critical_level_condition = build_risk_level_condition_from_ranges("critical", risk_level_ranges)
    assert critical_level_condition is not None
    critical_conditions = [critical_level_condition] + risk_conditions
    critical_risks_count = (
        await db.execute(select(func.count(Risk.id)).where(and_(*critical_conditions)))
    ).scalar() or 0

    avg_query = select(func.avg(Risk.net_score))
    if risk_conditions:
        avg_query = avg_query.where(and_(*risk_conditions))
    average_net_risk_score = float((await db.execute(avg_query)).scalar() or 0)

    total_vendors = 0
    high_risk_vendors_count = 0
    vendor_conditions = [Vendor.live()]
    vendor_scope_filter = vendor_visibility_clause(current_user, department_id=department_id)
    if vendor_scope_filter is not None:
        vendor_conditions.append(vendor_scope_filter)

    if has_permission(current_user, "vendors", "read"):
        total_vendors = (await db.execute(select(func.count(Vendor.id)).where(and_(*vendor_conditions)))).scalar() or 0
        high_risk_vendors_count = (
            await db.execute(
                select(func.count(Vendor.id)).where(and_(*(vendor_conditions + [Vendor.risk_score_1_5 >= 4])))
            )
        ).scalar() or 0

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
    )


async def build_available_periods(db: AsyncSession, current_user: User) -> dict[str, Any]:
    now = utc_now()
    current_quarter_label = get_quarter_label(now)
    current_year = now.year
    current_quarter_number = ((now.month - 1) // 3) + 1
    previous_quarter_year = current_year - 1 if current_quarter_number == 1 else current_year
    dept_ids = get_user_department_ids(current_user)

    snapshot_years_query = select(QuarterlyMetricSnapshot.year.distinct()).order_by(QuarterlyMetricSnapshot.year)
    if dept_ids is None:
        snapshot_years_query = snapshot_years_query.where(QuarterlyMetricSnapshot.department_id.is_(None))
    elif dept_ids:
        snapshot_years_query = snapshot_years_query.where(QuarterlyMetricSnapshot.department_id.in_(dept_ids))
    else:
        snapshot_years_query = snapshot_years_query.where(false())
    snapshot_years = set(row[0] for row in (await db.execute(snapshot_years_query)).fetchall())

    risk_years_query = select(func.extract("year", Risk.created_at).distinct()).where(Risk.created_at.isnot(None))
    if dept_ids is not None:
        if dept_ids:
            risk_years_query = risk_years_query.where(Risk.department_id.in_(dept_ids))
        else:
            risk_years_query = risk_years_query.where(false())
    risk_years = set(int(row[0]) for row in (await db.execute(risk_years_query)).fetchall() if row[0])

    return {
        "years": sorted(snapshot_years | risk_years | {current_year, previous_quarter_year}),
        "current_quarter": current_quarter_label,
    }


async def build_committee_summary_metrics(*, db: AsyncSession, current_user: User) -> dict[str, Any]:
    from app.services._dashboard_metrics.committee_projection import (
        activity_payload,
        department_exposure_payload,
        empty_committee_core,
        fetch_committee_core,
        fetch_vendor_sections,
        risk_payload,
        vendor_payload,
    )

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None and not dept_ids:
        return empty_committee_core()

    critical_risks, recent_activity, dept_exposure = await fetch_committee_core(db, dept_ids=dept_ids)
    vendor_sections = await fetch_vendor_sections(
        db,
        current_user=current_user,
        can_read_vendors=has_permission(current_user, "vendors", "read"),
    )

    return {
        "critical_risks": [risk_payload(risk) for risk in critical_risks],
        "recent_activity": [activity_payload(item) for item in recent_activity],
        "department_exposure": [department_exposure_payload(row) for row in dept_exposure],
        "critical_vendors": [vendor_payload(vendor) for vendor in vendor_sections["critical_vendors"]],
    }
