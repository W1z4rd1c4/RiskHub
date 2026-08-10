from __future__ import annotations

from dataclasses import replace
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.v1.endpoints._collection import build_list_context
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.vendor import (
    VendorCreate,
    VendorListResponse,
    VendorRead,
    VendorTypeEnum,
    VendorUpdate,
)
from app.services._collection_contracts import CollectionQuery
from app.services._register_listings import vendors as vendor_listing
from app.services._register_listings.vendors import list_vendor_governance
from app.services._reporting.vendor_register_export import render_vendor_register_csv
from app.services._vendor_governance.lifecycle import (
    create_vendor_detail,
    read_vendor_detail,
    update_vendor_detail,
)
from app.services._vendor_governance.policy import (
    assert_vendor_export_allowed,
    assert_vendor_list_allowed,
)
from app.services._vendor_governance.projection import get_visible_vendor_risk_ids as _get_visible_risk_ids

router = APIRouter()


def vendor_list_criteria_dependency(
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False),
    vendor_type: Optional[VendorTypeEnum] = None,
    dora_relevant: Optional[bool] = None,
    supports_important_core_insurance_function: Optional[bool] = None,
    is_significant_vendor: Optional[bool] = None,
    outsourcing_owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    process: Optional[str] = None,
    subprocess: Optional[str] = None,
    risk_score_1_5: Optional[int] = Query(None, ge=1, le=5),
    lifecycle: list[str] | None = Query(None),
    department_ids: list[int] | None = Query(None),
    outsourcing_owner_ids: list[int] | None = Query(None),
    vendor_types: list[str] | None = Query(None),
    risk_scores: list[int] | None = Query(None),
    tiers: list[str] | None = Query(None),
    cif: bool | None = Query(None),
    substitutability: list[str] | None = Query(None),
    countries: list[str] | None = Query(None),
    country_categories: list[str] | None = Query(None),
    has_roi_contract: bool | None = Query(None),
    has_sub_outsourcing: bool | None = Query(None),
    has_direct_process_link: bool | None = Query(None),
    linked_process_ids: list[int] | None = Query(None),
    linked_asset_ids: list[int] | None = Query(None),
    linked_risk_ids: list[int] | None = Query(None),
    linked_control_ids: list[int] | None = Query(None),
    linked_kri_ids: list[int] | None = Query(None),
    tier: Literal["critical", "significant", "standard"] | None = Query(None),
    sort_by: Optional[str] = None,
    sort_order: str = Query("asc"),
    view: str = Query("all"),
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
) -> vendor_listing.VendorListCriteria:
    context = build_list_context(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        legacy_filters={
            "search": search,
            "include_archived": include_archived,
            "vendor_type": vendor_type.value if vendor_type else None,
            "dora_relevant": dora_relevant,
            "supports_important_core_insurance_function": supports_important_core_insurance_function,
            "is_significant_vendor": is_significant_vendor,
            "outsourcing_owner_user_id": outsourcing_owner_user_id,
            "department_id": department_id,
            "process": process,
            "subprocess": subprocess,
            "risk_score_1_5": risk_score_1_5,
            "lifecycle": lifecycle,
            "department_ids": department_ids,
            "outsourcing_owner_ids": outsourcing_owner_ids,
            "vendor_types": vendor_types,
            "risk_scores": risk_scores,
            "tiers": tiers or ([tier] if tier else None),
            "cif": cif,
            "substitutability": substitutability,
            "countries": countries,
            "country_categories": country_categories,
            "has_roi_contract": has_roi_contract,
            "has_sub_outsourcing": has_sub_outsourcing,
            "has_direct_process_link": has_direct_process_link,
            "linked_process_ids": linked_process_ids,
            "linked_asset_ids": linked_asset_ids,
            "linked_risk_ids": linked_risk_ids,
            "linked_control_ids": linked_control_ids,
            "linked_kri_ids": linked_kri_ids,
        },
    )
    # Preserve the scalar compatibility inputs without weakening the shared
    # multi-select contract. JSON `filters` remains authoritative.
    criteria = vendor_listing.vendor_criteria_from_filters(
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


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    criteria: vendor_listing.VendorListCriteria = Depends(vendor_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await assert_vendor_list_allowed(db, current_user=current_user)
    return await list_vendor_governance(
        db=db,
        current_user=current_user,
        collection_query=CollectionQuery(
            offset=criteria.offset,
            limit=criteria.limit,
            group_by=criteria.group_by,
            group_value=criteria.group_value,
        ),
        criteria_override=criteria,
        check_permission_fn=check_permission,
        visible_risk_ids_loader=_get_visible_risk_ids,
    )


@router.get("/export")
async def export_vendors(
    locale: Literal["en", "cs"] = Query("en"),
    format: Literal["csv"] = Query("csv"),
    criteria: vendor_listing.VendorListCriteria = Depends(vendor_list_criteria_dependency),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    del format
    assert_vendor_export_allowed(current_user=current_user)
    export_criteria = replace(
        criteria,
        offset=0,
        limit=1_000_000,
    )
    response = await list_vendor_governance(
        db=db,
        current_user=current_user,
        collection_query=CollectionQuery(
            offset=0,
            limit=export_criteria.limit,
            group_by=export_criteria.group_by,
            group_value=export_criteria.group_value,
        ),
        criteria_override=export_criteria,
        check_permission_fn=check_permission,
        visible_risk_ids_loader=_get_visible_risk_ids,
    )
    return render_vendor_register_csv(response.items, locale=locale)


@router.post(
    "",
    response_model=VendorRead,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def create_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "write")),
):
    return await create_vendor_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{vendor_id}", response_model=VendorRead)
async def get_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await read_vendor_detail(db=db, vendor_id=vendor_id, current_user=current_user)


@router.patch(
    "/{vendor_id}",
    response_model=VendorRead,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def update_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await update_vendor_detail(db=db, vendor_id=vendor_id, payload=payload, current_user=current_user)
