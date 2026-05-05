from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.issue import IssueSeverity, IssueStatus
from app.schemas.issue import IssueListResponse
from app.services.authorization_capabilities import issue_capabilities
from app.services._register_listings.issues import IssueListingCriteria, plan_issue_listing
from app.services._register_listings.lifecycle import execute_register_listing_plan

router = APIRouter()

@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[IssueStatus] = None,
    severity: Optional[IssueSeverity] = None,
    severity_group: Optional[Literal["high_critical"]] = Query(None),
    owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    overdue: Optional[bool] = None,
    exclude_active_exceptions: bool = Query(False),
    linked_risk_id: Optional[int] = None,
    linked_control_id: Optional[int] = None,
    linked_vendor_id: Optional[int] = None,
    search: Optional[str] = Query(None),
    include_closed: bool = Query(True),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> IssueListResponse:
    collection_context = build_list_context(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
        legacy_filters={
            "status": status.value if status else None,
            "severity": severity.value if severity else None,
            "severity_group": severity_group,
            "owner_user_id": owner_user_id,
            "department_id": department_id,
            "overdue": overdue,
            "exclude_active_exceptions": exclude_active_exceptions,
            "linked_risk_id": linked_risk_id,
            "linked_control_id": linked_control_id,
            "linked_vendor_id": linked_vendor_id,
            "search": search,
            "include_closed": include_closed,
        },
    )
    collection_query = collection_context.query
    listing_plan = await plan_issue_listing(
        db=db,
        current_user=current_user,
        criteria=IssueListingCriteria(
            query=collection_query,
            filters=collection_context.filters,
            sort_by=sort_by,
            sort_order=sort_order,
            capability_loader=issue_capabilities,
        ),
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=IssueListResponse,
        query=collection_query,
        plan=listing_plan,
    )
