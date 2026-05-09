from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.risk import Risk


@dataclass(frozen=True)
class OrphanItemDefinition:
    item_type: str
    unknown_label: str
    requires_owner: bool
    requires_risk: bool
    requires_department: bool


@dataclass(frozen=True)
class OrphanDetectionPlan:
    item_type: str
    item_id: int
    previous_owner_id: int
    reason: str
    dedupe_status: str = "pending"


@dataclass(frozen=True)
class OrphanResolutionPlan:
    item_type: str
    requires_owner: bool
    requires_risk: bool
    requires_department: bool


@dataclass(frozen=True)
class OrphanDisplayProjection:
    item_name: str
    item_description: str | None
    item_identifier: str | None
    department_name: str | None


ORPHAN_ITEM_DEFINITIONS: dict[str, OrphanItemDefinition] = {
    "risk": OrphanItemDefinition(
        item_type="risk",
        unknown_label="Unknown risk",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "control": OrphanItemDefinition(
        item_type="control",
        unknown_label="Unknown control",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "kri": OrphanItemDefinition(
        item_type="kri",
        unknown_label="Unknown KRI",
        requires_owner=False,
        requires_risk=True,
        requires_department=False,
    ),
}


def orphan_item_definition(item_type: str) -> OrphanItemDefinition:
    try:
        return ORPHAN_ITEM_DEFINITIONS[item_type]
    except KeyError as exc:
        raise ValueError(f"Unsupported orphaned item type: {item_type}") from exc


def orphan_resolution_plan(item_type: str) -> OrphanResolutionPlan:
    definition = orphan_item_definition(item_type)
    return OrphanResolutionPlan(
        item_type=definition.item_type,
        requires_owner=definition.requires_owner,
        requires_risk=definition.requires_risk,
        requires_department=definition.requires_department,
    )


def orphan_resolution_requirements(item_type: str) -> dict[str, bool]:
    plan = orphan_resolution_plan(item_type)
    return {
        "requires_owner": plan.requires_owner,
        "requires_risk": plan.requires_risk,
        "requires_department": plan.requires_department,
    }


def orphan_capability_flags(item_type: str, *, is_pending: bool) -> dict[str, bool]:
    definition = orphan_item_definition(item_type)
    return {
        "can_resolve": is_pending,
        "can_view_detail": True,
        "requires_owner": definition.requires_owner,
        "requires_risk": definition.requires_risk,
        "requires_department": definition.requires_department,
    }


async def load_orphan_display_projection(
    db: AsyncSession,
    item_type: str,
    item_id: int,
) -> OrphanDisplayProjection:
    definition = orphan_item_definition(item_type)
    if item_type == "risk":
        risk_result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == item_id))
        risk = risk_result.scalar_one_or_none()
        if risk is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=risk.name or definition.unknown_label,
            item_description=risk.description,
            item_identifier=risk.risk_id_code,
            department_name=risk.department.name if risk.department else None,
        )

    if item_type == "control":
        control_result = await db.execute(
            select(Control).options(selectinload(Control.department)).where(Control.id == item_id)
        )
        control = control_result.scalar_one_or_none()
        if control is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=control.name or definition.unknown_label,
            item_description=control.description,
            item_identifier=None,
            department_name=control.department.name if control.department else None,
        )

    kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == item_id))
    kri = kri_result.scalar_one_or_none()
    if kri is None:
        return _unknown_projection(definition)
    risk_result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == kri.risk_id))
    risk = risk_result.scalar_one_or_none()
    return OrphanDisplayProjection(
        item_name=kri.metric_name or definition.unknown_label,
        item_description=kri.description,
        item_identifier=None,
        department_name=risk.department.name if risk and risk.department else None,
    )


def _unknown_projection(definition: OrphanItemDefinition) -> OrphanDisplayProjection:
    return OrphanDisplayProjection(
        item_name=definition.unknown_label,
        item_description=None,
        item_identifier=None,
        department_name=None,
    )
