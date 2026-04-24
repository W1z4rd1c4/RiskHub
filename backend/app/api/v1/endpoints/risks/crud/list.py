from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_to_summary
from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    build_grouped_collection_page,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    merge_collection_filters,
    parse_collection_query,
)
from app.core.permissions import can_read_vendor, get_user_department_ids
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import ControlRiskLink, KeyRiskIndicator, Risk, User, VendorRiskLink
from app.schemas.risk import RiskListResponse, RiskStatusEnum
from app.schemas.vendor_shared import LinkedVendorRead

router = APIRouter()

RISK_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
RISK_GROUP_UNCATEGORIZED = "__uncategorized__"
RISK_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
RISK_GROUP_NO_PROCESS = "__no_process__"
RISK_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"


def _risk_group_entries(risk, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = risk.linked_vendors or []
        if not vendors:
            return [CollectionGroupEntry(RISK_GROUP_UNLINKED_VENDOR, RISK_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]

    if group_by == "category":
        value = risk.category or RISK_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(value, value)]

    if group_by == "department":
        value = risk.department_name or RISK_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]

    if group_by == "process":
        value = risk.process or RISK_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]

    if group_by in {"risk_type", "type"}:
        value = risk.risk_type or RISK_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]

    return []


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

    collection_query = parse_collection_query(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
    )
    filter_values = merge_collection_filters(
        collection_query,
        {
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
    offset = collection_query.offset
    limit = collection_query.limit
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
    order_column = Risk.risk_id_code  # Default sort

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

    def serialize_risks(risks: list[Risk]):
        items = []
        for risk in risks:
            linked_vendors: list[LinkedVendorRead] = []
            if can_read_vendors:
                for link in getattr(risk, "vendor_links", []) or []:
                    vendor = getattr(link, "vendor", None)
                    if vendor is None or not can_read_vendor(vendor, current_user):
                        continue
                    linked_vendors.append(LinkedVendorRead(id=vendor.id, name=vendor.name))
            items.append(risk_to_summary(risk, linked_vendors=linked_vendors))
        return items

    ordered_query = base_query.options(*query_options)

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        all_items = serialize_risks(list(result.scalars().all()))
        paginated_items, grouped_total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=_risk_group_entries,
            is_active=lambda risk: risk.status == RiskStatusEnum.active.value,
            is_highlighted=lambda risk: risk.net_score >= 16,
        )
        return RiskListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
        )

    # Apply pagination
    query = ordered_query.offset(offset).limit(limit)

    result = await db.execute(query)
    risks = result.scalars().all()

    items = serialize_risks(list(risks))

    return RiskListResponse(items=items, total=total, offset=offset, limit=limit)
