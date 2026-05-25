from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.audit.control import control_created, control_restored
from app.core.audit.kri import kri_created, kri_restored
from app.core.audit.risk import risk_created, risk_restored
from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ServiceFailure, ValidationError
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import can_access_department_id
from app.core.user_query_options import user_selectinload_options
from app.models import Control, KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.control import ControlCreate, ControlRead
from app.schemas.kri import KRICreate, KRIResponse
from app.schemas.risk import RiskCreate, RiskRead
from app.services import risk_identifier
from app.services._entity_mutation_lifecycle.approval_plans import (
    create_control_edit_approval_if_required,
    create_kri_edit_approval_if_required,
    create_risk_edit_approval_if_required,
)
from app.services._entity_mutation_lifecycle.archive_plans import (
    archive_control_detail,
    archive_kri_detail,
    archive_risk_detail,
)
from app.services._entity_mutation_lifecycle.contracts import (
    EntityMutationKind,
    EntityMutationOutcome,
)
from app.services._entity_mutation_lifecycle.direct_apply import (
    apply_control_update_directly,
    apply_kri_update_directly,
    apply_risk_update_directly,
    reload_control_with_relationships,
    reload_kri_with_relationships,
    reload_risk_with_relationships,
)
from app.services._entity_mutation_lifecycle.policy import (
    prepare_control_update,
    prepare_kri_update,
    prepare_risk_update,
    validate_risk_type,
)
from app.services._entity_mutation_lifecycle.projection import (
    serialize_control_mutation_response,
    serialize_kri_mutation_response,
    serialize_risk_mutation_response,
)
from app.services._kri_history.direct_application import visible_linked_vendors
from app.services._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_read,
    serialize_kri_response,
    serialize_risk_read,
)
from app.services._vendor_links.kri_bridge import assign_vendors_to_kri, validate_assignable_vendors
from app.services.authorization_capabilities import control_capabilities, kri_capabilities, risk_capabilities
from app.services.transaction_boundary import commit_service_boundary


def _ensure_department_access(
    department_id: int | None,
    current_user: User,
    *,
    not_found_detail: str | None = None,
) -> None:
    if can_access_department_id(current_user, department_id):
        return
    if not_found_detail is not None:
        raise NotFoundError(not_found_detail)
    if department_id is None:
        raise AuthorizationError("Access denied to unassigned items")
    raise AuthorizationError("Access denied to this department's resources")


async def _reload_user_for_capabilities(db: AsyncSession, user_id: int) -> User:
    query = select(User).options(*user_selectinload_options(include_permissions=True)).where(User.id == user_id)
    return (
        await db.execute(query)
    ).scalar_one()


async def create_risk_detail(
    *,
    db: AsyncSession,
    risk_data: RiskCreate,
    current_user: User,
) -> RiskRead:
    _ensure_department_access(risk_data.department_id, current_user)
    await validate_risk_type(db, risk_data.risk_type)
    await validate_active_owner_reference(db, user_id=risk_data.owner_id, label="Risk owner")

    current_user_id = current_user.id
    risk_id_code = risk_data.risk_id_code
    auto_generated = not risk_id_code

    max_retries = 5
    for attempt in range(max_retries):
        try:
            if auto_generated:
                risk_id_code = await risk_identifier.generate_risk_id_code(db, risk_data.process)

            risk = Risk(
                risk_id_code=risk_id_code,
                name=risk_data.name,
                process=risk_data.process,
                subprocess=risk_data.subprocess,
                risk_type=risk_data.risk_type,
                category=risk_data.category,
                description=risk_data.description,
                department_id=risk_data.department_id,
                owner_id=risk_data.owner_id,
                gross_probability=risk_data.gross_probability,
                gross_impact=risk_data.gross_impact,
                gross_score=risk_data.gross_probability * risk_data.gross_impact,
                net_probability=risk_data.net_probability,
                net_impact=risk_data.net_impact,
                net_score=risk_data.net_probability * risk_data.net_impact,
                status=risk_data.status.value,
                is_priority=risk_data.is_priority,
            )

            db.add(risk)
            await db.flush()

            await risk_created(db, actor=current_user, risk=risk)
            await commit_service_boundary(db, boundary="entity_mutation.create_risk")

            reloaded_risk = await reload_risk_with_relationships(db, risk.id)
            now = utc_now()
            capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
            return await serialize_risk_mutation_response(
                db,
                risk=reloaded_risk,
                now=now,
                capabilities=capabilities,
            )
        except IntegrityError:
            await db.rollback()
            if not auto_generated:
                raise ConflictError(f"Risk ID '{risk_id_code}' already exists")
            if attempt < max_retries - 1:
                current_user = await _reload_user_for_capabilities(db, current_user_id)
                continue

    raise ServiceFailure(
        "Could not generate unique Risk ID after retries. Please try again.",
        status_code=503,
    )


async def create_control_detail(
    *,
    db: AsyncSession,
    control_data: ControlCreate,
    current_user: User,
) -> ControlRead:
    _ensure_department_access(control_data.department_id, current_user)
    await validate_active_owner_reference(db, user_id=control_data.control_owner_id, label="Control owner")

    control = Control(
        name=control_data.name,
        description=control_data.description,
        data_source=control_data.data_source,
        methodology_reference=control_data.methodology_reference,
        control_form=control_data.control_form.value,
        process_owner_position=control_data.process_owner_position,
        control_owner_id=control_data.control_owner_id,
        executor_position=control_data.executor_position,
        frequency=control_data.frequency.value,
        risk_level=control_data.risk_level,
        output_description=control_data.output_description,
        report_recipient=control_data.report_recipient,
        documentation_location=control_data.documentation_location,
        department_id=control_data.department_id,
        status=control_data.status.value,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )

    db.add(control)
    await db.flush()
    await control_created(db, actor=current_user, control=control)
    await commit_service_boundary(db, boundary="entity_mutation.create_control")

    reloaded_control = await reload_control_with_relationships(db, control.id)
    now = utc_now()
    capabilities = await control_capabilities(db, current_user=current_user, control=reloaded_control)
    return await serialize_control_mutation_response(
        db,
        control=reloaded_control,
        now=now,
        capabilities=capabilities,
    )


async def create_kri_detail(
    *,
    db: AsyncSession,
    data: KRICreate,
    current_user: User,
) -> KRIResponse:
    linked_vendor_ids = data.linked_vendor_ids
    ensure_parent_risk_vendor_ids = data.ensure_parent_risk_vendor_ids

    risk = (await db.execute(select(Risk).where(Risk.id == data.risk_id))).scalar_one_or_none()
    if not risk:
        raise NotFoundError("Risk not found")

    _ensure_department_access(risk.department_id, current_user)
    if data.lower_limit >= data.upper_limit:
        raise ValidationError("lower_limit must be less than upper_limit")
    await validate_active_owner_reference(db, user_id=data.reporting_owner_id, label="Reporting owner")
    await validate_assignable_vendors(
        db,
        current_user=current_user,
        vendor_ids=[*linked_vendor_ids, *ensure_parent_risk_vendor_ids],
    )

    try:
        kri = KeyRiskIndicator(**data.model_dump(exclude={"linked_vendor_ids", "ensure_parent_risk_vendor_ids"}))
        db.add(kri)
        await db.flush()

        await assign_vendors_to_kri(
            db,
            kri=kri,
            current_user=current_user,
            linked_vendor_ids=linked_vendor_ids,
            ensure_parent_risk_vendor_ids=ensure_parent_risk_vendor_ids,
        )

        await kri_created(db, actor=current_user, kri=kri)
        await commit_service_boundary(db, boundary="entity_mutation.create_kri")
    except Exception:
        await db.rollback()
        raise

    reloaded_kri = await reload_kri_with_relationships(db, kri.id)
    now = utc_now()
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    return await serialize_kri_mutation_response(
        db,
        kri=reloaded_kri,
        now=now,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )


async def update_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    risk = await prepare_risk_update(db, risk_id=risk_id, update_data=update_data, current_user=current_user)
    approval_outcome = await create_risk_edit_approval_if_required(
        db,
        risk=risk,
        update_data=update_data,
        current_user=current_user,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_risk_update_directly(db, risk=risk, update_data=update_data, current_user=current_user)


async def update_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    control, is_owner = await prepare_control_update(
        db,
        control_id=control_id,
        update_data=update_data,
        current_user=current_user,
    )
    approval_outcome = await create_control_edit_approval_if_required(
        db,
        control=control,
        current_user=current_user,
        update_data=update_data,
        is_owner=is_owner,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_control_update_directly(db, control=control, update_data=update_data, current_user=current_user)


async def update_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    kri, normalized_vendor_ids, current_vendor_ids = await prepare_kri_update(
        db,
        kri_id=kri_id,
        update_data=update_data,
        current_user=current_user,
    )
    approval_outcome = await create_kri_edit_approval_if_required(
        db,
        kri=kri,
        update_data=update_data,
        normalized_vendor_ids=normalized_vendor_ids,
        current_vendor_ids=current_vendor_ids,
        current_user=current_user,
    )
    if approval_outcome is not None:
        return approval_outcome
    return await apply_kri_update_directly(
        db,
        kri=kri,
        update_data=update_data,
        normalized_vendor_ids=normalized_vendor_ids,
        current_vendor_ids=current_vendor_ids,
        current_user=current_user,
    )


async def restore_risk_detail(
    *,
    db: AsyncSession,
    risk_id: int,
    current_user: User,
) -> RiskRead:
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise NotFoundError("Risk not found")

    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        _ensure_department_access(risk.department_id, current_user)
    if not risk.is_archived:
        raise ValidationError("Risk is not archived")

    before_data = {
        "is_archived": risk.is_archived,
        "archived_at": risk.archived_at,
        "archived_by_id": risk.archived_by_id,
    }
    risk.mark_restored(current_user)
    after_data = {
        "is_archived": risk.is_archived,
        "archived_at": risk.archived_at,
        "archived_by_id": risk.archived_by_id,
    }

    await risk_restored(db, actor=current_user, risk=risk, before_data=before_data, after_data=after_data)
    await commit_service_boundary(db, boundary="entity_mutation.restore_risk")

    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk.id)
    )
    reloaded_risk = result.scalar_one()
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
    return serialize_risk_read(reloaded_risk, monitoring_context, capabilities=capabilities)


async def restore_control_detail(
    *,
    db: AsyncSession,
    control_id: int,
    current_user: User,
) -> ControlRead:
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise NotFoundError("Control not found")

    _ensure_department_access(control.department_id, current_user, not_found_detail="Control not found")

    if not control.is_archived:
        raise ValidationError("Control is not archived")

    before_data = {
        "is_archived": control.is_archived,
        "archived_at": control.archived_at,
        "archived_by_id": control.archived_by_id,
        "updated_by_id": control.updated_by_id,
    }
    control.mark_restored(current_user)
    control.updated_by_id = current_user.id
    after_data = {
        "is_archived": control.is_archived,
        "archived_at": control.archived_at,
        "archived_by_id": control.archived_by_id,
        "updated_by_id": control.updated_by_id,
    }

    await control_restored(db, actor=current_user, control=control, before_data=before_data, after_data=after_data)
    await commit_service_boundary(db, boundary="entity_mutation.restore_control")

    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control.id)
    )
    reloaded_control = result.scalar_one()
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await control_capabilities(db, current_user=current_user, control=reloaded_control)
    return serialize_control_read(reloaded_control, monitoring_context, capabilities=capabilities)


async def restore_kri_detail(
    *,
    db: AsyncSession,
    kri_id: int,
    current_user: User,
) -> KRIResponse:
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    kri = result.scalar_one_or_none()
    if not kri:
        raise NotFoundError("KRI not found")

    _ensure_department_access(kri.risk.department_id, current_user)
    if not kri.is_archived:
        raise ValidationError("KRI is not archived")

    before_data = {
        "is_archived": kri.is_archived,
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
    }
    kri.mark_restored(current_user)
    after_data = {
        "is_archived": kri.is_archived,
        "archived_at": kri.archived_at,
        "archived_by_id": kri.archived_by_id,
    }

    await kri_restored(db, actor=current_user, kri=kri, before_data=before_data, after_data=after_data)
    await commit_service_boundary(db, boundary="entity_mutation.restore_kri")

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri.id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    reloaded_kri = result.scalar_one()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    return serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )


__all__ = [
    "EntityMutationKind",
    "EntityMutationOutcome",
    "archive_control_detail",
    "archive_kri_detail",
    "archive_risk_detail",
    "restore_control_detail",
    "restore_kri_detail",
    "restore_risk_detail",
    "update_control_detail",
    "update_kri_detail",
    "update_risk_detail",
]
