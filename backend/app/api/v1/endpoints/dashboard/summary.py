from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import get_user_department_ids, has_permission
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, Risk, User, Vendor
from app.models.control import ControlForm, ControlFrequency, ControlStatus
from app.models.global_config import ConfigDefaults
from app.models.risk import RiskStatus
from app.schemas.dashboard import DashboardSummaryResponse

from ._shared import build_risk_level_condition

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    control_status: Optional[str] = Query(None, description="Filter by control status"),
    control_form: Optional[str] = Query(None, description="Filter by control form"),
    risk_level: Optional[Literal["critical", "high", "medium", "low"]] = Query(
        None, description="Filter by risk level"
    ),
    include_archived: bool = Query(False, description="Include archived items"),
):
    """Get overview statistics for executive dashboard with optional filters."""

    # Apply department filtering
    dept_ids = get_user_department_ids(current_user)
    control_dept_filter: ColumnElement[bool] | None = None
    risk_dept_filter: ColumnElement[bool] | None = None

    if dept_ids is not None:
        control_dept_filter = Control.department_id.in_(dept_ids)
        risk_dept_filter = Risk.department_id.in_(dept_ids)
    elif department_id:
        control_dept_filter = Control.department_id == department_id
        risk_dept_filter = Risk.department_id == department_id

    # Build control filters
    control_conditions: list[ColumnElement[bool]] = []
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
    risk_conditions: list[ColumnElement[bool]] = []
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
        result = await db.execute(select(func.count(Control.id)).where(and_(*conditions)))
        count = result.scalar() or 0
        if count > 0:
            controls_by_status[control_status_enum.value] = count

    # Controls by form
    controls_by_form = {}
    for form in ControlForm:
        form_filter = Control.control_form == control_form if control_form else None
        conditions = [Control.control_form == form.value] + [
            c for c in control_conditions if form_filter is None or c.compare(form_filter) is False
        ]
        result = await db.execute(select(func.count(Control.id)).where(and_(*conditions)))
        count = result.scalar() or 0
        if count > 0:
            controls_by_form[form.value] = count

    # Controls by frequency
    controls_by_frequency = {}
    for freq in ControlFrequency:
        conditions = [Control.frequency == freq.value] + control_conditions
        result = await db.execute(select(func.count(Control.id)).where(and_(*conditions)))
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
        result = await db.execute(select(func.count(Risk.id)).where(and_(*conditions)))
        count = result.scalar() or 0
        if count > 0:
            risks_by_status[risk_status_enum.value] = count

    # Critical risks (net_score >= critical threshold)
    critical_threshold = ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE
    critical_conditions = [Risk.net_score >= critical_threshold] + risk_conditions
    critical_result = await db.execute(select(func.count(Risk.id)).where(and_(*critical_conditions)))
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
