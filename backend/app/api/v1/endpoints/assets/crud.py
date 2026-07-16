from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints._collection import build_list_context
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.asset import AssetCreate, AssetListResponse, AssetRead, AssetUpdate
from app.schemas.collection import SortDirection
from app.services._ict_register_lifecycle.asset_lifecycle import (
    create_asset_detail,
    read_asset_detail,
    update_asset_detail,
)
from app.services._register_listings.assets import (
    AssetListCriteria,
    asset_collection_capabilities,
    asset_criteria_from_filters,
    build_asset_listing,
)
from app.services._reporting.asset_register_export import render_asset_register_csv

router = APIRouter()


def asset_list_criteria_dependency(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived assets"),
    sort_by: Optional[str] = None,
    sort_order: SortDirection = Query("asc"),
    lifecycle: list[str] | None = Query(None),
    department_ids: list[int] | None = Query(None),
    business_owner_ids: list[int] | None = Query(None),
    ict_owner_ids: list[int] | None = Query(None),
    asset_types: list[str] | None = Query(None),
    asset_levels: list[str] | None = Query(None),
    deployment_models: list[str] | None = Query(None),
    criticality: list[str] | None = Query(None, description="Filter by derived resulting criticality"),
    cif: bool | None = Query(None),
    lifecycle_states: list[str] | None = Query(None),
    legacy: bool | None = Query(None),
    spof: bool | None = Query(None),
    external_dependency: bool | None = Query(None),
    gdpr_relevance: list[str] | None = Query(None),
    ai_relevance: list[str] | None = Query(None),
    internet_exposed: bool | None = Query(None),
    data_classification: list[str] | None = Query(None),
    is_complete: bool | None = Query(None),
    linked_process_ids: list[int] | None = Query(None),
    linked_asset_ids: list[int] | None = Query(None),
    linked_vendor_ids: list[int] | None = Query(None),
    linked_risk_ids: list[int] | None = Query(None),
    has_process_link: bool | None = Query(None),
    view: str = Query("all"),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
    sort: str | None = Query(None, description="Shared collection sort JSON"),
    filters: str | None = Query(None, description="Shared collection filters JSON"),
) -> AssetListCriteria:
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
            "business_owner_ids": business_owner_ids,
            "ict_owner_ids": ict_owner_ids,
            "asset_types": asset_types,
            "asset_levels": asset_levels,
            "deployment_models": deployment_models,
            "criticality": criticality,
            "cif": cif,
            "lifecycle_states": lifecycle_states,
            "legacy": legacy,
            "spof": spof,
            "external_dependency": external_dependency,
            "gdpr_relevance": gdpr_relevance,
            "ai_relevance": ai_relevance,
            "internet_exposed": internet_exposed,
            "data_classification": data_classification,
            "is_complete": is_complete,
            "linked_process_ids": linked_process_ids,
            "linked_asset_ids": linked_asset_ids,
            "linked_vendor_ids": linked_vendor_ids,
            "linked_risk_ids": linked_risk_ids,
            "has_process_link": has_process_link,
        },
    )
    return asset_criteria_from_filters(
        offset=context.query.offset,
        limit=context.query.limit,
        filters=context.filters,
        sort_by=context.query.sort.field if context.query.sort else sort_by,
        sort_order=context.query.sort.direction if context.query.sort else sort_order,
        view=view,
        group_by=context.query.group_by,
        group_value=context.query.group_value,
    )


@router.get("", response_model=AssetListResponse)
async def list_assets(
    criteria: AssetListCriteria = Depends(asset_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    result = await build_asset_listing(db, current_user=current_user, criteria=criteria)
    items = [] if criteria.group_by and not criteria.group_value else result.page_items
    return AssetListResponse(
        items=items,
        total=len(result.matching_items),
        offset=criteria.offset,
        limit=criteria.limit,
        capabilities=asset_collection_capabilities(current_user),
        groups=result.groups,
        facets=result.facets,
    )


@router.get("/export")
async def export_assets(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    criteria: AssetListCriteria = Depends(asset_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    del format
    result = await build_asset_listing(db, current_user=current_user, criteria=criteria)
    return render_asset_register_csv(result.matching_items, locale=locale)


@router.post("", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await create_asset_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await read_asset_detail(db=db, asset_id=asset_id, current_user=current_user)


@router.patch("/{asset_id}", response_model=AssetRead)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await update_asset_detail(db=db, asset_id=asset_id, payload=payload, current_user=current_user)
