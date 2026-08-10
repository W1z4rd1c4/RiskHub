from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.datetime_utils import utc_now
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.issue import IssueRemediationStatus, IssueSeverity, IssueStatus
from app.schemas.issue import IssueListResponse
from app.services._issue_register.linked_context import build_issue_linked_visibility
from app.services._register_listings.issues import IssueListingCriteria, plan_issue_listing
from app.services._register_listings.lifecycle import (
    execute_register_listing_plan,
    load_register_listing_export_models,
)
from app.services._reporting.exports.rows import _issue_to_row
from app.services._reporting.kri_issue_register_export import render_issue_register_csv
from app.services.authorization_capabilities import preload_issue_capabilities

router = APIRouter()


def issue_listing_criteria_dependency(
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
    has_active_exception: bool | None = Query(None),
    remediation_status: IssueRemediationStatus | None = Query(None),
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
) -> IssueListingCriteria:
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
            "has_active_exception": has_active_exception,
            "remediation_status": remediation_status,
            "linked_risk_id": linked_risk_id,
            "linked_control_id": linked_control_id,
            "linked_vendor_id": linked_vendor_id,
            "search": search,
            "include_closed": include_closed,
        },
    )
    return IssueListingCriteria(
        query=collection_context.query,
        filters=collection_context.filters,
        sort_by=sort_by,
        sort_order=sort_order,
        capability_preloader=preload_issue_capabilities,
    )


@router.get("/issues", response_model=IssueListResponse)
async def list_issues(
    criteria: IssueListingCriteria = Depends(issue_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
) -> IssueListResponse:
    listing_plan = await plan_issue_listing(db=db, current_user=current_user, criteria=criteria)
    return await execute_register_listing_plan(
        db=db,
        response_model=IssueListResponse,
        query=criteria.query,
        plan=listing_plan,
    )


@router.get("/issues/export")
async def export_issues(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    as_of_date: date | None = Query(
        None,
        description="Point-in-time exports are provided by /reports/issues/export",
    ),
    criteria: IssueListingCriteria = Depends(issue_listing_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "read")),
    _reporting_user: User = Depends(require_permission("reports", "read")),
):
    del format
    if as_of_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "point_in_time_export_requires_report",
                "message": "Use /api/v1/reports/issues/export for point-in-time Issue exports.",
            },
        )

    listing_plan = await plan_issue_listing(db=db, current_user=current_user, criteria=criteria)
    models = await load_register_listing_export_models(
        db=db,
        query=criteria.query,
        plan=listing_plan,
    )
    now = utc_now()
    rows: list[dict[str, Any]] = []
    for offset in range(0, len(models), 100):
        batch = models[offset : offset + 100]
        linked_visibility = await build_issue_linked_visibility(db, current_user, batch)
        rows.extend(
            _issue_to_row(
                issue,
                as_of_dt=now,
                current_user=current_user,
                linked_visibility=linked_visibility,
                overdue_mode="current_register",
            )
            for issue in batch
        )
    return render_issue_register_csv(rows, locale=locale)
