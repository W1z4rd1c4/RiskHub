from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalRequest, ApprovalResourceType, Control, ControlRiskLink, KeyRiskIndicator, Risk

DELETE_APPROVAL_CONTEXT_VERSION = 1


@dataclass(frozen=True)
class DeleteApprovalContext:
    version: int
    resource_type: ApprovalResourceType
    resource_id: int
    context: dict[str, Any]


@dataclass(frozen=True)
class DeleteApprovalContextComparison:
    is_valid: bool
    reason_codes: tuple[str, ...] = ()


def serialize_delete_approval_context(context: DeleteApprovalContext) -> dict[str, Any]:
    return {
        "version": context.version,
        "resource_type": context.resource_type.value,
        "resource_id": context.resource_id,
        "context": context.context,
    }


def deserialize_delete_approval_context(payload: dict[str, Any] | None) -> DeleteApprovalContext | None:
    if not payload:
        return None
    try:
        resource_type = ApprovalResourceType(payload["resource_type"])
        return DeleteApprovalContext(
            version=int(payload["version"]),
            resource_type=resource_type,
            resource_id=int(payload["resource_id"]),
            context=dict(payload["context"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


async def capture_delete_approval_context(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
) -> DeleteApprovalContext | None:
    if resource_type == ApprovalResourceType.RISK:
        return await _capture_risk_context(db, risk_id=resource_id)
    if resource_type == ApprovalResourceType.CONTROL:
        return await _capture_control_context(db, control_id=resource_id)
    if resource_type == ApprovalResourceType.KRI:
        return await _capture_kri_context(db, kri_id=resource_id)
    return None


async def compare_delete_approval_context(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
) -> DeleteApprovalContextComparison:
    expected = deserialize_delete_approval_context(approval.delete_context_snapshot)
    if expected is None:
        return DeleteApprovalContextComparison(is_valid=False, reason_codes=("snapshot_missing",))
    if expected.version != DELETE_APPROVAL_CONTEXT_VERSION:
        return DeleteApprovalContextComparison(is_valid=False, reason_codes=("snapshot_version_unsupported",))
    if expected.resource_type != approval.resource_type or expected.resource_id != approval.resource_id:
        return DeleteApprovalContextComparison(is_valid=False, reason_codes=("snapshot_target_mismatch",))

    current = await capture_delete_approval_context(
        db,
        resource_type=approval.resource_type,
        resource_id=approval.resource_id,
    )
    if current is None:
        return DeleteApprovalContextComparison(is_valid=False, reason_codes=("target_missing",))

    reason_codes = _context_drift_reason_codes(expected, current)
    return DeleteApprovalContextComparison(is_valid=not reason_codes, reason_codes=tuple(reason_codes))


async def _capture_risk_context(db: AsyncSession, *, risk_id: int) -> DeleteApprovalContext | None:
    risk = await db.get(Risk, risk_id)
    if risk is None:
        return None
    return DeleteApprovalContext(
        version=DELETE_APPROVAL_CONTEXT_VERSION,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        context={
            "owner_id": risk.owner_id,
            "department_id": risk.department_id,
        },
    )


async def _capture_control_context(db: AsyncSession, *, control_id: int) -> DeleteApprovalContext | None:
    control = await db.get(Control, control_id)
    if control is None:
        return None
    risk_ids = (
        await db.execute(
            select(ControlRiskLink.risk_id)
            .where(ControlRiskLink.control_id == control.id)
            .order_by(ControlRiskLink.risk_id)
        )
    ).scalars()
    return DeleteApprovalContext(
        version=DELETE_APPROVAL_CONTEXT_VERSION,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        context={
            "control_owner_id": control.control_owner_id,
            "department_id": control.department_id,
            "risk_ids": list(risk_ids),
        },
    )


async def _capture_kri_context(db: AsyncSession, *, kri_id: int) -> DeleteApprovalContext | None:
    kri = await db.get(KeyRiskIndicator, kri_id)
    if kri is None:
        return None
    parent_risk = await db.get(Risk, kri.risk_id)
    return DeleteApprovalContext(
        version=DELETE_APPROVAL_CONTEXT_VERSION,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        context={
            "risk_id": kri.risk_id,
            "risk_owner_id": parent_risk.owner_id if parent_risk else None,
            "risk_department_id": parent_risk.department_id if parent_risk else None,
            "reporting_owner_id": kri.reporting_owner_id,
        },
    )


def _context_drift_reason_codes(
    expected: DeleteApprovalContext,
    current: DeleteApprovalContext,
) -> list[str]:
    if expected.resource_type == ApprovalResourceType.RISK:
        return _changed_fields(
            expected.context,
            current.context,
            {
                "owner_id": "owner_changed",
                "department_id": "department_changed",
            },
        )
    if expected.resource_type == ApprovalResourceType.CONTROL:
        return _changed_fields(
            expected.context,
            current.context,
            {
                "control_owner_id": "owner_changed",
                "department_id": "department_changed",
                "risk_ids": "linkage_changed",
            },
        )
    if expected.resource_type == ApprovalResourceType.KRI:
        return _changed_fields(
            expected.context,
            current.context,
            {
                "risk_id": "parent_risk_changed",
                "risk_owner_id": "parent_risk_owner_changed",
                "risk_department_id": "parent_risk_department_changed",
                "reporting_owner_id": "reporting_owner_changed",
            },
        )
    return ["resource_type_unsupported"]


def _changed_fields(
    expected: dict[str, Any],
    current: dict[str, Any],
    reason_by_field: dict[str, str],
) -> list[str]:
    return [reason for field, reason in reason_by_field.items() if expected.get(field) != current.get(field)]
