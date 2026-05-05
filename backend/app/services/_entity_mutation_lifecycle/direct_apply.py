from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.models import Control, KeyRiskIndicator, Risk, User, VendorKRILink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services._entity_mutation_lifecycle.contracts import EntityMutationOutcome
from app.services._entity_mutation_lifecycle.projection import (
    serialize_control_mutation_response,
    serialize_kri_mutation_response,
    serialize_risk_mutation_response,
)
from app.services._kri_history.value_application import visible_linked_vendors
from app.services.authorization_capabilities import control_capabilities, kri_capabilities, risk_capabilities
from app.services.kri_vendor_assignment import assign_vendors_to_kri


def risk_score_change_set(risk: Risk, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    new_gross_probability = update_data.get("gross_probability", risk.gross_probability)
    new_gross_impact = update_data.get("gross_impact", risk.gross_impact)
    new_net_probability = update_data.get("net_probability", risk.net_probability)
    new_net_impact = update_data.get("net_impact", risk.net_impact)
    extra_changes = {}
    if "gross_probability" in update_data or "gross_impact" in update_data:
        extra_changes["gross_score"] = {
            "old": risk.gross_score,
            "new": new_gross_probability * new_gross_impact,
        }
    if "net_probability" in update_data or "net_impact" in update_data:
        extra_changes["net_score"] = {
            "old": risk.net_score,
            "new": new_net_probability * new_net_impact,
        }
    return extra_changes


async def reload_risk_with_relationships(db: AsyncSession, risk_id: int) -> Risk:
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        )
        .where(Risk.id == risk_id)
    )
    return result.scalar_one()


async def reload_control_with_relationships(db: AsyncSession, control_id: int) -> Control:
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .where(Control.id == control_id)
    )
    return result.scalar_one()


async def reload_kri_with_relationships(db: AsyncSession, kri_id: int) -> KeyRiskIndicator:
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
    return result.scalar_one()


async def apply_risk_update_directly(
    db: AsyncSession,
    *,
    risk: Risk,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    extra_changes = risk_score_change_set(risk, update_data)
    changes = build_change_set(risk, update_data, extra_changes=extra_changes)

    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(risk, field, value)

    risk.gross_score = risk.gross_probability * risk.gross_impact
    risk.net_score = risk.net_probability * risk.net_impact

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=f"{risk.risk_id_code}: {risk.description[:50]}",
        safe_entity_label=risk.risk_id_code,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=risk.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(risk)

    reloaded_risk = await reload_risk_with_relationships(db, risk.id)
    now = utc_now()
    capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
    response = await serialize_risk_mutation_response(
        db,
        risk=reloaded_risk,
        now=now,
        capabilities=capabilities,
    )
    return EntityMutationOutcome(kind="applied", response=response)


async def apply_control_update_directly(
    db: AsyncSession,
    *,
    control: Control,
    update_data: dict[str, Any],
    current_user: User,
) -> EntityMutationOutcome:
    changes = build_change_set(control, update_data)

    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(control, field, value)

    control.updated_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
    )
    await db.commit()
    await db.refresh(control)

    reloaded_control = await reload_control_with_relationships(db, control.id)
    now = utc_now()
    capabilities = await control_capabilities(db, current_user=current_user, control=reloaded_control)
    response = await serialize_control_mutation_response(
        db,
        control=reloaded_control,
        now=now,
        capabilities=capabilities,
    )
    return EntityMutationOutcome(kind="applied", response=response)


async def apply_kri_update_directly(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    update_data: dict[str, Any],
    normalized_vendor_ids: list[int] | None,
    current_vendor_ids: list[int],
    current_user: User,
) -> EntityMutationOutcome:
    extra_changes = {}
    if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
        extra_changes["linked_vendor_ids"] = {"old": current_vendor_ids, "new": normalized_vendor_ids}
    changes = build_change_set(kri, update_data, extra_changes=extra_changes)

    try:
        for field, value in update_data.items():
            setattr(kri, field, value)

        if normalized_vendor_ids is not None:
            await assign_vendors_to_kri(db, kri=kri, linked_vendor_ids=normalized_vendor_ids)

        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=kri.risk.department_id,
            changes=changes,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(kri)

    reloaded_kri = await reload_kri_with_relationships(db, kri.id)
    now = utc_now()
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    response = await serialize_kri_mutation_response(
        db,
        kri=reloaded_kri,
        now=now,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )
    return EntityMutationOutcome(kind="applied", response=response)
