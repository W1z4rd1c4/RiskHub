from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from fastapi import status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.approval_helpers import (
    build_approval_queued_response,
    create_approval_request_with_audit,
    get_control_delete_approval_metadata,
    get_primary_approver_for_risk,
    get_risk_delete_approval_metadata,
)
from app.core.audit.control import control_archived
from app.core.audit.kri import kri_archived
from app.core.audit.risk import risk_archived
from app.core.datetime_utils import utc_now
from app.core.exceptions import NotFoundError
from app.core.permissions import check_department_access
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.services._authorization_capabilities import require_capability
from app.services._entity_mutation_lifecycle.contracts import EntityMutationOutcome
from app.services._entity_mutation_lifecycle.policy import assert_no_existing_pending_delete_request
from app.services._riskhub_config.approval_scenario_roles import APPROVER_ROLES
from app.services.approval_scenario_policy import (
    apply_approval_scenario_snapshot,
    approval_privilege_tier,
    load_approval_scenario_policy,
)


@dataclass(frozen=True)
class _ArchiveDetailDescriptor:
    resource_type: ApprovalResourceType
    scenario_key: str
    load_entity: Callable[[AsyncSession, int, User], Awaitable[Any]]
    archive_entity: Callable[[AsyncSession, Any, User], Awaitable[None]]
    resource_id: Callable[[Any], int]
    resource_name: Callable[[Any], str]
    request_reason: Callable[[Any, str], str]
    department_id: Callable[[Any], int | None]
    approval_metadata: Callable[[AsyncSession, Any, int], Awaitable[tuple[int | None, bool]]]
    on_duplicate_detail: str = "Deletion request already pending"


async def assert_can_request_delete_risk(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> Risk:
    require_capability(current_user, "risks", "delete")

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise NotFoundError("Risk not found")

    if risk.owner_id != current_user.id:
        check_department_access(risk.department_id, current_user)

    return risk


async def assert_can_request_delete_control(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> Control:
    require_capability(current_user, "controls", "delete")

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise NotFoundError("Control not found")

    check_department_access(control.department_id, current_user)
    return control


async def assert_can_request_delete_kri(
    db: AsyncSession,
    *,
    kri_id: int,
    current_user: User,
) -> KeyRiskIndicator:
    require_capability(current_user, "risks", "delete")

    kri = (
        await db.execute(
            select(KeyRiskIndicator)
            .join(Risk)
            .where(KeyRiskIndicator.id == kri_id)
            .options(joinedload(KeyRiskIndicator.risk))
        )
    ).scalar_one_or_none()
    if kri is None:
        raise NotFoundError("KRI not found")

    check_department_access(kri.risk.department_id, current_user)
    return kri


def _archive_state_change(old_is_archived: bool, new_is_archived: bool) -> dict[str, dict[str, object]] | None:
    if old_is_archived == new_is_archived:
        return None
    return {"is_archived": {"old": old_is_archived, "new": new_is_archived}}


async def archive_risk_no_commit(
    db: AsyncSession,
    *,
    risk: Risk,
    current_user: User,
    include_changes: bool = False,
    description: str | None = None,
) -> None:
    old_is_archived = risk.is_archived
    risk.mark_archived(current_user)
    await risk_archived(
        db,
        actor=current_user,
        risk=risk,
        changes=_archive_state_change(old_is_archived, risk.is_archived) if include_changes else None,
        description=description,
    )


async def archive_control_no_commit(
    db: AsyncSession,
    *,
    control: Control,
    current_user: User,
    include_changes: bool = False,
    description: str | None = None,
) -> None:
    old_is_archived = control.is_archived
    control.mark_archived(current_user)
    control.updated_by_id = current_user.id
    await control_archived(
        db,
        actor=current_user,
        control=control,
        changes=_archive_state_change(old_is_archived, control.is_archived) if include_changes else None,
        description=description,
    )


async def archive_kri_no_commit(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    current_user: User,
    include_changes: bool = False,
    description: str | None = None,
) -> None:
    old_is_archived = kri.is_archived
    kri.mark_archived(current_user, when=utc_now())
    await kri_archived(
        db,
        actor=current_user,
        kri=kri,
        changes=_archive_state_change(old_is_archived, kri.is_archived) if include_changes else None,
        description=description,
    )


async def _archive_risk_entity(db: AsyncSession, entity: Any, current_user: User) -> None:
    await archive_risk_no_commit(db, risk=entity, current_user=current_user)


async def _archive_control_entity(db: AsyncSession, entity: Any, current_user: User) -> None:
    await archive_control_no_commit(db, control=entity, current_user=current_user)


async def _archive_kri_entity(db: AsyncSession, entity: Any, current_user: User) -> None:
    await archive_kri_no_commit(db, kri=entity, current_user=current_user)


async def _load_risk_for_archive(db: AsyncSession, resource_id: int, current_user: User) -> Risk:
    return await assert_can_request_delete_risk(db, risk_id=resource_id, current_user=current_user)


async def _load_control_for_archive(db: AsyncSession, resource_id: int, current_user: User) -> Control:
    return await assert_can_request_delete_control(db, control_id=resource_id, current_user=current_user)


async def _load_kri_for_archive(db: AsyncSession, resource_id: int, current_user: User) -> KeyRiskIndicator:
    return await assert_can_request_delete_kri(db, kri_id=resource_id, current_user=current_user)


async def _risk_delete_metadata(db: AsyncSession, entity: Any, requester_id: int) -> tuple[int | None, bool]:
    return await get_risk_delete_approval_metadata(db, risk=entity, requester_id=requester_id)


async def _control_delete_metadata(db: AsyncSession, entity: Any, requester_id: int) -> tuple[int | None, bool]:
    return await get_control_delete_approval_metadata(db, control=entity, requester_id=requester_id)


async def _kri_delete_metadata(db: AsyncSession, entity: Any, requester_id: int) -> tuple[int | None, bool]:
    primary_approver_id = await get_primary_approver_for_risk(db, entity.risk_id, requester_id=requester_id)
    return primary_approver_id, False


def _risk_delete_reason(entity: Any, reason: str) -> str:
    desc_snippet = (
        (entity.description[:100] + "...")
        if entity.description and len(entity.description) > 100
        else (entity.description or "")
    )
    return f"{reason}\n\nDescription: {desc_snippet}" if desc_snippet else reason


def _name_snippet(value: str | None, fallback: str) -> str:
    return (value or "").strip()[:50] or fallback


_RISK_ARCHIVE_DESCRIPTOR = _ArchiveDetailDescriptor(
    resource_type=ApprovalResourceType.RISK,
    scenario_key="risk_delete",
    load_entity=_load_risk_for_archive,
    archive_entity=_archive_risk_entity,
    resource_id=lambda entity: entity.id,
    resource_name=lambda entity: entity.name,
    request_reason=_risk_delete_reason,
    department_id=lambda entity: entity.department_id,
    approval_metadata=_risk_delete_metadata,
)

_CONTROL_ARCHIVE_DESCRIPTOR = _ArchiveDetailDescriptor(
    resource_type=ApprovalResourceType.CONTROL,
    scenario_key="control_delete",
    load_entity=_load_control_for_archive,
    archive_entity=_archive_control_entity,
    resource_id=lambda entity: entity.id,
    resource_name=lambda entity: _name_snippet(entity.name, "Unknown control"),
    request_reason=lambda _entity, reason: reason,
    department_id=lambda entity: entity.department_id,
    approval_metadata=_control_delete_metadata,
)

_KRI_ARCHIVE_DESCRIPTOR = _ArchiveDetailDescriptor(
    resource_type=ApprovalResourceType.KRI,
    scenario_key="kri_delete",
    load_entity=_load_kri_for_archive,
    archive_entity=_archive_kri_entity,
    resource_id=lambda entity: entity.id,
    resource_name=lambda entity: _name_snippet(entity.metric_name, "Unknown KRI"),
    request_reason=lambda _entity, reason: reason,
    department_id=lambda entity: entity.risk.department_id,
    approval_metadata=_kri_delete_metadata,
    on_duplicate_detail="Deletion request already pending",
)


async def _archive_detail(
    *,
    db: AsyncSession,
    resource_id: int,
    reason: str,
    current_user: User,
    descriptor: _ArchiveDetailDescriptor,
) -> EntityMutationOutcome:
    entity = await descriptor.load_entity(db, resource_id, current_user)

    scenario_policy = await load_approval_scenario_policy(
        db,
        descriptor.scenario_key,
        default_roles=list(APPROVER_ROLES),
    )

    if approval_privilege_tier(current_user).is_privileged or not scenario_policy.requires_approval:
        try:
            await descriptor.archive_entity(db, entity, current_user)
            await db.commit()
        except Exception:
            # Deliberately broad: audit hooks can fail before commit; rollback keeps this request session reusable.
            await db.rollback()
            raise
        return EntityMutationOutcome(kind="applied", response=Response(status_code=status.HTTP_204_NO_CONTENT))

    entity_id = descriptor.resource_id(entity)
    await assert_no_existing_pending_delete_request(
        db,
        resource_type=descriptor.resource_type,
        resource_id=entity_id,
    )

    primary_approver_id, requires_privileged = await descriptor.approval_metadata(db, entity, current_user.id)
    from app.services._approval_queue.delete_context import (
        capture_delete_approval_context,
        serialize_delete_approval_context,
    )

    delete_context = await capture_delete_approval_context(
        db,
        resource_type=descriptor.resource_type,
        resource_id=entity_id,
    )
    approval = ApprovalRequest(
        resource_type=descriptor.resource_type,
        resource_id=entity_id,
        resource_name=descriptor.resource_name(entity),
        requested_by_id=current_user.id,
        reason=descriptor.request_reason(entity, reason),
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
        delete_context_snapshot=serialize_delete_approval_context(delete_context) if delete_context else None,
    )
    apply_approval_scenario_snapshot(approval, scenario_policy)

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=descriptor.department_id(entity),
        on_duplicate_detail=descriptor.on_duplicate_detail,
    )

    response = build_approval_queued_response(
        message="Deletion request submitted for approval",
        approval_id=approval.id,
        action_type="delete",
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    return EntityMutationOutcome(kind="approval_queued", response=response)


async def archive_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    return await _archive_detail(
        db=db,
        resource_id=risk_id,
        reason=reason,
        current_user=current_user,
        descriptor=_RISK_ARCHIVE_DESCRIPTOR,
    )


async def archive_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    return await _archive_detail(
        db=db,
        resource_id=control_id,
        reason=reason,
        current_user=current_user,
        descriptor=_CONTROL_ARCHIVE_DESCRIPTOR,
    )


async def archive_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    reason: str,
    current_user: User,
) -> EntityMutationOutcome:
    return await _archive_detail(
        db=db,
        resource_id=kri_id,
        reason=reason,
        current_user=current_user,
        descriptor=_KRI_ARCHIVE_DESCRIPTOR,
    )
