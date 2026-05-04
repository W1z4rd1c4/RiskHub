from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_to_summary
from app.api.v1.endpoints._collection import (
    build_list_context,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.core.permissions import can_read_vendor, get_user_department_ids
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import (
    ApprovalResourceType,
    ControlRiskLink,
    KeyRiskIndicator,
    Risk,
    User,
    VendorRiskLink,
)
from app.models.global_config import ConfigDefaults, get_config_int
from app.schemas.risk import RiskListResponse, RiskStatusEnum
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._register_listings.lifecycle import execute_register_listing_plan
from app.services._register_listings.risks import plan_risk_listing
from app.services.authorization_capabilities import risk_capabilities

router = APIRouter()

@router.get("", response_model=RiskListResponse)
async def list_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[RiskStatusEnum] = None,
    risk_type: Optional[str] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived risks in results"),
    has_breach: Optional[bool] = None,
    min_net_score: Optional[int] = Query(
        None, ge=0, le=25, description="Filter risks with net_score >= this value (e.g., 15 for critical)"
    ),
    sort_by: Optional[str] = Query(None, description="Field to sort by"),
    sort_order: Optional[str] = Query("asc", description="Sort order (asc or desc)"),
    process: Optional[str] = Query(None, description="Filter by process name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> RiskListResponse:
    """
    List risks with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's risks.
    Also includes risks where user is reporting owner of any linked KRI or control owner.
    Returns paginated response with total count.
    """
    from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner

    collection_context = build_list_context(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
        legacy_filters={
            "department_id": department_id,
            "status": status.value if status else None,
            "risk_type": risk_type,
            "is_priority": is_priority,
            "search": search,
            "include_archived": include_archived,
            "has_breach": has_breach,
            "min_net_score": min_net_score,
            "process": process,
            "category": category,
        },
    )
    collection_query = collection_context.query
    filter_values = collection_context.filters
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    status_value = filter_values.get("status")
    status = coerce_optional_enum(RiskStatusEnum, status_value, "status")
    risk_type = coerce_optional_string("risk_type", filter_values.get("risk_type"))
    is_priority = coerce_optional_bool("is_priority", filter_values.get("is_priority"))
    search = coerce_optional_string("search", filter_values.get("search"))
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    has_breach = coerce_optional_bool("has_breach", filter_values.get("has_breach"))
    min_net_score = coerce_optional_int("min_net_score", filter_values.get("min_net_score"), min_value=0, max_value=25)
    process = coerce_optional_string("process", filter_values.get("process"))
    category = coerce_optional_string("category", filter_values.get("category"))
    sort_by = collection_query.sort.field if collection_query.sort else sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else sort_order

    base_query = select(Risk)

    # Department filtering based on role
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # If not empty, user is restricted to specific departments
        # Include risks from user's departments OR where user is direct risk owner OR
        # where user is KRI reporting owner/control owner on linked entities.
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)

        if cross_dept_risk_ids:
            base_query = base_query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    Risk.owner_id == current_user.id,
                    Risk.id.in_(cross_dept_risk_ids),
                )
            )
        else:
            base_query = base_query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    Risk.owner_id == current_user.id,
                )
            )
    elif department_id:  # Privileged user can filter by specific department
        base_query = base_query.where(Risk.department_id == department_id)

    # Status filter
    if status:
        base_query = base_query.where(Risk.status == status.value)
    elif not include_archived:
        # Default: exclude archived unless explicitly requested
        base_query = base_query.where(Risk.status != RiskStatusEnum.archived.value)

    # Risk type filter
    if risk_type:
        base_query = base_query.where(Risk.risk_type == risk_type)

    # Priority filter
    if is_priority is not None:
        base_query = base_query.where(Risk.is_priority == is_priority)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )
    # Breach filter
    if has_breach is not None:
        breaching_subq = (
            select(KeyRiskIndicator.risk_id)
            .where(
                KeyRiskIndicator.is_archived.is_(False),
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                ),
            )
            .scalar_subquery()
        )

        if has_breach:
            base_query = base_query.where(Risk.id.in_(breaching_subq))
        else:
            base_query = base_query.where(Risk.id.notin_(breaching_subq))

    # Net score filter (for critical risks: min_net_score=15)
    if min_net_score is not None:
        base_query = base_query.where(Risk.net_score >= min_net_score)

    # Process filter (for link dialog filtering)
    if process:
        base_query = base_query.where(Risk.process == process)

    # Category filter (for link dialog filtering)
    if category:
        base_query = base_query.where(Risk.category == category)

    # Get total count before pagination
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Determine sort column
    order_column: Any = Risk.risk_id_code  # Default sort

    if sort_by:
        if sort_by == "name":
            order_column = Risk.name
        elif sort_by == "description":
            order_column = Risk.description
        elif sort_by == "status":
            order_column = Risk.status
        elif sort_by == "risk_id_code":
            order_column = Risk.risk_id_code
        elif sort_by == "category":
            order_column = Risk.category
        elif sort_by == "type":  # Frontend sends 'type' for risk type
            order_column = Risk.risk_type
        elif sort_by == "risk_type":
            order_column = Risk.risk_type
        elif sort_by == "gross_score":
            order_column = Risk.gross_score
        elif sort_by == "net_score":
            order_column = Risk.net_score
        elif sort_by == "kri_count":
            order_column = (
                select(func.count(KeyRiskIndicator.id))
                .where(
                    KeyRiskIndicator.risk_id == Risk.id,
                    KeyRiskIndicator.is_archived.is_(False),
                )
                .scalar_subquery()
            )
        elif sort_by == "control_count":
            order_column = (
                select(func.count(ControlRiskLink.id)).where(ControlRiskLink.risk_id == Risk.id).scalar_subquery()
            )

    # Apply sort order
    if sort_order == "desc":
        base_query = base_query.order_by(desc(order_column))
    else:
        base_query = base_query.order_by(asc(order_column))

    query_options = (
        selectinload(Risk.department),
        selectinload(Risk.owner),
        selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        selectinload(Risk.control_links),
        selectinload(Risk.vendor_links).selectinload(VendorRiskLink.vendor),
    )

    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": check_permission(current_user, "risks", "write"),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }

    async def serialize_risks(risks: list[Risk]):
        risk_ids = {risk.id for risk in risks}
        approvals_by_risk = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.RISK,
            resource_ids=risk_ids,
        )
        high_risk_min_net_score = await get_config_int(
            db,
            "high_risk_min_net_score",
            ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        )
        kri_reporting_owner_risk_ids = set(await get_risk_ids_where_kri_reporting_owner(db, current_user.id))
        control_owner_risk_ids = set(await get_risk_ids_where_control_owner(db, current_user.id))
        items = []
        for risk in risks:
            linked_vendors: list[LinkedVendorRead] = []
            if can_read_vendors:
                for link in getattr(risk, "vendor_links", []) or []:
                    vendor = getattr(link, "vendor", None)
                    if vendor is None or not can_read_vendor(vendor, current_user):
                        continue
                    linked_vendors.append(LinkedVendorRead(id=vendor.id, name=vendor.name))
            capabilities = await risk_capabilities(
                db,
                current_user=current_user,
                risk=risk,
                preloaded_approvals=approvals_by_risk.get(risk.id, []),
                high_risk_min_net_score=high_risk_min_net_score,
                can_read_override=True,
                is_kri_reporting_owner_for_risk=risk.id in kri_reporting_owner_risk_ids,
                is_control_owner_for_risk=risk.id in control_owner_risk_ids,
            )
            items.append(risk_to_summary(risk, linked_vendors=linked_vendors, capabilities=capabilities))
        return items

    ordered_query = base_query.options(*query_options)
    filtered_ids = base_query.with_only_columns(Risk.id).order_by(None).subquery()

    listing_plan = plan_risk_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_risks,
        total=total,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=RiskListResponse,
        query=collection_query,
        plan=listing_plan,
    )
