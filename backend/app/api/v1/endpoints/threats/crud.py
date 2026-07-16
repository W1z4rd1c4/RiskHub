from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.collection import SortDirection
from app.schemas.threat import ThreatCreate, ThreatListResponse, ThreatRead, ThreatUpdate
from app.services._ict_register_lifecycle.threat_lifecycle import (
    create_threat_detail,
    read_threat_detail,
    update_threat_detail,
)
from app.services._register_listings.lifecycle import build_in_memory_register_response
from app.services._register_listings.threats import (
    ThreatListCriteria,
    build_threat_listing,
    threat_collection_capabilities,
    threat_criteria_from_filters,
)
from app.services._reporting.threat_register_export import render_threat_register_csv

router = APIRouter()


def threat_list_criteria_dependency(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived threats"),
    sort_by: Optional[str] = None,
    sort_order: SortDirection = Query("asc"),
    lifecycle: list[str] | None = Query(None),
    categories: list[str] | None = Query(None),
    steward_ids: list[int] | None = Query(None),
    relevant_subjects: list[str] | None = Query(None),
    has_linked_risk: bool | None = Query(None),
    linked_risk_ids: list[int] | None = Query(None),
    linked_risk_types: list[str] | None = Query(None),
    linked_risk_department_ids: list[int] | None = Query(None),
    view: str = Query("all"),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
    sort: str | None = Query(None, description="Shared collection sort JSON"),
    filters: str | None = Query(None, description="Shared collection filters JSON"),
) -> ThreatListCriteria:
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
            "categories": categories,
            "steward_ids": steward_ids,
            "relevant_subjects": relevant_subjects,
            "has_linked_risk": has_linked_risk,
            "linked_risk_ids": linked_risk_ids,
            "linked_risk_types": linked_risk_types,
            "linked_risk_department_ids": linked_risk_department_ids,
        },
    )
    return threat_criteria_from_filters(
        offset=context.query.offset,
        limit=context.query.limit,
        filters=context.filters,
        sort_by=context.query.sort.field if context.query.sort else sort_by,
        sort_order=context.query.sort.direction if context.query.sort else sort_order,
        view=view,
        group_by=context.query.group_by,
        group_value=context.query.group_value,
    )


@router.get("", response_model=ThreatListResponse)
async def list_threats(
    criteria: ThreatListCriteria = Depends(threat_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "read")),
):
    result = await build_threat_listing(db, current_user=current_user, criteria=criteria)
    return build_in_memory_register_response(
        response_model=ThreatListResponse,
        criteria=criteria,
        result=result,
        capabilities=threat_collection_capabilities(current_user),
    )


@router.get("/export")
async def export_threats(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    criteria: ThreatListCriteria = Depends(threat_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    del format
    result = await build_threat_listing(db, current_user=current_user, criteria=criteria)
    return render_threat_register_csv(
        result.matching_items,
        risk_memberships=result.links.risks,
        risk_labels=result.links.risk_labels,
        locale=locale,
    )


@router.post("", response_model=ThreatRead, status_code=status.HTTP_201_CREATED)
async def create_threat(
    payload: ThreatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    return await create_threat_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{threat_id}", response_model=ThreatRead)
async def get_threat(
    threat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "read")),
):
    return await read_threat_detail(db=db, threat_id=threat_id, current_user=current_user)


@router.patch("/{threat_id}", response_model=ThreatRead)
async def update_threat(
    threat_id: int,
    payload: ThreatUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    return await update_threat_detail(db=db, threat_id=threat_id, payload=payload, current_user=current_user)
