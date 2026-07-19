from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.collection import SortDirection
from app.schemas.process import ProcessCreate, ProcessListResponse, ProcessRead, ProcessUpdate
from app.services._ict_register_lifecycle.lifecycle import (
    create_process_detail,
    read_process_detail,
    update_process_detail,
)
from app.services._ict_register_lifecycle.projection import load_visible_pending_process_creations
from app.services._register_listings.lifecycle import build_in_memory_register_response
from app.services._register_listings.processes import (
    ProcessListCriteria,
    build_process_listing,
    process_collection_capabilities,
    process_criteria_from_filters,
)
from app.services._reporting.process_register_export import render_process_register_csv

router = APIRouter()


def process_list_criteria_dependency(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived processes"),
    sort_by: Optional[str] = None,
    sort_order: SortDirection = Query("asc"),
    cif: bool | None = Query(None, description="Filter by derived critical/important function status"),
    lifecycle: list[str] | None = Query(None),
    department_ids: list[int] | None = Query(None),
    owner_ids: list[int] | None = Query(None),
    l0_areas: list[str] | None = Query(None),
    criticality: list[str] | None = Query(None),
    is_complete: bool | None = Query(None),
    licensed_activity: list[str] | None = Query(None),
    bcm_link: list[str] | None = Query(None),
    dr_test_result: list[str] | None = Query(None),
    mtpd_min: int | None = Query(None, ge=0),
    mtpd_max: int | None = Query(None, ge=0),
    linked_asset_ids: list[int] | None = Query(None),
    linked_vendor_ids: list[int] | None = Query(None),
    linked_risk_ids: list[int] | None = Query(None),
    view: str = Query("all"),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
    sort: str | None = Query(None, description="Shared collection sort JSON"),
    filters: str | None = Query(None, description="Shared collection filters JSON"),
) -> ProcessListCriteria:
    context = build_list_context(
        offset=offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        legacy_filters={
            "search": search,
            "include_archived": include_archived,
            "lifecycle": lifecycle,
            "department_ids": department_ids,
            "owner_ids": owner_ids,
            "l0_areas": l0_areas,
            "criticality": criticality,
            "cif": cif,
            "is_complete": is_complete,
            "licensed_activity": licensed_activity,
            "bcm_link": bcm_link,
            "dr_test_result": dr_test_result,
            "mtpd_min": mtpd_min,
            "mtpd_max": mtpd_max,
            "linked_asset_ids": linked_asset_ids,
            "linked_vendor_ids": linked_vendor_ids,
            "linked_risk_ids": linked_risk_ids,
        },
    )
    criteria = process_criteria_from_filters(
        offset=context.query.offset,
        limit=context.query.limit,
        filters=context.filters,
        sort_by=context.query.sort.field if context.query.sort else sort_by,
        sort_order=context.query.sort.direction if context.query.sort else sort_order,
        view=view,
        group_by=context.query.group_by,
        group_value=context.query.group_value,
    )
    return criteria


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    criteria: ProcessListCriteria = Depends(process_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    result = await build_process_listing(db, current_user=current_user, criteria=criteria)
    response = build_in_memory_register_response(
        response_model=ProcessListResponse,
        criteria=criteria,
        result=result,
        capabilities=process_collection_capabilities(current_user),
    )
    return response.model_copy(
        update={"pending_creations": await load_visible_pending_process_creations(db, current_user=current_user)}
    )


@router.get("/export")
async def export_processes(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    criteria: ProcessListCriteria = Depends(process_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    del format  # the Literal keeps the standard export format fail-closed
    result = await build_process_listing(db, current_user=current_user, criteria=criteria)
    return render_process_register_csv(result.matching_items, locale=locale)


@router.post(
    "",
    response_model=ProcessRead,
    status_code=status.HTTP_201_CREATED,
    responses={202: {"model": ApprovalQueuedResponse}},
)
async def create_process(
    payload: ProcessCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await create_process_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{process_id}", response_model=ProcessRead)
async def get_process(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await read_process_detail(db=db, process_id=process_id, current_user=current_user)


@router.patch(
    "/{process_id}",
    response_model=ProcessRead,
    responses={202: {"model": ApprovalQueuedResponse}},
)
async def update_process(
    process_id: int,
    payload: ProcessUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await update_process_detail(db=db, process_id=process_id, payload=payload, current_user=current_user)
