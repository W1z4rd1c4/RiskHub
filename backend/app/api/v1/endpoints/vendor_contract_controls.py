from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.vendor_contract_control import VendorContractControl, VendorContractControlStatus
from app.schemas.vendor_contract_control import (
    VendorContractControlItem,
    VendorContractControlsBulkUpdate,
    VendorContractControlsResponse,
    VendorContractControlStatusEnum,
    VendorContractControlTemplate,
)

router = APIRouter()


def _applies_ict(v: Vendor) -> bool:
    return v.vendor_type == "ict"


def _applies_dora_non_sig(v: Vendor) -> bool:
    return _applies_ict(v) and v.dora_relevant and not v.is_significant_vendor


def _applies_dora_sig(v: Vendor) -> bool:
    return _applies_ict(v) and v.dora_relevant and v.is_significant_vendor


TEMPLATES: dict[str, list[dict]] = {
    "ict_standard": [
        {
            "control_key": "audit_rights",
            "title_key": "contract_controls.items.audit_rights.title",
            "description_key": "contract_controls.items.audit_rights.description",
            "applies": _applies_ict,
        },
        {
            "control_key": "incident_reporting_sla",
            "title_key": "contract_controls.items.incident_reporting_sla.title",
            "description_key": "contract_controls.items.incident_reporting_sla.description",
            "applies": _applies_ict,
        },
        {
            "control_key": "data_location_and_access",
            "title_key": "contract_controls.items.data_location_and_access.title",
            "description_key": "contract_controls.items.data_location_and_access.description",
            "applies": _applies_ict,
        },
        {
            "control_key": "subcontractor_flowdown",
            "title_key": "contract_controls.items.subcontractor_flowdown.title",
            "description_key": "contract_controls.items.subcontractor_flowdown.description",
            "applies": _applies_ict,
        },
        {
            "control_key": "exit_assistance",
            "title_key": "contract_controls.items.exit_assistance.title",
            "description_key": "contract_controls.items.exit_assistance.description",
            "applies": _applies_ict,
        },
    ],
    "ict_dora_non_significant": [
        {
            "control_key": "dora_subcontractor_disclosure",
            "title_key": "contract_controls.items.dora_subcontractor_disclosure.title",
            "description_key": "contract_controls.items.dora_subcontractor_disclosure.description",
            "applies": _applies_dora_non_sig,
        },
        {
            "control_key": "dora_operational_resilience_testing",
            "title_key": "contract_controls.items.dora_operational_resilience_testing.title",
            "description_key": "contract_controls.items.dora_operational_resilience_testing.description",
            "applies": _applies_dora_non_sig,
        },
    ],
    "ict_dora_significant": [
        {
            "control_key": "dora_enhanced_audit_and_access",
            "title_key": "contract_controls.items.dora_enhanced_audit_and_access.title",
            "description_key": "contract_controls.items.dora_enhanced_audit_and_access.description",
            "applies": _applies_dora_sig,
        },
        {
            "control_key": "dora_exit_strategy_and_support",
            "title_key": "contract_controls.items.dora_exit_strategy_and_support.title",
            "description_key": "contract_controls.items.dora_exit_strategy_and_support.description",
            "applies": _applies_dora_sig,
        },
    ],
}


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


def _compute_status(
    *,
    applies: bool,
    stored_status: VendorContractControlStatus | None,
) -> VendorContractControlStatusEnum:
    if not applies:
        return VendorContractControlStatusEnum.n_a
    if stored_status is None:
        return VendorContractControlStatusEnum.missing
    return VendorContractControlStatusEnum(stored_status.value)


@router.get("/vendors/{vendor_id}/contract-controls", response_model=VendorContractControlsResponse)
async def get_vendor_contract_controls(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    result = await db.execute(select(VendorContractControl).where(VendorContractControl.vendor_id == vendor_id))
    stored = result.scalars().all()
    by_key = {c.control_key: c for c in stored}

    templates: list[VendorContractControlTemplate] = []
    for template_key, items in TEMPLATES.items():
        computed_items: list[VendorContractControlItem] = []
        for item in items:
            applies = bool(item["applies"](vendor))
            stored_row = by_key.get(item["control_key"])
            computed_items.append(
                VendorContractControlItem(
                    template_key=template_key,
                    control_key=item["control_key"],
                    title_key=item["title_key"],
                    description_key=item.get("description_key"),
                    applies=applies,
                    status=_compute_status(applies=applies, stored_status=stored_row.status if stored_row else None),
                    evidence_reference=stored_row.evidence_reference if stored_row else None,
                    notes=stored_row.notes if stored_row else None,
                    last_reviewed_at=stored_row.last_reviewed_at if stored_row else None,
                    reviewed_by_user_id=stored_row.reviewed_by_user_id if stored_row else None,
                )
            )

        templates.append(VendorContractControlTemplate(template_key=template_key, items=computed_items))

    return VendorContractControlsResponse(vendor_id=vendor.id, templates=templates)


@router.patch("/vendors/{vendor_id}/contract-controls", response_model=VendorContractControlsResponse)
async def update_vendor_contract_controls(
    vendor_id: int,
    payload: VendorContractControlsBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    can_write_contracts = check_permission(current_user, "vendor_contracts", "write")
    if not can_write_contracts and not is_vendor_owner(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendor_contracts:write")

    existing = (
        await db.execute(select(VendorContractControl).where(VendorContractControl.vendor_id == vendor_id))
    ).scalars().all()
    by_key = {c.control_key: c for c in existing}

    now = datetime.now(UTC)
    for update in payload.updates:
        row = by_key.get(update.control_key)
        if not row:
            row = VendorContractControl(vendor_id=vendor_id, control_key=update.control_key)
            db.add(row)
            by_key[update.control_key] = row

        row.status = VendorContractControlStatus(update.status.value)
        row.evidence_reference = update.evidence_reference
        row.notes = update.notes
        row.last_reviewed_at = now
        row.reviewed_by_user_id = current_user.id

    await db.commit()
    return await get_vendor_contract_controls(vendor_id, db=db, current_user=current_user)

