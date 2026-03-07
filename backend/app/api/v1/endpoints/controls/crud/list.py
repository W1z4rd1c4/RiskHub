from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    build_control_monitoring_fields,
    load_monitoring_response_context,
)
from app.core.datetime_utils import utc_now
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, ControlRiskLink, Risk, User
from app.schemas.control import (
    ControlFormEnum,
    ControlListResponse,
    ControlStatusEnum,
    ControlSummary,
    normalize_control_frequency,
)
from app.services._monitoring_status import ControlMonitoringStatus, apply_control_monitoring_status_filter

from .._helpers import _apply_department_scoping, _apply_process_category_filters

router = APIRouter()


@router.get("", response_model=ControlListResponse)
async def list_controls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[ControlStatusEnum] = None,
    include_archived: bool = Query(False, description="Include archived controls in results"),
    search: Optional[str] = None,
    process: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    monitoring_status: Optional[ControlMonitoringStatus] = Query(None),
):
    """
    List controls with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's controls.
    Also includes controls where user is the control owner.
    Returns paginated response with total count.
    """
    base_query = select(Control)

    # Apply department-based scoping
    base_query = await _apply_department_scoping(db, base_query, current_user, department_id)

    # Status filter
    if status:
        base_query = base_query.where(Control.status == status.value)
    elif not include_archived:
        # Default: exclude archived
        base_query = base_query.where(Control.status != ControlStatusEnum.archived.value)

    # Join for secondary search fields (Risk via ControlRiskLink)
    from sqlalchemy.orm import aliased

    from app.models.department import Department

    RiskDept = aliased(Department)

    base_query = base_query.outerjoin(Control.department)
    base_query = base_query.outerjoin(Control.risk_links).outerjoin(ControlRiskLink.risk)
    base_query = base_query.outerjoin(RiskDept, Risk.department_id == RiskDept.id)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Control.name.ilike(search_pattern),
                Control.description.ilike(search_pattern),
                Department.name.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.risk_id_code.ilike(search_pattern),
                RiskDept.name.ilike(search_pattern),
            )
        )

    # Distinct because of risk joins
    base_query = base_query.distinct()

    # Apply optional process/category filters
    base_query = _apply_process_category_filters(base_query, process, category)

    query_options = (
        selectinload(Control.department),
        selectinload(Control.control_owner),
        selectinload(Control.executions),
        selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk)
        .options(selectinload(Risk.owner), selectinload(Risk.department)),
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    filtered_query = base_query
    if monitoring_status is not None:
        filtered_query = apply_control_monitoring_status_filter(
            filtered_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            execution_stale_days=monitoring_context.control_config.execution_stale_days,
        )

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = filtered_query.options(*query_options).order_by(Control.name).offset(skip).limit(limit)
    result = await db.execute(query)
    controls = result.scalars().all()
    control_monitoring_rows = [(control, build_control_monitoring_fields(control, monitoring_context)) for control in controls]

    # Map to summary with department_name and risk info
    from app.core.permissions import (
        can_access_department_id,
        get_risk_ids_where_control_owner,
        get_risk_ids_where_kri_reporting_owner,
    )

    can_read_risks = check_permission(current_user, "risks", "read")
    cross_dept_risk_ids: set[int] = set()
    if can_read_risks:
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)

    items = []
    for c, monitoring_fields in control_monitoring_rows:
        # Get first linked risk for grouping purposes
        first_risk = c.risk_links[0].risk if c.risk_links else None

        risk_visible = False
        if first_risk and can_read_risks:
            risk_visible = can_access_department_id(current_user, first_risk.department_id) or (
                first_risk.id in cross_dept_risk_ids
            )

        items.append(
            ControlSummary(
                id=c.id,
                name=c.name,
                description=c.description,
                department_id=c.department_id,
                department_name=c.department.name if c.department else None,
                frequency=normalize_control_frequency(c.frequency),
                risk_level=c.risk_level,
                status=ControlStatusEnum(c.status),
                control_form=ControlFormEnum(c.control_form),
                control_owner_name=c.control_owner.name if c.control_owner else None,
                risk_type=first_risk.risk_type if (first_risk and risk_visible) else None,
                risk_id_code=first_risk.risk_id_code if (first_risk and risk_visible) else None,
                risk_description=first_risk.description if (first_risk and risk_visible) else None,
                risk_name=first_risk.name if (first_risk and risk_visible) else None,
                risk_owner_name=first_risk.owner.name if (first_risk and risk_visible and first_risk.owner) else None,
                risk_department_name=first_risk.department.name
                if (first_risk and risk_visible and first_risk.department)
                else None,
                **monitoring_fields,
            )
        )

    return ControlListResponse(items=items, total=total, skip=skip, limit=limit)
